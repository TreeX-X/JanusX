import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { productKindForPath, toProductFileEntry } from '../../../src/shared/product'
import type { OfficeService } from '../../../src/renderer/src/services/office'
import { createProductWorkspaceStore } from '../../../src/renderer/src/stores/productWorkspace'
import { buildOfficePreviewUrl, getOfficeErrorCopy, OfficePreviewFrame } from '../../../src/renderer/src/components/office/OfficePreviewFrame'
import { startProductDiscovery } from '../../../src/renderer/src/components/product-workspace/productDiscovery'
import {
  clampProductWorkspaceWidth,
  CENTER_WORKSPACE_MIN_WIDTH,
  getProductWorkspaceMaxWidth,
  PRODUCT_WORKSPACE_MAX_WIDTH,
  PRODUCT_WORKSPACE_MIN_WIDTH,
  reconcileProductWorkspaceWidth,
} from '../../../src/renderer/src/components/product-workspace/productResize'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
function mockService(overrides: Partial<OfficeService> = {}): OfficeService {
  return { detect: vi.fn(), listFiles: vi.fn(), startPreview: vi.fn(), stopPreview: vi.fn(async () => ({ ok: true, value: null })), reloadPreview: vi.fn(), buildPrompt: vi.fn(), onFilesChanged: vi.fn(() => () => {}), onWatchEvicted: vi.fn(() => () => {}), ...overrides } as OfficeService
}

describe('product workspace kind mapping', () => {
  it('routes office, markdown and html files while rejecting the rest', () => {
    expect(productKindForPath('deck.pptx')).toBe('office')
    expect(productKindForPath('report.DOCX')).toBe('office')
    expect(productKindForPath('notes.md')).toBe('markdown')
    expect(productKindForPath('page.html')).toBe('html')
    expect(productKindForPath('notes.txt')).toBe('unsupported')
    expect(toProductFileEntry({ relPath: 'a/b.md', mtimeMs: 3, size: 9 })).toEqual({ relPath: 'a/b.md', mtimeMs: 3, size: 9, kind: 'markdown', ext: '.md' })
  })
})

