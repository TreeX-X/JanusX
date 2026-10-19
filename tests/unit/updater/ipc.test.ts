import { beforeAll, expect, it, vi } from 'vitest'
import { UPDATER_CHANNELS, UPDATER_EVENT_CHANNELS, type UpdaterAPI, type UpdaterEvent } from '../../../src/shared/ipc/updater'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(), invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn(),
  downloadUpdate: vi.fn(), setAutoCheck: vi.fn(), updateSettings: vi.fn(),
}))
let api: UpdaterAPI
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (_name: string, exposed: { updater: UpdaterAPI }) => { api = exposed.updater } },
  ipcRenderer: { invoke: mocks.invoke, on: mocks.on, removeListener: mocks.removeListener, send: vi.fn() },
  ipcMain: { handle: mocks.handle }, shell: { openExternal: vi.fn() },
}))
vi.mock('../../../src/main/updater/service', () => ({ updateService: {
  getState: vi.fn(), checkForUpdates: vi.fn(), downloadUpdate: mocks.downloadUpdate,
  quitAndInstall: vi.fn(), setAutoCheck: mocks.setAutoCheck,
} }))
vi.mock('../../../src/main/config/service', () => ({ configService: {
  getUpdaterSettings: vi.fn(), updateUpdaterSettings: mocks.updateSettings,
} }))

beforeAll(async () => {
  await import('../../../src/preload/index')
  const { registerUpdaterHandlers } = await import('../../../src/main/ipc/updater-handlers')
  registerUpdaterHandlers()
  registerUpdaterHandlers()
})

it('routes explicit download from preload to one registered main handler', async () => {
  const handlers = mocks.handle.mock.calls.filter(([channel]) => channel === UPDATER_CHANNELS.download)
  expect(handlers).toHaveLength(1)
  const state = { phase: 'downloading', downloadPercent: 0 }
  mocks.downloadUpdate.mockResolvedValue(state)
  expect(await handlers[0][1]()).toBe(state)
  mocks.invoke.mockResolvedValue(state)
  expect(await api.download()).toBe(state)
  expect(mocks.invoke).toHaveBeenCalledWith(UPDATER_CHANNELS.download)
})

it('forwards full state events and removes the exact subscription listener', () => {
  const callback = vi.fn()
  const off = api.onEvent(callback)
  const listener = mocks.on.mock.calls.find(([channel]) => channel === UPDATER_EVENT_CHANNELS.event)![1]
  const event: UpdaterEvent = { type: 'state', state: {
    phase: 'downloaded', supported: true, unsupportedReason: null, currentVersion: '0.9.1',
    availableVersion: '0.9.2', releaseNotes: 'Recovery fix', downloadPercent: 100, error: 'offline',
  } }
  listener({}, event)
  expect(callback).toHaveBeenCalledWith(event)
  off()
  expect(mocks.removeListener).toHaveBeenCalledWith(UPDATER_EVENT_CHANNELS.event, listener)
})

it('changes the scheduler only after successfully persisting the preference', async () => {
  const handler = mocks.handle.mock.calls.find(([channel]) => channel === UPDATER_CHANNELS.updateSettings)![1]
  mocks.updateSettings.mockRejectedValueOnce(new Error('disk full'))
  await expect(handler({}, { autoCheck: false })).rejects.toThrow('disk full')
  expect(mocks.setAutoCheck).not.toHaveBeenCalled()
  mocks.updateSettings.mockResolvedValueOnce({ autoCheck: false })
  expect(await handler({}, { autoCheck: false })).toEqual({ autoCheck: false })
  expect(mocks.setAutoCheck).toHaveBeenCalledWith(false)
})
