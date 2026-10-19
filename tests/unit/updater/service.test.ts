import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import type { UpdaterEvent } from '../../../src/shared/ipc/updater'

vi.mock('electron', () => ({ app: { getVersion: () => '0.9.1', isPackaged: true } }))
vi.mock('electron-log', () => ({ default: { error: vi.fn() } }))
vi.mock('electron-updater', async () => {
  const { EventEmitter } = await import('node:events')
  // Match native ESM loading of the CommonJS package: autoUpdater is on default only.
  return { default: { autoUpdater: Object.assign(new EventEmitter(), {
    checkForUpdates: vi.fn(), downloadUpdate: vi.fn(), quitAndInstall: vi.fn(),
    autoDownload: true, autoInstallOnAppQuit: true, logger: null,
  }) } }
})

import updaterModule from 'electron-updater'
import { UpdateService } from '../../../src/main/updater/service'
import { applyUpdaterEvent } from '../../../src/renderer/src/lib/updater-badge'

const { autoUpdater } = updaterModule

const savedPortableDir = process.env.PORTABLE_EXECUTABLE_DIR
const info = { version: '0.9.2', releaseNotes: '<p>Fix session recovery</p>' }

beforeEach(() => {
  delete process.env.PORTABLE_EXECUTABLE_DIR
  vi.resetAllMocks()
  autoUpdater.removeAllListeners()
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  vi.mocked(autoUpdater.checkForUpdates).mockImplementation(async () => {
    autoUpdater.emit('checking-for-update')
    autoUpdater.emit('update-available', info)
    return null
  })
  vi.mocked(autoUpdater.downloadUpdate).mockImplementation(async () => {
    autoUpdater.emit('download-progress', { percent: 37.6 })
    autoUpdater.emit('update-downloaded', info)
    return ['isolated-installer.exe']
  })
})
afterEach(() => {
  if (savedPortableDir === undefined) delete process.env.PORTABLE_EXECUTABLE_DIR
  else process.env.PORTABLE_EXECUTABLE_DIR = savedPortableDir
})

function observe(service: UpdateService) {
  let rendered = service.getState()
  const events: UpdaterEvent[] = []
  service.setMainWindow({
    isDestroyed: () => false,
    webContents: { send: (_channel: string, event: UpdaterEvent) => {
      events.push(event)
      rendered = applyUpdaterEvent(rendered, event)
    } },
  } as unknown as BrowserWindow)
  return { events, get state() { return rendered } }
}

