import { BrowserWindow, WebContentsView, shell } from 'electron'
import { randomUUID } from 'crypto'
import {
  type BrowserAgentControlEvent,
  type BrowserBounds,
  type BrowserCarrier,
  type BrowserResult,
  type BrowserSurfaceState,
  type CreateBrowserSurfaceRequest,
} from '../../shared/ipc/browser'
import { createStandaloneBrowserWindow } from '../windows/browser-window'

interface BrowserTab {
  tabId: string
  view: WebContentsView
}

interface BrowserSurface {
  surfaceId: string
  carrier: BrowserCarrier
  tabs: Map<string, BrowserTab>
  activeTabId: string | null
  bounds: BrowserBounds | null
  standaloneWindow: BrowserWindow | null
  agentControlled: boolean
}

export interface BrowserSurfaceManagerDeps {
  getMainWindow: () => BrowserWindow | null
}

type StateListener = (surfaceId: string, state: BrowserSurfaceState) => void
type AgentControlListener = (surfaceId: string, event: BrowserAgentControlEvent) => void

/*-- 用户输入的 URL 归一化：scheme 必须带 "://"（排除 localhost:5173 这类误判），无协议时本地地址走 http，其余走 https --*/
export function normalizeBrowserUrl(input: string): string {
  const trimmed = input.trim()
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return trimmed
  if (/^(about|file|data|chrome|devtools):/i.test(trimmed)) return trimmed
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(trimmed)) return `http://${trimmed}`
  return `https://${trimmed}`
}

/**
 * 浏览器 surface 管理器（P1 纯用户功能）。
 * 每 tab 一个 WebContentsView（主进程持有），仅活动 tab attach 到宿主窗口，其余 detach 保活；
 * popOut/embed 通过跨窗口 re-parent 切换载体，webContents 不销毁、导航历史保留。
 */
export class BrowserSurfaceManager {
  private surfaces = new Map<string, BrowserSurface>()
  private stateListeners = new Set<StateListener>()
  private agentControlListeners = new Set<AgentControlListener>()

  constructor(private deps: BrowserSurfaceManagerDeps) {}

  onStateChanged(listener: StateListener): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  onAgentControlChanged(listener: AgentControlListener): () => void {
    this.agentControlListeners.add(listener)
    return () => this.agentControlListeners.delete(listener)
  }

  createSurface(request: CreateBrowserSurfaceRequest): BrowserResult<{ surfaceId: string }> {
    if (!request.surfaceId) return { success: false, error: 'Missing surfaceId' }
    if (this.surfaces.has(request.surfaceId)) return { success: false, error: 'Surface already exists' }

    const surface: BrowserSurface = {
      surfaceId: request.surfaceId,
      carrier: request.carrier,
      tabs: new Map(),
      activeTabId: null,
      bounds: null,
      standaloneWindow: null,
      agentControlled: false,
    }
    this.surfaces.set(surface.surfaceId, surface)

    /*-- 独立窗口载体：先开窗再挂 tab，窗口被用户关闭时整体销毁 surface --*/
    if (surface.carrier === 'window') this.openStandaloneWindow(surface)

    const tab = this.createTab(surface, request.url)
    surface.tabs.set(tab.tabId, tab)
    surface.activeTabId = tab.tabId
    this.attachActiveTab(surface)
    this.emitState(surface)
    return { success: true, data: { surfaceId: surface.surfaceId } }
  }

  destroySurface(surfaceId: string): void {
    const surface = this.surfaces.get(surfaceId)
    if (!surface) return
    this.surfaces.delete(surfaceId)

    const mainWindow = this.deps.getMainWindow()
    for (const tab of surface.tabs.values()) {
      if (mainWindow && !mainWindow.isDestroyed()) this.detachView(mainWindow, tab.view)
      if (surface.standaloneWindow && !surface.standaloneWindow.isDestroyed()) {
        this.detachView(surface.standaloneWindow, tab.view)
      }
      this.destroyTabView(tab)
    }

    const standalone = surface.standaloneWindow
    surface.standaloneWindow = null
    if (standalone && !standalone.isDestroyed()) standalone.destroy()

    /*-- 推送销毁终态：渲染端据此移除本地 surface 状态（不读已销毁的 webContents） --*/
    this.notifyState(surfaceId, {
      surfaceId,
      carrier: surface.carrier,
      tabs: [],
      activeTabId: null,
      agentControlled: surface.agentControlled,
      destroyed: true,
    })
  }

  destroyAll(): void {
    for (const surfaceId of [...this.surfaces.keys()]) this.destroySurface(surfaceId)
  }

