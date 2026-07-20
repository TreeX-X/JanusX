import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserSurfaceState } from '../../src/shared/ipc/browser'

const h = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void

  class MockWebContents {
    handlers: Record<string, Handler[]> = {}
    loadURL = vi.fn(() => Promise.resolve())
    reload = vi.fn()
    close = vi.fn()
    setWindowOpenHandler = vi.fn()
    getURL = vi.fn(() => 'https://example.com/')
    getTitle = vi.fn(() => 'Example')
    isLoading = vi.fn(() => false)
    navigationHistory = {
      canGoBack: vi.fn(() => false),
      canGoForward: vi.fn(() => false),
      goBack: vi.fn(),
      goForward: vi.fn(),
    }
    on(event: string, cb: Handler): void {
      ;(this.handlers[event] ??= []).push(cb)
    }
    emit(event: string, ...args: unknown[]): void {
      for (const cb of this.handlers[event] ?? []) cb(...args)
    }
  }

  class MockWebContentsView {
    static instances: MockWebContentsView[] = []
    webContents = new MockWebContents()
    setBounds = vi.fn()
    setBackgroundColor = vi.fn()
    constructor() {
      MockWebContentsView.instances.push(this)
    }
  }

  class MockBrowserWindow {
    static instances: MockBrowserWindow[] = []
    contentView = {
      children: [] as MockWebContentsView[],
      addChildView: (view: MockWebContentsView): void => {
        if (!this.contentView.children.includes(view)) this.contentView.children.push(view)
      },
      removeChildView: (view: MockWebContentsView): void => {
        const index = this.contentView.children.indexOf(view)
        if (index >= 0) this.contentView.children.splice(index, 1)
      },
    }
    webContents = new MockWebContents()
    handlers: Record<string, Handler[]> = {}
    destroyed = false
    constructor() {
      MockBrowserWindow.instances.push(this)
    }
    on(event: string, cb: Handler): void {
      ;(this.handlers[event] ??= []).push(cb)
    }
    emitClosed(): void {
      if (this.destroyed) return
      this.destroyed = true
      for (const cb of this.handlers['closed'] ?? []) cb()
    }
    isDestroyed(): boolean {
      return this.destroyed
    }
    close(): void {
      this.emitClosed()
    }
    destroy(): void {
      this.emitClosed()
    }
  }

  return { MockWebContents, MockWebContentsView, MockBrowserWindow, openExternal: vi.fn() }
})

vi.mock('electron', () => ({
  WebContentsView: h.MockWebContentsView,
  BrowserWindow: h.MockBrowserWindow,
  shell: { openExternal: h.openExternal },
}))

vi.mock('../../src/main/windows/browser-window', () => ({
  createStandaloneBrowserWindow: vi.fn(() => new h.MockBrowserWindow()),
}))

import { BrowserSurfaceManager, normalizeBrowserUrl } from '../../src/main/browser/surface-manager'

describe('normalizeBrowserUrl', () => {
  it('keeps explicit schemes', () => {
    expect(normalizeBrowserUrl('http://a.dev')).toBe('http://a.dev')
    expect(normalizeBrowserUrl('https://a.dev/x?q=1')).toBe('https://a.dev/x?q=1')
    expect(normalizeBrowserUrl('file:///C:/a.html')).toBe('file:///C:/a.html')
  })

  it('routes loopback hosts to http', () => {
    expect(normalizeBrowserUrl('localhost:3000')).toBe('http://localhost:3000')
    expect(normalizeBrowserUrl('127.0.0.1:8080/path')).toBe('http://127.0.0.1:8080/path')
  })

  it('defaults everything else to https', () => {
    expect(normalizeBrowserUrl('example.com')).toBe('https://example.com')
    expect(normalizeBrowserUrl('  docs.example.com/a ')).toBe('https://docs.example.com/a')
  })
})