describe('user-controlled updater', () => {
  it('checks only notify; neither downloads nor normal-exit installation are enabled', async () => {
    const service = new UpdateService()
    const state = await service.checkForUpdates()
    expect(state.phase).toBe('available')
    expect(state.releaseNotes).toBe('Fix session recovery')
    expect(autoUpdater.autoDownload).toBe(false)
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false)
    expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled()
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('downloads on request and installs only on a separate request', async () => {
    const service = new UpdateService()
    service.setAutoCheck(false)
    const view = observe(service)
    await service.checkForUpdates()
    expect((await service.downloadUpdate()).phase).toBe('downloaded')
    expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    expect(view.events.some(event => event.state.phase === 'downloading' && event.state.downloadPercent === 38)).toBe(true)
    expect(view.state).toEqual(service.getState())
    expect(await service.quitAndInstall()).toEqual({ ok: true })
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('keeps failed downloads retryable without automatically retrying or installing', async () => {
    const service = new UpdateService()
    await service.checkForUpdates()
    vi.mocked(autoUpdater.downloadUpdate).mockImplementationOnce(async () => {
      autoUpdater.emit('error', new Error('connection reset'))
      throw new Error('connection reset')
    })
    expect(await service.downloadUpdate()).toMatchObject({ phase: 'error', availableVersion: '0.9.2', error: 'connection reset' })
    expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(await service.quitAndInstall()).toEqual({ ok: false, error: 'not-downloaded' })
    expect(await service.downloadUpdate()).toMatchObject({ phase: 'downloaded', error: null, downloadPercent: 100 })
    expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(2)
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('keeps a downloaded update installable after an actual failed metadata recheck', async () => {
    const service = new UpdateService()
    const view = observe(service)
    await service.checkForUpdates()
    await service.downloadUpdate()
    vi.mocked(autoUpdater.checkForUpdates).mockRejectedValueOnce(new Error('offline'))
    expect(await service.checkForUpdates()).toMatchObject({
      phase: 'downloaded', availableVersion: '0.9.2', releaseNotes: 'Fix session recovery', downloadPercent: 100, error: 'offline',
    })
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2)
    expect(view.state).toEqual(service.getState())
    expect(await service.quitAndInstall()).toEqual({ ok: true })
    expect(service.getState().error).toBeNull()
  })

  it('does not mislabel a cached installer when a later check finds a different version', async () => {
    const service = new UpdateService()
    await service.checkForUpdates()
    await service.downloadUpdate()
    vi.mocked(autoUpdater.checkForUpdates).mockImplementationOnce(async () => {
      autoUpdater.emit('update-available', { version: '0.9.3', releaseNotes: 'Different release' })
      return null
    })
    expect(await service.checkForUpdates()).toMatchObject({ phase: 'downloaded', availableVersion: '0.9.2', releaseNotes: 'Fix session recovery' })
    await service.downloadUpdate()
    expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(await service.quitAndInstall()).toEqual({ ok: true })
  })

  it('does not discard a ready installer if the feed no longer offers an update', async () => {
    const service = new UpdateService()
    await service.checkForUpdates()
    await service.downloadUpdate()
    vi.mocked(autoUpdater.checkForUpdates).mockImplementationOnce(async () => {
      autoUpdater.emit('update-not-available', { version: '0.9.1' })
      return null
    })
    expect(await service.checkForUpdates()).toMatchObject({ phase: 'downloaded', availableVersion: '0.9.2', downloadPercent: 100 })
    expect(await service.quitAndInstall()).toEqual({ ok: true })
  })

  it('does not start competing downloads or recheck during a download', async () => {
    const service = new UpdateService()
    await service.checkForUpdates()
    let finish!: (files: string[]) => void
    vi.mocked(autoUpdater.downloadUpdate).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const downloading = service.downloadUpdate()
    await vi.waitFor(() => expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1))
    expect((await service.checkForUpdates()).phase).toBe('downloading')
    expect((await service.downloadUpdate()).phase).toBe('downloading')
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
    autoUpdater.emit('update-downloaded', info)
    finish(['isolated-installer.exe'])
    expect((await downloading).phase).toBe('downloaded')
  })

  it('background events deliver full release notes to an already-open panel', async () => {
    const service = new UpdateService()
    const view = observe(service)
    await service.checkForUpdates()
    expect(view.state).toEqual(service.getState())
    expect(view.state.releaseNotes).toBe('Fix session recovery')
    await service.downloadUpdate()
    expect(view.state).toEqual(service.getState())
    expect(view.state.releaseNotes).toBe('Fix session recovery')
  })

  it('does not race a pending metadata check against another check or download', async () => {
    const service = new UpdateService()
    await service.checkForUpdates()
    let finish!: () => void
    vi.mocked(autoUpdater.checkForUpdates).mockImplementationOnce(() => new Promise(resolve => {
      finish = () => { autoUpdater.emit('update-available', info); resolve(null) }
    }))
    const checking = service.checkForUpdates()
    await vi.waitFor(() => expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2))
    await Promise.all([service.checkForUpdates(), service.downloadUpdate()])
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2)
    expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled()
    finish()
    await checking
    await service.downloadUpdate()
    expect(service.getState().phase).toBe('downloaded')
  })

  it('reports installation errors and allows an explicit retry', async () => {
    const service = new UpdateService()
    await service.checkForUpdates()
    await service.downloadUpdate()
    vi.mocked(autoUpdater.quitAndInstall).mockImplementationOnce(() => { autoUpdater.emit('error', new Error('installer unavailable')) })
    expect(await service.quitAndInstall()).toEqual({ ok: false, error: 'installer unavailable' })
    expect(service.getState().phase).toBe('downloaded')
    expect(await service.quitAndInstall()).toEqual({ ok: true })
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(2)
  })

  it('blocks unsupported runtimes and download/install before discovering a version', async () => {
    const service = new UpdateService()
    expect((await service.downloadUpdate()).phase).toBe('idle')
    expect(await service.quitAndInstall()).toEqual({ ok: false, error: 'not-downloaded' })
    process.env.PORTABLE_EXECUTABLE_DIR = 'C:\\isolated-audit-portable'
    expect((await service.checkForUpdates()).unsupportedReason).toBe('portable')
    expect((await service.downloadUpdate()).phase).toBe('unsupported')
    expect(await service.quitAndInstall()).toEqual({ ok: false, error: 'unsupported' })
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled()
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })
})
