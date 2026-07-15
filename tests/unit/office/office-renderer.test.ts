import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { OfficeService } from '../../../src/renderer/src/services/office'
import { createOfficeStore } from '../../../src/renderer/src/stores/office'
import { buildOfficePreviewUrl, getOfficeErrorCopy, OfficePreviewFrame } from '../../../src/renderer/src/components/office/OfficePreviewFrame'
import { visibleOfficeFileState } from '../../../src/renderer/src/components/office/OfficeFileList'
import { canPasteOfficePrompt, isOfficePromptContextCurrent, type OfficePromptContext } from '../../../src/renderer/src/components/office/OfficePromptPreview'
import { startOfficeDiscovery } from '../../../src/renderer/src/components/office/officeDiscovery'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
function mockService(overrides: Partial<OfficeService> = {}): OfficeService {
  return { detect: vi.fn(), listFiles: vi.fn(), startPreview: vi.fn(), stopPreview: vi.fn(async () => ({ ok: true, value: null })), reloadPreview: vi.fn(), buildPrompt: vi.fn(), onFilesChanged: vi.fn(() => () => {}), onWatchEvicted: vi.fn(() => () => {}), ...overrides } as OfficeService
}

describe('Office renderer lifecycle', () => {
  it('notifies an initialization-time addition exactly once across catch-up and queued snapshots', async () => {
    const baseline = deferred<any>()
    const catchup = deferred<any>()
    let listener: ((event: any) => void) | undefined
    const existing = { relPath: 'existing.docx', ext: '.docx' as const, size: 1, mtimeMs: 1 }
    const added = { relPath: 'deck.pptx', ext: '.pptx' as const, size: 2, mtimeMs: 2 }
    const service = mockService({
      listFiles: vi.fn().mockReturnValueOnce(baseline.promise).mockReturnValueOnce(catchup.promise),
      onFilesChanged: vi.fn((callback) => { listener = callback; return vi.fn() }),
    })
    const store = createOfficeStore(service)
    let noticeCount = 0
    let previousNotice = store.getState().artifactNotice
    const unsubscribeStore = store.subscribe((state) => {
      if (state.artifactNotice && state.artifactNotice !== previousNotice) noticeCount += 1
      previousNotice = state.artifactNotice
    })
    const stop = startOfficeDiscovery('workspace', service, {
      initialize: (entries) => store.getState().initializeArtifacts('workspace', entries),
      reconcile: (entries) => store.getState().reconcileArtifacts('workspace', entries),
      isCurrent: () => true,
    })

    baseline.resolve({ ok: true, value: [existing] })
    await vi.waitFor(() => expect(service.listFiles).toHaveBeenCalledTimes(2))
    expect(store.getState().artifactNotice).toBeNull()
    expect(listener).toBeTypeOf('function')
    listener?.({ workspaceId: 'workspace', entries: [added, existing], reason: 'watch' })
    catchup.resolve({ ok: true, value: [added, existing] })
    await vi.waitFor(() => {
      expect(store.getState().artifactNotice).toEqual({ workspaceId: 'workspace', entry: added })
    })
    expect(noticeCount).toBe(1)
    unsubscribeStore()
    stop()
  })

  it('drops late baseline, catch-up, and event publications after a workspace switch', async () => {
    const lateBaseline = deferred<any>()
    const baselineService = mockService({ listFiles: vi.fn(() => lateBaseline.promise) })
    const baselineStore = createOfficeStore(baselineService)
    const stopBaseline = startOfficeDiscovery('old', baselineService, {
      initialize: (entries) => baselineStore.getState().initializeArtifacts('old', entries),
      reconcile: (entries) => baselineStore.getState().reconcileArtifacts('old', entries),
      isCurrent: () => false,
    })
    stopBaseline()
    lateBaseline.resolve({ ok: true, value: [{ relPath: 'late.docx', ext: '.docx', size: 1, mtimeMs: 1 }] })
    await Promise.resolve()
    expect(baselineStore.getState().artifactsByWorkspace.old).toBeUndefined()

    const catchup = deferred<any>()
    let listener: ((event: any) => void) | undefined
    let current = true
    const service = mockService({
      listFiles: vi.fn()
        .mockResolvedValueOnce({ ok: true, value: [] })
        .mockReturnValueOnce(catchup.promise),
      onFilesChanged: vi.fn((callback) => { listener = callback; return vi.fn() }),
    })
    const store = createOfficeStore(service)
    const stop = startOfficeDiscovery('old', service, {
      initialize: (entries) => store.getState().initializeArtifacts('old', entries),
      reconcile: (entries) => store.getState().reconcileArtifacts('old', entries),
      isCurrent: () => current,
    })
    await vi.waitFor(() => expect(service.listFiles).toHaveBeenCalledTimes(2))
    expect(listener).toBeTypeOf('function')
    current = false
    stop()
    store.getState().clearWorkspaceUi('old')
    listener?.({ workspaceId: 'old', entries: [{ relPath: 'event.docx', ext: '.docx', size: 1, mtimeMs: 2 }], reason: 'watch' })
    catchup.resolve({ ok: true, value: [{ relPath: 'catchup.docx', ext: '.docx', size: 1, mtimeMs: 3 }] })
    await Promise.resolve()
    await Promise.resolve()
    expect(store.getState().artifactsByWorkspace.old).toBeUndefined()
    expect(store.getState().artifactNotice).toBeNull()
  })

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
  it('baselines existing artifacts and notifies only newly added paths', () => {
    const store = createOfficeStore(mockService())
    const existing = { relPath: 'existing.docx', ext: '.docx' as const, size: 1, mtimeMs: 1 }
    store.getState().initializeArtifacts('workspace', [existing])
    expect(store.getState().artifactNotice).toBeNull()

    store.getState().reconcileArtifacts('workspace', [{ ...existing, mtimeMs: 2 }])
    expect(store.getState().artifactNotice).toBeNull()

    const added = { relPath: 'deck.pptx', ext: '.pptx' as const, size: 2, mtimeMs: 3 }
    store.getState().reconcileArtifacts('workspace', [added, { ...existing, mtimeMs: 2 }])
    expect(store.getState().artifactNotice).toEqual({ workspaceId: 'workspace', entry: added })

    store.getState().reconcileArtifacts('workspace', [{ ...existing, mtimeMs: 2 }])
    expect(store.getState().artifactNotice).toBeNull()
  })
  it('clears notice, artifacts, and the visible Office space for a switched workspace', () => {
    const store = createOfficeStore(mockService())
    const entry = { relPath: 'deck.pptx', ext: '.pptx' as const, size: 2, mtimeMs: 3 }
    store.getState().initializeArtifacts('workspace', [])
    store.getState().reconcileArtifacts('workspace', [entry])
    store.getState().showOfficeSpace('workspace')
    store.getState().clearWorkspaceUi('workspace')
    expect(store.getState()).toMatchObject({ artifactNotice: null, visibleWorkspaceId: null })
    expect(store.getState().artifactsByWorkspace.workspace).toBeUndefined()
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
  it('keeps Office out of the fixed Panel and inserts its conditional workspace before it', () => {
    const panel = readFileSync(new URL('../../../src/renderer/src/components/Panel.tsx', import.meta.url), 'utf8')
    const app = readFileSync(new URL('../../../src/renderer/src/App.tsx', import.meta.url), 'utf8')
    expect(panel).not.toContain("setActiveView('office')")
    expect(panel).not.toContain('OfficePreviewPanel')
    expect(app.indexOf('<OfficePreviewPanel')).toBeLessThan(app.indexOf('<Panel />'))
    expect(app).toContain('setPanelCollapsed(true)')
  })
})
