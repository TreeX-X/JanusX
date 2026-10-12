import { beforeAll, expect, it, vi } from 'vitest'
import { BLUEPRINT_REVIEW_CHANNELS, type BlueprintReviewAPI } from '../../src/shared/ipc/blueprint-review'

const mocks = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>(), listeners: new Map<string, (...args: unknown[]) => unknown>(),
  repairPrepare: vi.fn(), repairDiff: vi.fn(), repairUndo: vi.fn(), readSaved: vi.fn(), markRead: vi.fn(), readActivity: vi.fn(), activityListener: null as ((update: unknown) => void) | null, resultListener: null as ((update: unknown) => void) | null, send: vi.fn(), removeListener: vi.fn(), invoke: vi.fn(), getKey: vi.fn(), setKey: vi.fn() }))
let api: BlueprintReviewAPI
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => mocks.handlers.set(channel, handler) },
  BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { isDestroyed: () => false, send: mocks.send } }] },
  ipcRenderer: { invoke: mocks.invoke, on: (channel: string, listener: (...args: unknown[]) => unknown) => mocks.listeners.set(channel, listener), removeListener: mocks.removeListener, send: vi.fn() },
  contextBridge: { exposeInMainWorld: (_name: string, exposed: { blueprintReview: BlueprintReviewAPI }) => { api = exposed.blueprintReview } },
}))
vi.mock('../../src/main/blueprint/review/runtime', () => ({ blueprintReviewRuntime: () => ({ reading: { mark: mocks.markRead }, readSaved: mocks.readSaved, repairs: { prepare: mocks.repairPrepare, diff: mocks.repairDiff, undo: mocks.repairUndo }, activityRead: mocks.readActivity, onActivityChanged: (listener: (update: unknown) => void) => { mocks.activityListener = listener }, onResultsChanged: (listener: (update: unknown) => void) => { mocks.resultListener = listener } }), shutdownBlueprintReview: vi.fn() }))
vi.mock('../../src/main/shutdown/AppShutdown', () => ({ appShutdown: { configure: vi.fn() } }))
vi.mock('../../src/main/blueprint/review/models', () => ({ checkReviewConfiguration: vi.fn() }))
vi.mock('../../src/main/llm/jev-credentials', () => ({ getJevKey: mocks.getKey, setJevKey: mocks.setKey }))
vi.mock('../../src/main/blueprint/mcp/runtime', () => ({ noteMcpClients: () => ({}), probeNoteMcp: vi.fn() }))
beforeAll(async () => {
  const { registerBlueprintReviewHandlers } = await import('../../src/main/ipc/blueprint-review-handlers')
  registerBlueprintReviewHandlers()
  await import('../../src/preload/index')
})

it('keeps status boolean and reveals the saved credential only through the explicit read channel', async () => {
  mocks.getKey.mockResolvedValue('fixture-key')
  expect(await mocks.handlers.get(BLUEPRINT_REVIEW_CHANNELS.credentialStatus)!({})).toBe(true)
  expect(await mocks.handlers.get(BLUEPRINT_REVIEW_CHANNELS.credentialGet)!({})).toBe('fixture-key')
  mocks.invoke.mockResolvedValue('fixture-key')
  expect(await api.credentialGet()).toBe('fixture-key')
  expect(mocks.invoke).toHaveBeenCalledWith(BLUEPRINT_REVIEW_CHANNELS.credentialGet)
  expect(new Set(Object.values(BLUEPRINT_REVIEW_CHANNELS)).size).toBe(Object.values(BLUEPRINT_REVIEW_CHANNELS).length)
})

it('delivers activity updates through main and preload and disposes the renderer listener', () => {
  const update = { root: 'C:/fixture', revision: 1, automatic: { phase: 'checking', commits: 5, threshold: 5, remaining: 0 }, activities: [] }
  mocks.activityListener!(update)
  expect(mocks.send).toHaveBeenCalledWith(BLUEPRINT_REVIEW_CHANNELS.activityChanged, update)
  const received = vi.fn()
  const stop = api.onActivityChanged(received)
  mocks.listeners.get(BLUEPRINT_REVIEW_CHANNELS.activityChanged)!({}, update)
  expect(received).toHaveBeenCalledWith(update)
  stop()
  expect(mocks.removeListener).toHaveBeenCalledWith(BLUEPRINT_REVIEW_CHANNELS.activityChanged, expect.any(Function))
})