describe('BrowserSurfaceManager', () => {
  let mainWindow: InstanceType<typeof h.MockBrowserWindow>
  let manager: BrowserSurfaceManager
  let states: BrowserSurfaceState[]

  const lastState = (): BrowserSurfaceState => states[states.length - 1]

  beforeEach(() => {
    h.MockWebContentsView.instances = []
    h.MockBrowserWindow.instances = []
    mainWindow = new h.MockBrowserWindow()
    manager = new BrowserSurfaceManager({ getMainWindow: () => mainWindow as never })
    states = []
    manager.onStateChanged((_id, state) => states.push(state))
  })

  it('creates a pane surface with one active tab attached to the main window', () => {
    const result = manager.createSurface({ surfaceId: 's1', carrier: 'pane' })
    expect(result).toEqual({ success: true, data: { surfaceId: 's1' } })

    const view = h.MockWebContentsView.instances[0]
    expect(mainWindow.contentView.children).toContain(view)
    expect(view.setBounds).not.toHaveBeenCalled()

    const state = lastState()
    expect(state.carrier).toBe('pane')
    expect(state.tabs).toHaveLength(1)
    expect(state.activeTabId).toBe(state.tabs[0].tabId)
    expect(state.tabs[0]).toMatchObject({ url: 'https://example.com/', title: 'Example', isLoading: false })
  })

  it('rejects duplicate surface ids', () => {
    manager.createSurface({ surfaceId: 's1', carrier: 'pane' })
    expect(manager.createSurface({ surfaceId: 's1', carrier: 'pane' }).success).toBe(false)
  })

  it('attaches only the active tab and keeps others detached', () => {
    manager.createSurface({ surfaceId: 's1', carrier: 'pane' })
    const first = h.MockWebContentsView.instances[0]
    const second = manager.openTab('s1', 'example.com/two')
    expect(second.success).toBe(true)
    const secondView = h.MockWebContentsView.instances[1]

    expect(mainWindow.contentView.children).toContain(secondView)
    expect(mainWindow.contentView.children).not.toContain(first)
    expect(lastState().activeTabId).toBe(second.success ? second.data.tabId : null)

    const firstTabId = lastState().tabs[0].tabId
    manager.activateTab('s1', firstTabId)
    expect(mainWindow.contentView.children).toContain(first)
    expect(mainWindow.contentView.children).not.toContain(secondView)
    expect(lastState().activeTabId).toBe(firstTabId)
  })

  it('keeps the surface alive with zero tabs after closing the last tab', () => {
    manager.createSurface({ surfaceId: 's1', carrier: 'pane' })
    const tabId = lastState().tabs[0].tabId
    const view = h.MockWebContentsView.instances[0]

    manager.closeTab('s1', tabId)
    expect(view.webContents.close).toHaveBeenCalled()
    expect(mainWindow.contentView.children).toHaveLength(0)

    const state = lastState()
    expect(state.tabs).toHaveLength(0)
    expect(state.activeTabId).toBeNull()
    expect(manager.getState('s1')).not.toBeNull()
  })

  it('activates the remaining tab when the active tab is closed', () => {
    manager.createSurface({ surfaceId: 's1', carrier: 'pane' })
    const firstTabId = lastState().tabs[0].tabId
    manager.openTab('s1')
    const secondTabId = lastState().activeTabId as string

    manager.closeTab('s1', secondTabId)
    expect(lastState().activeTabId).toBe(firstTabId)
    expect(mainWindow.contentView.children).toContain(h.MockWebContentsView.instances[0])
  })

  it('applies bounds to the active tab view', () => {
    manager.createSurface({ surfaceId: 's1', carrier: 'pane' })
    const view = h.MockWebContentsView.instances[0]
    manager.setBounds('s1', { x: 10, y: 20, width: 300, height: 200 })
    expect(view.setBounds).toHaveBeenCalledWith({ x: 10, y: 20, width: 300, height: 200 })
  })

  it('normalizes navigate input and delegates history/reload calls', () => {
    manager.createSurface({ surfaceId: 's1', carrier: 'pane' })
    const tabId = lastState().tabs[0].tabId
    const contents = h.MockWebContentsView.instances[0].webContents

    manager.navigate('s1', tabId, 'localhost:5173')
    expect(contents.loadURL).toHaveBeenCalledWith('http://localhost:5173')
    manager.navigate('s1', tabId, 'example.com/docs')
    expect(contents.loadURL).toHaveBeenCalledWith('https://example.com/docs')

    manager.goBack('s1', tabId)
    manager.goForward('s1', tabId)
    manager.reload('s1', tabId)
    expect(contents.navigationHistory.goBack).toHaveBeenCalled()
    expect(contents.navigationHistory.goForward).toHaveBeenCalled()
    expect(contents.reload).toHaveBeenCalled()
  })

  it('pushes state on webContents navigation events', () => {
    manager.createSurface({ surfaceId: 's1', carrier: 'pane' })
    const contents = h.MockWebContentsView.instances[0].webContents
    const before = states.length
    contents.emit('page-title-updated')
    contents.emit('did-navigate')
    expect(states.length).toBe(before + 2)
  })

  it('pops out to a standalone window without destroying webContents', () => {
    manager.createSurface({ surfaceId: 's1', carrier: 'pane' })
    const view = h.MockWebContentsView.instances[0]
    const contents = view.webContents

    const result = manager.popOut('s1')
    expect(result.success).toBe(true)
    expect(mainWindow.contentView.children).not.toContain(view)
    expect(contents.close).not.toHaveBeenCalled()

    const standalone = h.MockBrowserWindow.instances[h.MockBrowserWindow.instances.length - 1]
    expect(standalone).not.toBe(mainWindow)
    expect(lastState().carrier).toBe('window')
    expect(manager.getStandaloneWebContents('s1')).toBe(standalone.webContents)
  })

  it('embeds a popped-out surface back into the main window and closes the standalone window', () => {
    manager.createSurface({ surfaceId: 's1', carrier: 'pane' })
    manager.popOut('s1')
    const standalone = h.MockBrowserWindow.instances[h.MockBrowserWindow.instances.length - 1]
    const view = h.MockWebContentsView.instances[0]

    const result = manager.embed('s1')
    expect(result.success).toBe(true)
    expect(lastState().carrier).toBe('pane')
    expect(standalone.isDestroyed()).toBe(true)
    expect(view.webContents.close).not.toHaveBeenCalled()

    manager.setBounds('s1', { x: 0, y: 0, width: 100, height: 100 })
    expect(mainWindow.contentView.children).toContain(view)
  })

  it('rejects popOut/embed for surfaces in the wrong carrier', () => {
    manager.createSurface({ surfaceId: 's1', carrier: 'pane' })
    expect(manager.embed('s1').success).toBe(false)
    expect(manager.popOut('s1').success).toBe(true)
    expect(manager.popOut('s1').success).toBe(false)
  })

  it('destroys the surface when the user closes the standalone window', () => {
    manager.createSurface({ surfaceId: 's1', carrier: 'pane' })
    manager.popOut('s1')
    const standalone = h.MockBrowserWindow.instances[h.MockBrowserWindow.instances.length - 1]
    const contents = h.MockWebContentsView.instances[0].webContents

    standalone.emitClosed()
    expect(manager.getState('s1')).toBeNull()
    expect(contents.close).toHaveBeenCalled()
    expect(lastState().destroyed).toBe(true)
    expect(lastState().tabs).toHaveLength(0)
  })

  it('destroySurface closes all tab contents and emits a destroyed tombstone', () => {
    manager.createSurface({ surfaceId: 's1', carrier: 'pane' })
    manager.openTab('s1')
    const [first, second] = h.MockWebContentsView.instances

    manager.destroySurface('s1')
    expect(first.webContents.close).toHaveBeenCalled()
    expect(second.webContents.close).toHaveBeenCalled()
    expect(mainWindow.contentView.children).toHaveLength(0)
    expect(manager.getState('s1')).toBeNull()
    expect(lastState()).toMatchObject({ surfaceId: 's1', destroyed: true, tabs: [], activeTabId: null })
  })

  it('creates a window-carrier surface directly with its own standalone window', () => {
    const result = manager.createSurface({ surfaceId: 's2', carrier: 'window', url: 'example.com' })
    expect(result.success).toBe(true)
    const standalone = h.MockBrowserWindow.instances[h.MockBrowserWindow.instances.length - 1]
    const view = h.MockWebContentsView.instances[0]
    expect(lastState().carrier).toBe('window')
    expect(standalone.contentView.children).toContain(view)
    expect(mainWindow.contentView.children).not.toContain(view)
    expect(view.webContents.loadURL).toHaveBeenCalledWith('https://example.com')
  })

  it('unsubscribes state listeners cleanly', () => {
    const extra: BrowserSurfaceState[] = []
    const off = manager.onStateChanged((_id, state) => extra.push(state))
    off()
    manager.createSurface({ surfaceId: 's1', carrier: 'pane' })
    expect(extra).toHaveLength(0)
  })
})
