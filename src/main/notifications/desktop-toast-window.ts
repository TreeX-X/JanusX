import { BrowserWindow, app, ipcMain, screen, type IpcMainEvent } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'

export interface DesktopToastPayload {
  id: string
  type: 'completed' | 'failed' | 'attention'
  engine?: string
  title: string
  body: string
  terminalId?: string
  workspaceId?: string
  createdAt: string
}

interface DesktopToastOptions {
  onClick?: () => void
  onShown?: () => void
  onError?: (error: string) => void
  timeoutMs?: number
}

const TOAST_WIDTH = 380
const TOAST_HEIGHT = 112
const TOAST_MARGIN = 18
const DEFAULT_TIMEOUT_MS = 8_000

class DesktopToastWindow {
  private toastWindow: BrowserWindow | null = null
  private rendererReady = false
  private currentPayload: DesktopToastPayload | null = null
  private currentOptions: DesktopToastOptions | null = null
  private hideTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    ipcMain.on('desktop-toast:ready', this.handleReady)
    ipcMain.on('desktop-toast:action', this.handleAction)
  }

  show(payload: DesktopToastPayload, options: DesktopToastOptions = {}): boolean {
    if (!app.isReady()) {
      options.onError?.('app-not-ready')
      return false
    }

    this.currentPayload = payload
    this.currentOptions = options

    try {
      const win = this.ensureWindow()
      this.positionWindow(win)
      this.flush()
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      options.onError?.(message)
      return false
    }
  }

  private ensureWindow(): BrowserWindow {
    if (this.toastWindow && !this.toastWindow.isDestroyed()) return this.toastWindow

    this.rendererReady = false
    const win = new BrowserWindow({
      width: TOAST_WIDTH,
      height: TOAST_HEIGHT,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      focusable: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        sandbox: false,
      },
    })

    win.setAlwaysOnTop(true, 'screen-saver')
    win.on('closed', () => {
      if (this.toastWindow === win) {
        this.toastWindow = null
        this.rendererReady = false
      }
    })
    win.webContents.on('did-fail-load', (_event, _code, description) => {
      this.currentOptions?.onError?.(description || 'desktop-toast-load-failed')
    })

    this.toastWindow = win
    void this.loadToastApp(win).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      this.currentOptions?.onError?.(message)
    })

    return win
  }

  private async loadToastApp(win: BrowserWindow): Promise<void> {
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      const url = new URL(process.env['ELECTRON_RENDERER_URL'])
      url.searchParams.set('desktopToast', '1')
      await win.loadURL(url.toString())
      return
    }

    await win.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { desktopToast: '1' },
    })
  }

  private positionWindow(win: BrowserWindow): void {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const { workArea } = display
    win.setBounds({
      width: TOAST_WIDTH,
      height: TOAST_HEIGHT,
      x: Math.round(workArea.x + workArea.width - TOAST_WIDTH - TOAST_MARGIN),
      y: Math.round(workArea.y + workArea.height - TOAST_HEIGHT - TOAST_MARGIN),
    })
  }

  private flush(): void {
    const win = this.toastWindow
    if (!win || win.isDestroyed() || !this.rendererReady || !this.currentPayload) return

    if (this.hideTimer) {
      clearTimeout(this.hideTimer)
      this.hideTimer = null
    }

    win.webContents.send('desktop-toast:show', this.currentPayload)
    this.positionWindow(win)
    win.showInactive()
    this.currentOptions?.onShown?.()

    const timeoutMs = this.currentOptions?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.hideTimer = setTimeout(() => this.hide(), timeoutMs)
    this.hideTimer.unref?.()
  }

  private hide(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer)
      this.hideTimer = null
    }

    const win = this.toastWindow
    if (win && !win.isDestroyed()) win.hide()
    this.currentPayload = null
    this.currentOptions = null
  }

  /** Destroy the toast window so it cannot keep the app alive on quit. */
  destroy(): void {
    this.hide()
    const win = this.toastWindow
    this.toastWindow = null
    this.rendererReady = false
    if (win && !win.isDestroyed()) {
      win.destroy()
    }
  }

  private handleReady = (event: IpcMainEvent): void => {
    const win = this.toastWindow
    if (!win || win.isDestroyed() || event.sender !== win.webContents) return
    this.rendererReady = true
    this.flush()
  }

  private handleAction = (event: IpcMainEvent, payload?: { action?: string }): void => {
    const win = this.toastWindow
    if (!win || win.isDestroyed() || event.sender !== win.webContents) return

    const action = payload?.action
    if (action === 'activate') {
      this.currentOptions?.onClick?.()
    }
    if (action === 'activate' || action === 'dismiss') {
      this.hide()
    }
  }
}

export const desktopToastWindow = new DesktopToastWindow()
