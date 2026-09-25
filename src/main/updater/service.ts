// Note: Win nsis auto-update via GitHub Releases — see .agents/notes/2026-07-14-app-auto-update-win--5fdf2273.md
import { app, type BrowserWindow } from 'electron'
import log from 'electron-log'
import type { autoUpdater as AutoUpdater } from 'electron-updater'
import { UPDATER_EVENT_CHANNELS, formatReleaseNotes, type UpdaterEvent, type UpdaterState } from '../../shared/ipc/updater'
import { isAutoUpdateSupported, resolveUnsupportedReason } from './guards'

const STARTUP_DELAY_MS = 30_000
const POLL_INTERVAL_MS = 6 * 60 * 60 * 1_000

type AutoUpdaterInstance = typeof AutoUpdater

export class UpdateService {
  private updater: AutoUpdaterInstance | null = null
  private wired = false
  private armed = false
  private autoCheck = true
  private timer: ReturnType<typeof setTimeout> | null = null
  private mainWindow: BrowserWindow | null = null
  private state: UpdaterState = {
    phase: 'idle',
    supported: false,
    unsupportedReason: null,
    currentVersion: app.getVersion(),
    availableVersion: null,
    downloadPercent: null,
    releaseNotes: null,
    error: null,
  }

  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window && !window.isDestroyed() ? window : null
  }

  getState(): UpdaterState {
    this.refreshSupport()
    return { ...this.state }
  }

  /** 主窗口重建与定时轮询共用同一入口；重复调用不产生第二个计时器。 */
  startAutoCheck(): void {
    this.refreshSupport()
    if (this.armed || !this.state.supported) return
    this.armed = true
    if (this.autoCheck) this.schedule()
  }

  /**
   * 设置页开关的运行时侧：关闭即停计时器（手动检查不受影响），
   * 打开后若服务已就绪则立即排期，不等下次启动。
   */
  setAutoCheck(enabled: boolean): void {
    this.autoCheck = enabled
    if (!enabled) {
      this.clearTimer()
      return
    }
    this.refreshSupport()
    if (this.armed && this.state.supported && !this.timer) this.schedule()
  }

  private schedule(): void {
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      void this.checkForUpdates()
      this.timer = setInterval(() => {
        void this.checkForUpdates()
      }, POLL_INTERVAL_MS)
      this.timer.unref?.()
    }, STARTUP_DELAY_MS)
    this.timer.unref?.()
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async checkForUpdates(): Promise<UpdaterState> {
    this.refreshSupport()
    if (!this.state.supported) return this.getState()
    const updater = await this.loadUpdater()
    if (!updater) return this.getState()
    this.patch({ phase: 'checking', error: null })
    try {
      await updater.checkForUpdates()
    } catch (error) {
      this.fail(error)
    }
    return this.getState()
  }

  async quitAndInstall(): Promise<{ ok: boolean; error?: string }> {
    this.refreshSupport()
    if (!this.state.supported) return { ok: false, error: 'unsupported' }
    if (this.state.phase !== 'downloaded') return { ok: false, error: 'not-downloaded' }
    const updater = await this.loadUpdater()
    if (!updater) return { ok: false, error: 'unavailable' }
    // nsis 非一键安装：保留安装向导可见，装完自动重启。
    updater.quitAndInstall(false, true)
    return { ok: true }
  }

  private refreshSupport(): void {
    const reason = resolveUnsupportedReason({
      platform: process.platform,
      isPackaged: app.isPackaged,
      portableDir: process.env.PORTABLE_EXECUTABLE_DIR,
    })
    const supported = reason === null
    this.state = {
      ...this.state,
      supported,
      unsupportedReason: reason,
      currentVersion: app.getVersion(),
      phase: supported ? this.state.phase : 'unsupported',
    }
  }

  private async loadUpdater(): Promise<AutoUpdaterInstance | null> {
    if (this.updater) return this.updater
    if (!isAutoUpdateSupported({
      platform: process.platform,
      isPackaged: app.isPackaged,
      portableDir: process.env.PORTABLE_EXECUTABLE_DIR,
    })) {
      return null
    }
    try {
      const { autoUpdater } = await import('electron-updater')
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true
      // 现场排障唯一依据：file transport 落 userData/logs，console 同步一份。
      autoUpdater.logger = log
      this.wireEvents(autoUpdater)
      this.updater = autoUpdater
      return autoUpdater
    } catch (error) {
      log.error('[updater] load electron-updater failed:', error)
      this.fail(error)
      return null
    }
  }

  private wireEvents(updater: AutoUpdaterInstance): void {
    if (this.wired) return
    this.wired = true
    updater.on('checking-for-update', () => {
      this.patch({ phase: 'checking', error: null })
      this.emit({ type: 'checking' })
    })
    updater.on('update-available', (info) => {
      this.patch({
        phase: 'available',
        availableVersion: info?.version ?? null,
        releaseNotes: formatReleaseNotes(info?.releaseNotes),
      })
      this.emit({ type: 'available', version: info?.version ?? '' })
    })
    updater.on('update-not-available', (info) => {
      this.patch({ phase: 'up-to-date', availableVersion: null, downloadPercent: null, releaseNotes: null })
      this.emit({ type: 'not-available', version: info?.version ?? this.state.currentVersion })
    })
    updater.on('download-progress', (progress) => {
      const percent = typeof progress?.percent === 'number' ? Math.round(progress.percent) : null
      this.patch({ phase: 'downloading', downloadPercent: percent })
      if (percent !== null) this.emit({ type: 'progress', percent })
    })
    updater.on('update-downloaded', (info) => {
      this.patch({
        phase: 'downloaded',
        availableVersion: info?.version ?? this.state.availableVersion,
        downloadPercent: 100,
        releaseNotes: formatReleaseNotes(info?.releaseNotes) ?? this.state.releaseNotes,
      })
      this.emit({ type: 'downloaded', version: info?.version ?? '' })
    })
    updater.on('error', (error) => {
      this.fail(error)
    })
  }

  private patch(partial: Partial<UpdaterState>): void {
    this.state = { ...this.state, ...partial }
  }

  private fail(error: unknown): void {
    const message = error instanceof Error ? error.message : '未知错误'
    log.error('[updater] update failed:', message)
    this.patch({ phase: 'error', error: message })
    this.emit({ type: 'error', message })
  }

  private emit(event: UpdaterEvent): void {
    const target = this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : null
    if (!target) return
    target.webContents.send(UPDATER_EVENT_CHANNELS.event, event)
  }
}

export const updateService = new UpdateService()
