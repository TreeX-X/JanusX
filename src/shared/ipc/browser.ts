export const BROWSER_INVOKE_CHANNELS = {
  createSurface: 'browser:surface:create',
  destroySurface: 'browser:surface:destroy',
  popOut: 'browser:surface:pop-out',
  embed: 'browser:surface:embed',
  setBounds: 'browser:surface:set-bounds',
  getState: 'browser:surface:get-state',
  openTab: 'browser:tab:open',
  closeTab: 'browser:tab:close',
  activateTab: 'browser:tab:activate',
  navigate: 'browser:navigate',
  goBack: 'browser:go-back',
  goForward: 'browser:go-forward',
  reload: 'browser:reload',
} as const

export const BROWSER_EVENT_CHANNELS = {
  state: 'browser:event:state',
  agentControl: 'browser:event:agent-control',
} as const

/*-- 浏览器 surface 载体：嵌入主窗口 pane 或独立窗口 --*/
export type BrowserCarrier = 'pane' | 'window'

export interface BrowserBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface BrowserTabState {
  tabId: string
  url: string
  title: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

export interface BrowserSurfaceState {
  surfaceId: string
  carrier: BrowserCarrier
  tabs: BrowserTabState[]
  activeTabId: string | null
  agentControlled: boolean
  /*-- surface 销毁时主进程推送最后一次状态并置 true，渲染端据此移除本地状态 --*/
  destroyed?: boolean
}

export interface BrowserAgentControlEvent {
  surfaceId: string
  active: boolean
}

export interface CreateBrowserSurfaceRequest {
  surfaceId: string
  carrier: BrowserCarrier
  url?: string
}

export type BrowserResult<T> = { success: true; data: T } | { success: false; error: string }

export interface BrowserAPI {
  createSurface(request: CreateBrowserSurfaceRequest): Promise<BrowserResult<{ surfaceId: string }>>
  destroySurface(surfaceId: string): Promise<void>
  popOut(surfaceId: string): Promise<BrowserResult<{ surfaceId: string }>>
  embed(surfaceId: string): Promise<BrowserResult<{ surfaceId: string }>>
  setBounds(surfaceId: string, bounds: BrowserBounds): Promise<void>
  getState(surfaceId: string): Promise<BrowserSurfaceState | null>
  openTab(surfaceId: string, url?: string): Promise<BrowserResult<{ tabId: string }>>
  closeTab(surfaceId: string, tabId: string): Promise<void>
  activateTab(surfaceId: string, tabId: string): Promise<void>
  navigate(surfaceId: string, tabId: string, url: string): Promise<void>
  goBack(surfaceId: string, tabId: string): Promise<void>
  goForward(surfaceId: string, tabId: string): Promise<void>
  reload(surfaceId: string, tabId: string): Promise<void>
  onStateChanged(callback: (state: BrowserSurfaceState) => void): () => void
  onAgentControlChanged(callback: (event: BrowserAgentControlEvent) => void): () => void
}