  popOut(surfaceId: string): BrowserResult<{ surfaceId: string }> {
    const surface = this.surfaces.get(surfaceId)
    if (!surface) return { success: false, error: 'Surface not found' }
    if (surface.carrier !== 'pane') return { success: false, error: 'Surface is not embedded' }

    /*-- 先从主窗口摘除全部 tab view，再切换载体；webContents 全程存活 --*/
    const mainWindow = this.deps.getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      for (const tab of surface.tabs.values()) this.detachView(mainWindow, tab.view)
    }
    surface.carrier = 'window'
    surface.bounds = null
    this.openStandaloneWindow(surface)
    this.emitState(surface)
    return { success: true, data: { surfaceId } }
  }

  embed(surfaceId: string): BrowserResult<{ surfaceId: string }> {
    const surface = this.surfaces.get(surfaceId)
    if (!surface) return { success: false, error: 'Surface not found' }
    if (surface.carrier !== 'window') return { success: false, error: 'Surface is not popped out' }

    const standalone = surface.standaloneWindow
    if (standalone && !standalone.isDestroyed()) {
      for (const tab of surface.tabs.values()) this.detachView(standalone, tab.view)
    }
    /*-- 先切回 pane 载体再关窗：closed 回调只在 carrier=window 时销毁 surface --*/
    surface.carrier = 'pane'
    surface.bounds = null
    surface.standaloneWindow = null
    if (standalone && !standalone.isDestroyed()) standalone.close()
    this.emitState(surface)
    return { success: true, data: { surfaceId } }
  }

  setBounds(surfaceId: string, bounds: BrowserBounds): void {
    const surface = this.surfaces.get(surfaceId)
    if (!surface) return
    surface.bounds = bounds
    this.attachActiveTab(surface)
  }

  getState(surfaceId: string): BrowserSurfaceState | null {
    const surface = this.surfaces.get(surfaceId)
    return surface ? this.buildState(surface) : null
  }

  openTab(surfaceId: string, url?: string): BrowserResult<{ tabId: string }> {
    const surface = this.surfaces.get(surfaceId)
    if (!surface) return { success: false, error: 'Surface not found' }
    const tab = this.createTab(surface, url)
    surface.tabs.set(tab.tabId, tab)
    surface.activeTabId = tab.tabId
    this.attachActiveTab(surface)
    this.emitState(surface)
    return { success: true, data: { tabId: tab.tabId } }
  }

  closeTab(surfaceId: string, tabId: string): void {
    const surface = this.surfaces.get(surfaceId)
    const tab = surface?.tabs.get(tabId)
    if (!surface || !tab) return

    const host = this.hostWindowOf(surface)
    if (host && !host.isDestroyed()) this.detachView(host, tab.view)
    this.destroyTabView(tab)
    surface.tabs.delete(tabId)

    /*-- 关闭的是活动 tab 时切到剩余最后一个；全部关闭后 surface 保留为空 --*/
    if (surface.activeTabId === tabId) {
      const remaining = [...surface.tabs.keys()]
      surface.activeTabId = remaining.length > 0 ? remaining[remaining.length - 1] : null
      this.attachActiveTab(surface)
    }
    this.emitState(surface)
  }

  activateTab(surfaceId: string, tabId: string): void {
    const surface = this.surfaces.get(surfaceId)
    if (!surface || !surface.tabs.has(tabId)) return
    surface.activeTabId = tabId
    this.attachActiveTab(surface)
    this.emitState(surface)
  }

  navigate(surfaceId: string, tabId: string, url: string): void {
    const tab = this.getTab(surfaceId, tabId)
    if (!tab) return
    /*-- 导航失败（证书错误、中断等）不抛错，加载态由 webContents 事件回流 --*/
    void tab.view.webContents.loadURL(normalizeBrowserUrl(url)).catch(() => {})
  }

  goBack(surfaceId: string, tabId: string): void {
    this.getTab(surfaceId, tabId)?.view.webContents.navigationHistory.goBack()
  }

  goForward(surfaceId: string, tabId: string): void {
    this.getTab(surfaceId, tabId)?.view.webContents.navigationHistory.goForward()
  }

  reload(surfaceId: string, tabId: string): void {
    this.getTab(surfaceId, tabId)?.view.webContents.reload()
  }

  /*-- P2 预留：Agent 控制指示；P1 无 IPC 触发源 --*/
  setAgentControlled(surfaceId: string, active: boolean): void {
    const surface = this.surfaces.get(surfaceId)
    if (!surface || surface.agentControlled === active) return
    surface.agentControlled = active
    const event: BrowserAgentControlEvent = { surfaceId, active }
    for (const listener of this.agentControlListeners) listener(surfaceId, event)
    this.emitState(surface)
  }

  getStandaloneWebContents(surfaceId: string): Electron.WebContents | null {
    const surface = this.surfaces.get(surfaceId)
    const win = surface?.standaloneWindow
    return win && !win.isDestroyed() ? win.webContents : null
  }

  private getTab(surfaceId: string, tabId: string): BrowserTab | null {
    return this.surfaces.get(surfaceId)?.tabs.get(tabId) ?? null
  }

  private hostWindowOf(surface: BrowserSurface): BrowserWindow | null {
    return surface.carrier === 'pane' ? this.deps.getMainWindow() : surface.standaloneWindow
  }

  private openStandaloneWindow(surface: BrowserSurface): void {
    const win = createStandaloneBrowserWindow(surface.surfaceId)
    surface.standaloneWindow = win
    win.on('closed', () => {
      surface.standaloneWindow = null
      /*-- 用户直接关闭独立窗口：surface 仍挂窗口载体则整体销毁 --*/
      if (surface.carrier === 'window' && this.surfaces.has(surface.surfaceId)) {
        this.destroySurface(surface.surfaceId)
      }
    })
  }

  private createTab(surface: BrowserSurface, url?: string): BrowserTab {
    const view = new WebContentsView({
      webPreferences: {
        /*-- 独立持久会话：网页 cookie/登录态与 JanusX 自身 UI 隔离 --*/
        partition: 'persist:janusx-browser',
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    })
    const tab: BrowserTab = { tabId: randomUUID(), view }

    /*-- 空白 tab 与加载过渡期间保持深色，避免白闪 --*/
    view.setBackgroundColor('#0a0a0a')

    /*-- target=_blank / window.open 转为 surface 内新 tab，不跳出外部浏览器 --*/
    view.webContents.setWindowOpenHandler((details) => {
      if (details.url.startsWith('http://') || details.url.startsWith('https://')) {
        this.openTab(surface.surfaceId, details.url)
      } else {
        void shell.openExternal(details.url)
      }
      return { action: 'deny' }
    })

    const emit = (): void => {
      if (this.surfaces.has(surface.surfaceId)) this.emitState(surface)
    }
    view.webContents.on('did-navigate', emit)
    view.webContents.on('did-start-loading', emit)
    view.webContents.on('did-stop-loading', emit)
    view.webContents.on('did-fail-load', emit)
    view.webContents.on('page-title-updated', emit)

    if (url) void view.webContents.loadURL(normalizeBrowserUrl(url)).catch(() => {})
    return tab
  }

  private destroyTabView(tab: BrowserTab): void {
    try {
      tab.view.webContents.close()
    } catch {
      /*-- webContents 可能已销毁 --*/
    }
  }

  private detachView(host: BrowserWindow, view: WebContentsView): void {
    try {
      host.contentView.removeChildView(view)
    } catch {
      /*-- view 可能不在该窗口上（如 re-parent 中途） --*/
    }
  }

  /*-- 仅活动 tab attach 到宿主窗口并应用最近 bounds；其余 tab detach 保活 --*/
  private attachActiveTab(surface: BrowserSurface): void {
    const host = this.hostWindowOf(surface)
    if (!host || host.isDestroyed()) return
    const active = surface.activeTabId ? surface.tabs.get(surface.activeTabId) ?? null : null

    for (const tab of surface.tabs.values()) {
      if (active && tab.tabId === active.tabId) continue
      this.detachView(host, tab.view)
    }
    if (!active) return
    if (!host.contentView.children.includes(active.view)) host.contentView.addChildView(active.view)
    if (surface.bounds) active.view.setBounds(surface.bounds)
  }

  private buildState(surface: BrowserSurface): BrowserSurfaceState {
    return {
      surfaceId: surface.surfaceId,
      carrier: surface.carrier,
      tabs: [...surface.tabs.values()].map((tab) => {
        const contents = tab.view.webContents
        return {
          tabId: tab.tabId,
          url: contents.getURL(),
          title: contents.getTitle(),
          isLoading: contents.isLoading(),
          canGoBack: contents.navigationHistory.canGoBack(),
          canGoForward: contents.navigationHistory.canGoForward(),
        }
      }),
      activeTabId: surface.activeTabId,
      agentControlled: surface.agentControlled,
    }
  }

  private emitState(surface: BrowserSurface): void {
    this.notifyState(surface.surfaceId, this.buildState(surface))
  }

  private notifyState(surfaceId: string, state: BrowserSurfaceState): void {
    for (const listener of this.stateListeners) listener(surfaceId, state)
  }
}