it('broadcasts committed findings through main/preload and disposes its listener', () => {
  const update = { context: { repoId: '00000000-0000-4000-8000-000000000001', workspacePath: 'C:/fixture', branch: 'main' }, revision: 8, items: [] }
  mocks.resultListener!(update)
  expect(mocks.send).toHaveBeenCalledWith(BLUEPRINT_REVIEW_CHANNELS.resultsChanged, update)
  const receive = vi.fn(), stop = api.onResultsChanged(receive)
  mocks.listeners.get(BLUEPRINT_REVIEW_CHANNELS.resultsChanged)!({}, update)
  expect(receive).toHaveBeenCalledWith(update)
  stop()
  expect(mocks.removeListener).toHaveBeenCalledWith(BLUEPRINT_REVIEW_CHANNELS.resultsChanged, expect.any(Function))
})

it('reads lightweight status through main/preload without requesting the Note view', async () => {
  const update = { root: 'C:/fixture', revision: 3, automaticSettings: { enabled: true, commits: 3 }, activities: [] }
  mocks.readActivity.mockResolvedValue(update)
  expect(await mocks.handlers.get(BLUEPRINT_REVIEW_CHANNELS.activityRead)!({}, 'C:/fixture')).toEqual(update)
  mocks.invoke.mockResolvedValue(update)
  expect(await api.activityRead('C:/fixture')).toEqual(update)
  expect(mocks.invoke).toHaveBeenLastCalledWith(BLUEPRINT_REVIEW_CHANNELS.activityRead, 'C:/fixture')
  expect(() => mocks.handlers.get(BLUEPRINT_REVIEW_CHANNELS.activityRead)!({}, '')).toThrow()
})

it('preserves repair selection and returns guarded undo feedback through main and preload', async () => {
  const id = '00000000-0000-4000-8000-000000000005'
  const input = { context: { repoId: id, workspacePath: 'C:/fixture', branch: 'main' }, kind: 'suggestions', intent: 'repair', noteId: id, reportRevision: 7, findingIds: [id] }
  mocks.repairPrepare.mockResolvedValue({ id }); mocks.invoke.mockResolvedValue({ id })
  expect(await mocks.handlers.get(BLUEPRINT_REVIEW_CHANNELS.repairPrepare)!({}, input)).toEqual({ id })
  expect(mocks.repairPrepare).toHaveBeenCalledWith(input); await api.repairPrepare(input as never)
  expect(mocks.invoke).toHaveBeenLastCalledWith(BLUEPRINT_REVIEW_CHANNELS.repairPrepare, input)
  mocks.repairDiff.mockResolvedValue({ before: 'A', after: 'B' }); await mocks.handlers.get(BLUEPRINT_REVIEW_CHANNELS.repairDiff)!({}, id); await api.repairDiff(id)
  expect(mocks.invoke).toHaveBeenLastCalledWith(BLUEPRINT_REVIEW_CHANNELS.repairDiff, id)
  const update = { id, phase: 'reverted', error: 'Rollback complete; review unavailable' }
  mocks.repairUndo.mockResolvedValue(update); mocks.invoke.mockResolvedValue(update)
  expect(await mocks.handlers.get(BLUEPRINT_REVIEW_CHANNELS.repairUndo)!({}, id)).toEqual(update)
  expect(await api.repairUndo(id)).toEqual(update)
  expect(mocks.invoke).toHaveBeenLastCalledWith(BLUEPRINT_REVIEW_CHANNELS.repairUndo, id)
  await expect(mocks.handlers.get(BLUEPRINT_REVIEW_CHANNELS.repairUndo)!({}, '../other')).rejects.toThrow()
})

it('reads saved discovery data and broadcasts actual acknowledgements without a second source read', async () => {
  const context = { repoId: '00000000-0000-4000-8000-000000000001', workspacePath: 'C:/fixture', branch: 'main' }
  const result = { context, updates: { ready: true, complete: true, revision: 8, entries: [] } }
  mocks.readSaved.mockResolvedValue({ context, sourcesPending: true }); mocks.invoke.mockResolvedValue({ context, sourcesPending: true })
  expect(await mocks.handlers.get(BLUEPRINT_REVIEW_CHANNELS.readSaved)!({}, 'C:/fixture')).toMatchObject({ sourcesPending: true })
  await api.readSaved('C:/fixture')
  expect(mocks.invoke).toHaveBeenLastCalledWith(BLUEPRINT_REVIEW_CHANNELS.readSaved, 'C:/fixture')
  mocks.markRead.mockResolvedValue(result)
  await mocks.handlers.get(BLUEPRINT_REVIEW_CHANNELS.markRead)!({}, context, [{ noteId: context.repoId, hash: 'a'.repeat(64), path: '.agents/notes/module.md' }], false)
  expect(mocks.send).toHaveBeenCalledWith(BLUEPRINT_REVIEW_CHANNELS.readChanged, result)
  const receive = vi.fn(), stop = api.onReadChanged(receive)
  mocks.listeners.get(BLUEPRINT_REVIEW_CHANNELS.readChanged)!({}, result)
  expect(receive).toHaveBeenCalledWith(result)
  stop()
})