describe('product workspace lifecycle', () => {
  it('clamps stage resizing while preserving the center workspace', () => {
    const availableWidth = PRODUCT_WORKSPACE_MAX_WIDTH + CENTER_WORKSPACE_MIN_WIDTH
    expect(clampProductWorkspaceWidth(650, 1000, availableWidth)).toBe(350)
    expect(clampProductWorkspaceWidth(900, 1000, availableWidth)).toBe(PRODUCT_WORKSPACE_MIN_WIDTH)
    expect(clampProductWorkspaceWidth(0, 1500, availableWidth)).toBe(PRODUCT_WORKSPACE_MAX_WIDTH)
    expect(clampProductWorkspaceWidth(0, 1000, PRODUCT_WORKSPACE_MIN_WIDTH + CENTER_WORKSPACE_MIN_WIDTH + 40)).toBe(PRODUCT_WORKSPACE_MIN_WIDTH + 40)
    expect(getProductWorkspaceMaxWidth(PRODUCT_WORKSPACE_MIN_WIDTH + CENTER_WORKSPACE_MIN_WIDTH + 40)).toBe(PRODUCT_WORKSPACE_MIN_WIDTH + 40)
    expect(reconcileProductWorkspaceWidth(PRODUCT_WORKSPACE_MAX_WIDTH, 480, 700)).toEqual({
      width: 380,
      maxWidth: 380,
    })
    expect(reconcileProductWorkspaceWidth(null, 375, 2000)).toEqual({
      width: 375,
      maxWidth: PRODUCT_WORKSPACE_MAX_WIDTH,
    })
    expect(reconcileProductWorkspaceWidth(360, 360, 2000)).toEqual({
      width: 360,
      maxWidth: PRODUCT_WORKSPACE_MAX_WIDTH,
    })
  })
  it('notifies an initialization-time addition exactly once across catch-up and queued snapshots', async () => {
    const baseline = deferred<any>()
    const catchup = deferred<any>()
    let listener: ((event: any) => void) | undefined
    const existing = { relPath: 'existing.docx', ext: '.docx', size: 1, mtimeMs: 1 }
    const added = { relPath: 'notes.md', ext: '.md', size: 2, mtimeMs: 2 }
    const service = mockService({
      listFiles: vi.fn().mockReturnValueOnce(baseline.promise).mockReturnValueOnce(catchup.promise),
      onFilesChanged: vi.fn((callback) => { listener = callback; return vi.fn() }),
    })
    const store = createProductWorkspaceStore(service)
    let noticeCount = 0
    let previousNotice = store.getState().productNotice
    const unsubscribeStore = store.subscribe((state) => {
      if (state.productNotice && state.productNotice !== previousNotice) noticeCount += 1
      previousNotice = state.productNotice
    })
    const stop = startProductDiscovery('workspace', service, {
      initialize: (entries) => store.getState().initializeProducts('workspace', entries),
      reconcile: (entries) => store.getState().reconcileProducts('workspace', entries),
      isCurrent: () => true,
    })

    baseline.resolve({ ok: true, value: [existing] })
    await vi.waitFor(() => expect(service.listFiles).toHaveBeenCalledTimes(2))
    expect(store.getState().productNotice).toBeNull()
    expect(listener).toBeTypeOf('function')
    listener?.({ workspaceId: 'workspace', entries: [added, existing], reason: 'watch' })
    catchup.resolve({ ok: true, value: [added, existing] })
    await vi.waitFor(() => {
      expect(store.getState().productNotice).toMatchObject({ workspaceId: 'workspace', entry: { relPath: 'notes.md', size: 2, mtimeMs: 2 } })
    })
    expect(noticeCount).toBe(1)
    unsubscribeStore()
    stop()
  })

  it('drops late baseline, catch-up, and event publications after a workspace switch', async () => {
    const lateBaseline = deferred<any>()
    const baselineService = mockService({ listFiles: vi.fn(() => lateBaseline.promise) })
    const baselineStore = createProductWorkspaceStore(baselineService)
    const stopBaseline = startProductDiscovery('old', baselineService, {
      initialize: (entries) => baselineStore.getState().initializeProducts('old', entries),
      reconcile: (entries) => baselineStore.getState().reconcileProducts('old', entries),
      isCurrent: () => false,
    })
    stopBaseline()
    lateBaseline.resolve({ ok: true, value: [{ relPath: 'late.docx', ext: '.docx', size: 1, mtimeMs: 1 }] })
    await Promise.resolve()
    expect(baselineStore.getState().productsByWorkspace.old).toBeUndefined()

    const catchup = deferred<any>()
    let listener: ((event: any) => void) | undefined
    let current = true
    const service = mockService({
      listFiles: vi.fn()
        .mockResolvedValueOnce({ ok: true, value: [] })
        .mockReturnValueOnce(catchup.promise),
      onFilesChanged: vi.fn((callback) => { listener = callback; return vi.fn() }),
    })
    const store = createProductWorkspaceStore(service)
    const stop = startProductDiscovery('old', service, {
      initialize: (entries) => store.getState().initializeProducts('old', entries),
      reconcile: (entries) => store.getState().reconcileProducts('old', entries),
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
    expect(store.getState().productsByWorkspace.old).toBeUndefined()
    expect(store.getState().productNotice).toBeNull()
  })

  it('opens local kinds without a preview lease and bumps revision on reload', async () => {
    const service = mockService()
    const store = createProductWorkspaceStore(service)
    await store.getState().openPreview('workspace', 'notes.md')
    expect(service.startPreview).not.toHaveBeenCalled()
    expect(store.getState().tabs[0]).toMatchObject({ status: 'ready', kind: 'markdown' })
    await store.getState().reloadTab(store.getState().tabs[0].tabId)
    expect(store.getState().tabs[0].revision).toBe(1)
    await store.getState().closeTab(store.getState().tabs[0].tabId)
    expect(store.getState().tabs).toHaveLength(0)
    expect(service.stopPreview).not.toHaveBeenCalled()
  })

  it('deduplicates a pending workspace and path open', async () => {
    const start = deferred<any>()
    const service = mockService({ startPreview: vi.fn(() => start.promise) })
    const store = createProductWorkspaceStore(service)
    const first = store.getState().openPreview('workspace', 'deck.pptx')
    const second = store.getState().openPreview('workspace', 'deck.pptx')
    expect(service.startPreview).toHaveBeenCalledTimes(1)
    start.resolve({ ok: true, value: { previewLeaseId: 'lease-1', port: 4123, relPath: 'deck.pptx' } })
    await Promise.all([first, second])
    expect(store.getState().tabs).toHaveLength(1)
    expect(store.getState().tabs[0]).toMatchObject({ status: 'ready', previewLeaseId: 'lease-1', port: 4123 })
  })
  it('converts rejected start and reload IPC requests into retryable errors', async () => {
    const rejectedStart = createProductWorkspaceStore(mockService({
      startPreview: vi.fn(async () => { throw new Error('ipc closed') }),
    }))
    await expect(rejectedStart.getState().openPreview('workspace', 'deck.pptx')).resolves.toBeUndefined()
    expect(rejectedStart.getState().tabs[0]).toMatchObject({ status: 'error', errorCode: 'START_FAILED' })

    const rejectedReload = createProductWorkspaceStore(mockService({
      startPreview: vi.fn(async () => ({ ok: true, value: { previewLeaseId: 'lease', port: 4123, relPath: 'deck.pptx' } })),
      reloadPreview: vi.fn(async () => { throw new Error('ipc closed') }),
    }))
    await rejectedReload.getState().openPreview('workspace', 'deck.pptx')
    await expect(rejectedReload.getState().reloadTab(rejectedReload.getState().tabs[0].tabId)).resolves.toBeUndefined()
    expect(rejectedReload.getState().tabs[0]).toMatchObject({ status: 'error', errorCode: 'START_FAILED', previewLeaseId: undefined, port: undefined, reloadRequestId: undefined })
    expect(rejectedReload.getState().tabs[0].previewLeaseId).toBeUndefined()
    expect(rejectedReload.getState().tabs[0].port).toBeUndefined()
  })
  it('retires the old lease after a structured reload failure', async () => {
    const service = mockService({
      startPreview: vi.fn(async () => ({ ok: true, value: { previewLeaseId: 'old', port: 4123, relPath: 'deck.pptx' } })),
      reloadPreview: vi.fn(async () => ({ ok: false, error: { code: 'PORT_TIMEOUT', message: 'timeout' } })),
    })
    const store = createProductWorkspaceStore(service)
    await store.getState().openPreview('workspace', 'deck.pptx')
    await store.getState().reloadTab(store.getState().tabs[0].tabId)
    expect(store.getState().tabs[0]).toMatchObject({ status: 'error', errorCode: 'PORT_TIMEOUT' })
    expect(store.getState().tabs[0].previewLeaseId).toBeUndefined()
    expect(store.getState().tabs[0].port).toBeUndefined()
    expect(service.stopPreview).toHaveBeenCalledTimes(1)
    expect(service.stopPreview).toHaveBeenCalledWith({ workspaceId: 'workspace', relPath: 'deck.pptx', previewLeaseId: 'old' })
  })
  it('bounds a hanging start and stops a successful lease that arrives after timeout', async () => {
    vi.useFakeTimers()
    try {
      const start = deferred<any>()
      const service = mockService({ startPreview: vi.fn(() => start.promise) })
      const store = createProductWorkspaceStore(service, vi.fn(), 20)
      const opening = store.getState().openPreview('workspace', 'deck.pptx')
      await vi.advanceTimersByTimeAsync(20)
      await opening
      expect(store.getState().tabs[0]).toMatchObject({ status: 'error', errorCode: 'PORT_TIMEOUT' })

      start.resolve({ ok: true, value: { previewLeaseId: 'late', port: 4123, relPath: 'deck.pptx' } })
      await Promise.resolve()
      await Promise.resolve()
      expect(service.stopPreview).toHaveBeenCalledWith({ workspaceId: 'workspace', relPath: 'deck.pptx', previewLeaseId: 'late' })
    } finally {
      vi.useRealTimers()
    }
  })
  it('stops a start lease that resolves after workspace release', async () => {
    const start = deferred<any>()
    const service = mockService({ startPreview: vi.fn(() => start.promise) })
    const store = createProductWorkspaceStore(service)
    const opening = store.getState().openPreview('workspace', 'book.xlsx')
    await store.getState().releaseWorkspace('workspace')
    start.resolve({ ok: true, value: { previewLeaseId: 'stale', port: 5000, relPath: 'book.xlsx' } })
    await opening
    expect(store.getState().tabs).toHaveLength(0)
    expect(service.stopPreview).toHaveBeenCalledWith({ workspaceId: 'workspace', relPath: 'book.xlsx', previewLeaseId: 'stale' })
  })
  it('cleans UI and records rejected stop requests', async () => {
    const report = vi.fn()
    const service = mockService({
      startPreview: vi.fn(async () => ({ ok: true, value: { previewLeaseId: 'lease', port: 4000, relPath: 'doc.docx' } })),
      stopPreview: vi.fn(async () => { throw new Error('transport failed') }),
    })
    const store = createProductWorkspaceStore(service, report)
    await store.getState().openPreview('workspace', 'doc.docx')
    await store.getState().closeTab(store.getState().tabs[0].tabId)
    expect(store.getState().tabs).toHaveLength(0)
    expect(report).toHaveBeenCalledWith('[product] Failed to stop preview lease', expect.any(Error))
  })
  it('closeProductWorkspace releases tabs and leases for the visible workspace', async () => {
    const service = mockService({ startPreview: vi.fn(async () => ({ ok: true, value: { previewLeaseId: 'lease', port: 4000, relPath: 'doc.docx' } })) })
    const store = createProductWorkspaceStore(service)
    await store.getState().openPreview('workspace', 'doc.docx')
    store.getState().showProductWorkspace('workspace')
    store.getState().closeProductWorkspace()
    expect(store.getState().visibleWorkspaceId).toBeNull()
    expect(store.getState().tabs).toHaveLength(0)
    expect(service.stopPreview).toHaveBeenCalledWith({ workspaceId: 'workspace', relPath: 'doc.docx', previewLeaseId: 'lease' })
  })

  it('removes only the lease targeted by a crash eviction', async () => {
    const service = mockService({ startPreview: vi.fn()
      .mockResolvedValueOnce({ ok: true, value: { previewLeaseId: 'one', port: 4000, relPath: 'one.docx' } })
      .mockResolvedValueOnce({ ok: true, value: { previewLeaseId: 'two', port: 4001, relPath: 'two.docx' } }) })
    const store = createProductWorkspaceStore(service)
    await store.getState().openPreview('workspace', 'one.docx')
    await store.getState().openPreview('workspace', 'two.docx')
    store.getState().handleEvicted(['one'], 'crashed')
    expect(store.getState().tabs.find((tab) => tab.relPath === 'one.docx')).toMatchObject({ status: 'error', errorCode: 'START_FAILED' })
    expect(store.getState().tabs.find((tab) => tab.relPath === 'two.docx')).toMatchObject({ status: 'ready' })
  })
  it('baselines existing products and notifies only newly added paths', () => {
    const store = createProductWorkspaceStore(mockService())
    const existing = { relPath: 'existing.docx', ext: '.docx', size: 1, mtimeMs: 1 }
    store.getState().initializeProducts('workspace', [existing])
    expect(store.getState().productNotice).toBeNull()

    store.getState().reconcileProducts('workspace', [{ ...existing, mtimeMs: 2 }])
    expect(store.getState().productNotice).toMatchObject({ kind: 'modified', entry: { relPath: 'existing.docx', mtimeMs: 2 } })

    const added = { relPath: 'page.html', ext: '.html', size: 2, mtimeMs: 3 }
    store.getState().reconcileProducts('workspace', [added, { ...existing, mtimeMs: 2 }])
    expect(store.getState().productNotice).toMatchObject({ kind: 'added', entry: { relPath: 'page.html', size: 2, mtimeMs: 3 } })

    store.getState().reconcileProducts('workspace', [{ ...existing, mtimeMs: 2 }])
    expect(store.getState().productNotice).toBeNull()
  })
  it('keeps a same-session product overwrite silent (no re-notice)', () => {
    const store = createProductWorkspaceStore(mockService())
    store.getState().initializeProducts('workspace', [])
    store.getState().reconcileProducts('workspace', [{ relPath: 'page.html', ext: '.html', size: 1, mtimeMs: 2 }])
    expect(store.getState().productNotice).toMatchObject({ kind: 'added', entry: { mtimeMs: 2 } })
    store.getState().reconcileProducts('workspace', [{ relPath: 'page.html', ext: '.html', size: 2, mtimeMs: 8 }])
    expect(store.getState().productNotice).toMatchObject({ kind: 'added', entry: { mtimeMs: 2 } })
  })

  it('an alive added notice is not displaced by a baseline modification', () => {
    const store = createProductWorkspaceStore(mockService())
    const prior = { relPath: 'old.md', ext: '.md', size: 1, mtimeMs: 1 }
    store.getState().initializeProducts('workspace', [prior])
    store.getState().reconcileProducts('workspace', [{ relPath: 'new.md', ext: '.md', size: 1, mtimeMs: 2 }])
    expect(store.getState().productNotice).toMatchObject({ kind: 'added', entry: { relPath: 'new.md' } })
    store.getState().reconcileProducts('workspace', [
      { relPath: 'new.md', ext: '.md', size: 1, mtimeMs: 2 },
      { ...prior, mtimeMs: 6 },
    ])
    expect(store.getState().productNotice).toMatchObject({ kind: 'added', entry: { relPath: 'new.md' } })
  })

  it('a baseline file notifies once per session, then stays silent', () => {
    const store = createProductWorkspaceStore(mockService())
    const prior = { relPath: 'old.md', ext: '.md', size: 1, mtimeMs: 1 }
    store.getState().initializeProducts('workspace', [prior])
    store.getState().reconcileProducts('workspace', [{ ...prior, mtimeMs: 5 }])
    expect(store.getState().productNotice).toMatchObject({ kind: 'modified', entry: { mtimeMs: 5 } })
    store.getState().reconcileProducts('workspace', [{ ...prior, mtimeMs: 9 }])
    expect(store.getState().productNotice).toMatchObject({ kind: 'modified', entry: { mtimeMs: 5 } })
  })

  it('clears notice, products, and the visible stage for a switched workspace', () => {
    const store = createProductWorkspaceStore(mockService())
    const entry = { relPath: 'deck.pptx', ext: '.pptx', size: 2, mtimeMs: 3 }
    store.getState().initializeProducts('workspace', [])
    store.getState().reconcileProducts('workspace', [entry])
    store.getState().showProductWorkspace('workspace')
    store.getState().clearWorkspaceUi('workspace')
    expect(store.getState()).toMatchObject({ productNotice: null, visibleWorkspaceId: null })
    expect(store.getState().productsByWorkspace.workspace).toBeUndefined()
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
    expect(markup).toContain('editor:office.errorTooMany')
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
    expect(copy).toContain('editor:office.errorNotInstalled')
    expect(copy).toContain('download；verify')
  })
  it('keeps the product stage out of the fixed Panel and inserts its conditional workspace before it', () => {
    const panel = readFileSync(new URL('../../../src/renderer/src/components/Panel.tsx', import.meta.url), 'utf8')
    const app = readFileSync(new URL('../../../src/renderer/src/App.tsx', import.meta.url), 'utf8')
    expect(panel).not.toContain("setActiveView('office')")
    expect(panel).not.toContain('ProductWorkspacePanel')
    expect(app.indexOf('<ProductWorkspacePanel')).toBeLessThan(app.indexOf('<Panel />'))
    expect(app).toContain('role="separator"')
    expect(app).toContain('aria-label="Resize product workspace"')
    expect(app).toContain('aria-valuenow={Math.round(productMeasuredWidth)}')
    expect(app).toContain('new ResizeObserver')
    expect(app).toContain('observer.observe(centerWorkspace)')
    expect(app).toContain('observer.observe(stageWorkspace)')
    expect(app).toContain('observer.disconnect()')
    expect(app).toContain('window.cancelAnimationFrame(frameId)')
    expect(app).toContain('ArrowLeft:')
    expect(app).toContain('onLostPointerCapture=')
    expect(app).toContain('setPointerCapture(event.pointerId)')
    expect(app).toContain('finishProductResize(false)')
    expect(app).toContain('productResizing || rightDockResizing || editorResizing')
    expect(app).toContain("? 'none'")
    expect(app).not.toContain('addEventListener(\'pointermove\'')
  })
  it('uses an unclipped fixed hit target and source-safe close icon', () => {
    const source = readFileSync(new URL('../../../src/renderer/src/components/product-workspace/ProductWorkspacePanel.tsx', import.meta.url), 'utf8')
    const start = source.indexOf("aria-label={t('editor:product.closeAria')}")
    const closeControl = source.slice(start, start + 900)
    expect(start).toBeGreaterThan(0)
    expect(closeControl).toContain('h-8 w-8 shrink-0')
    expect(closeControl).toContain('overflow-visible')
    expect(closeControl.match(/bg-current/g)).toHaveLength(2)
    expect(source).toContain('onRetry={retryActiveTab}')
    expect(source).toContain('if (activeTab.kind === \'office\' && activeTab.previewLeaseId)')
  })
})
