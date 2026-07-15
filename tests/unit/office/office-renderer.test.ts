import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { OfficeService } from '../../../src/renderer/src/services/office'
import { createOfficeStore } from '../../../src/renderer/src/stores/office'
import { buildOfficePreviewUrl, getOfficeErrorCopy, OfficePreviewFrame } from '../../../src/renderer/src/components/office/OfficePreviewFrame'
import { visibleOfficeFileState } from '../../../src/renderer/src/components/office/OfficeFileList'
import { canPasteOfficePrompt, isOfficePromptContextCurrent, type OfficePromptContext } from '../../../src/renderer/src/components/office/OfficePromptPreview'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
function mockService(overrides: Partial<OfficeService> = {}): OfficeService {
  return { detect: vi.fn(), listFiles: vi.fn(), startPreview: vi.fn(), stopPreview: vi.fn(async () => ({ ok: true, value: null })), reloadPreview: vi.fn(), buildPrompt: vi.fn(), onFilesChanged: vi.fn(() => () => {}), onWatchEvicted: vi.fn(() => () => {}), ...overrides } as OfficeService
}

describe('Office renderer lifecycle', () => {
  it('deduplicates a pending workspace and path open', async () => {
    const start = deferred<any>()
    const service = mockService({ startPreview: vi.fn(() => start.promise) })
    const store = createOfficeStore(service)
    const first = store.getState().openPreview('workspace', 'deck.pptx')
    const second = store.getState().openPreview('workspace', 'deck.pptx')
    expect(service.startPreview).toHaveBeenCalledTimes(1)
    start.resolve({ ok: true, value: { previewLeaseId: 'lease-1', port: 4123, relPath: 'deck.pptx' } })
    await Promise.all([first, second])
    expect(store.getState().tabs).toHaveLength(1)
    expect(store.getState().tabs[0]).toMatchObject({ status: 'ready', previewLeaseId: 'lease-1', port: 4123 })
  })
  it('stops a start lease that resolves after workspace release', async () => {
    const start = deferred<any>()
    const service = mockService({ startPreview: vi.fn(() => start.promise) })
    const store = createOfficeStore(service)
    const opening = store.getState().openPreview('workspace', 'book.xlsx')
    await store.getState().releaseWorkspace('workspace')
    start.resolve({ ok: true, value: { previewLeaseId: 'stale', port: 5000, relPath: 'book.xlsx' } })
    await opening
    expect(store.getState().tabs).toHaveLength(0)
    expect(service.stopPreview).toHaveBeenCalledWith({ workspaceId: 'workspace', relPath: 'book.xlsx', previewLeaseId: 'stale' })
  })
  it('does not let a closed request take over a reopened tab', async () => {
    const firstStart = deferred<any>()
    const secondStart = deferred<any>()
    const service = mockService({ startPreview: vi.fn().mockReturnValueOnce(firstStart.promise).mockReturnValueOnce(secondStart.promise) })
    const store = createOfficeStore(service)
    const first = store.getState().openPreview('workspace', 'deck.pptx')
    await store.getState().closeTab(store.getState().tabs[0].tabId)
    const second = store.getState().openPreview('workspace', 'deck.pptx')
    firstStart.resolve({ ok: true, value: { previewLeaseId: 'stale', port: 4000, relPath: 'deck.pptx' } })
    secondStart.resolve({ ok: true, value: { previewLeaseId: 'current', port: 4001, relPath: 'deck.pptx' } })
    await Promise.all([first, second])
    expect(service.stopPreview).toHaveBeenCalledWith({ workspaceId: 'workspace', relPath: 'deck.pptx', previewLeaseId: 'stale' })
    expect(store.getState().tabs[0]).toMatchObject({ previewLeaseId: 'current', port: 4001 })
  })
  it('stops stale reload success', async () => {
    const reload = deferred<any>()
    const service = mockService({ startPreview: vi.fn(async () => ({ ok: true, value: { previewLeaseId: 'old', port: 4000, relPath: 'doc.docx' } })), reloadPreview: vi.fn(() => reload.promise) })
    const store = createOfficeStore(service)
    await store.getState().openPreview('workspace', 'doc.docx')
    const reloading = store.getState().reloadTab(store.getState().tabs[0].tabId)
    await store.getState().releaseWorkspace('workspace')
    reload.resolve({ ok: true, value: { previewLeaseId: 'new', port: 4001, relPath: 'doc.docx' } })
    await reloading
    expect(service.stopPreview).toHaveBeenCalledWith({ workspaceId: 'workspace', relPath: 'doc.docx', previewLeaseId: 'new' })
  })
  it('gates overlapping reloads and ignores a stale failure after release', async () => {
    const reload = deferred<any>()
    const service = mockService({
      startPreview: vi.fn(async () => ({ ok: true, value: { previewLeaseId: 'old', port: 4000, relPath: 'doc.docx' } })),
      reloadPreview: vi.fn(() => reload.promise),
    })
    const store = createOfficeStore(service)
    await store.getState().openPreview('workspace', 'doc.docx')
    const tabId = store.getState().tabs[0].tabId
    const first = store.getState().reloadTab(tabId)
    const overlapping = store.getState().reloadTab(tabId)
    expect(service.reloadPreview).toHaveBeenCalledTimes(1)
    await overlapping
    await store.getState().releaseWorkspace('workspace')
    reload.resolve({ ok: false, error: { code: 'PORT_TIMEOUT', message: 'ignored' } })
    await first
    expect(store.getState().tabs).toHaveLength(0)
  })
  it('cleans UI and records rejected stop requests', async () => {
    const report = vi.fn()
    const service = mockService({
      startPreview: vi.fn(async () => ({ ok: true, value: { previewLeaseId: 'lease', port: 4000, relPath: 'doc.docx' } })),
      stopPreview: vi.fn(async () => { throw new Error('transport failed') }),
    })
    const store = createOfficeStore(service, report)
    await store.getState().openPreview('workspace', 'doc.docx')
    await store.getState().closeTab(store.getState().tabs[0].tabId)
    expect(store.getState().tabs).toHaveLength(0)
    expect(report).toHaveBeenCalledWith('[office] Failed to stop preview lease', expect.any(Error))
  })
  it('removes only the lease targeted by a crash eviction', async () => {
    const service = mockService({ startPreview: vi.fn()
      .mockResolvedValueOnce({ ok: true, value: { previewLeaseId: 'one', port: 4000, relPath: 'one.docx' } })
      .mockResolvedValueOnce({ ok: true, value: { previewLeaseId: 'two', port: 4001, relPath: 'two.docx' } }) })
    const store = createOfficeStore(service)
    await store.getState().openPreview('workspace', 'one.docx')
    await store.getState().openPreview('workspace', 'two.docx')
    store.getState().handleEvicted(['one'], 'crashed')
    expect(store.getState().tabs.find((tab) => tab.relPath === 'one.docx')).toMatchObject({ status: 'error', errorCode: 'START_FAILED' })
    expect(store.getState().tabs.find((tab) => tab.relPath === 'two.docx')).toMatchObject({ status: 'ready' })
  })
  it('never exposes prior workspace entries or errors under a new workspace', () => {
    const previous = { workspaceId: 'old', entries: [{ relPath: 'old.docx', ext: '.docx' as const, size: 1, mtimeMs: 1 }], errorCode: 'IO' as const }
    expect(visibleOfficeFileState(previous, 'new')).toEqual({ workspaceId: 'new', entries: [] })
  })
  it('binds prompt paste to the captured workspace, file, terminal, and preset', () => {
    const context: OfficePromptContext = { requestId: 1, workspaceId: 'workspace', relPath: 'doc.docx', terminalId: 'terminal', terminalPreset: 'codex' }
    const terminal = { id: 'terminal', workspaceId: 'workspace', preset: 'codex', status: 'running', name: '', cwd: '', shell: '', pid: 1 } as const
    expect(isOfficePromptContextCurrent(context, 'workspace', 'doc.docx', terminal)).toBe(true)
    expect(canPasteOfficePrompt(context, terminal)).toBe(true)
    expect(isOfficePromptContextCurrent(context, 'workspace', 'other.docx', terminal)).toBe(false)
    expect(canPasteOfficePrompt(context, { ...terminal, id: 'other' })).toBe(false)
    expect(canPasteOfficePrompt(context, { ...terminal, status: 'exited' })).toBe(false)
    expect(canPasteOfficePrompt({ ...context, terminalId: null, terminalPreset: 'shell' }, null)).toBe(false)
  })
  it('uses validated loopback ports and the minimal iframe policy', () => {
    expect(buildOfficePreviewUrl(65535)).toBe('http://127.0.0.1:65535/')
    expect(buildOfficePreviewUrl(0)).toBeNull()
    expect(buildOfficePreviewUrl(1.5)).toBeNull()
    const markup = renderToStaticMarkup(createElement(OfficePreviewFrame, { port: 4123, status: 'ready', onRetry: () => {}, onClose: () => {} }))
    expect(markup).toContain('src="http://127.0.0.1:4123/"')
    expect(markup).toContain('sandbox="allow-scripts allow-same-origin"')
    expect(markup).toContain('referrerPolicy="no-referrer"')
    expect(markup).not.toContain('allow-popups')
    expect(markup).not.toContain('top-navigation')
  })
  it('renders stable error copy from the shared code', () => {
    const markup = renderToStaticMarkup(createElement(OfficePreviewFrame, { status: 'error', errorCode: 'TOO_MANY', onRetry: () => {}, onClose: () => {} }))
    expect(markup).toContain('已打开过多预览')
  })
  it('renders concrete locked manual-install metadata', () => {
    const copy = getOfficeErrorCopy('NOT_INSTALLED', {
      repository: 'repo',
      release: 'https://example.test/releases/v1.2.3',
      targetVersion: '1.2.3',
      integrity: 'sha256-test',
      windows: ['download', 'verify'],
      automaticInstallEnabled: false,
      automaticUninstallEnabled: false,
    })
    expect(copy).toContain('1.2.3')
    expect(copy).toContain('https://example.test/releases/v1.2.3')
    expect(copy).toContain('手动安装')
    expect(copy).toContain('download；verify')
  })
  it('shows Office in the collapsed Panel label', () => {
    const source = readFileSync(new URL('../../../src/renderer/src/components/Panel.tsx', import.meta.url), 'utf8')
    expect(source).toContain("activeView === 'office' ? 'Office'")
  })
})
