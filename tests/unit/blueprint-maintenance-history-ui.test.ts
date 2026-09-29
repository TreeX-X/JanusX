import { beforeEach, describe, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ applyMaintenanceChangeSet: vi.fn(), applyMaintenanceUndo: vi.fn(), listMaintenanceAudits: vi.fn(), listMaintenanceTasks: vi.fn(), onMaintenanceTask: vi.fn(), prepareMaintenanceUndo: vi.fn(), refresh: vi.fn(), error: null as string | null }))
vi.mock('../../src/renderer/src/services/blueprint', () => ({ ...api, cancelMaintenanceTask: vi.fn(), completeMaintenanceTask: vi.fn(), dismissMaintenanceProposal: vi.fn(), startMaintenanceTask: vi.fn() }))
vi.mock('../../src/renderer/src/stores/blueprint', () => ({ useBlueprintStore: { getState: () => ({ refreshAfterAnalysis: api.refresh, error: api.error }) } }))
import { useBlueprintMaintenanceStore as store } from '../../src/renderer/src/stores/blueprint-maintenance'

describe('maintenance audit and refresh store', () => {
  beforeEach(() => { vi.clearAllMocks(); api.error = null; store.setState({ tasks: [], audits: {}, pendingUndo: null, error: null }); api.refresh.mockResolvedValue(undefined); api.listMaintenanceAudits.mockResolvedValue([]) })
  it('keeps a newer proposal event when an older list response arrives, retaining other tasks', async () => {
    let finish!: (tasks: unknown[]) => void
    api.listMaintenanceTasks.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const reading = store.getState().initialize()
    const fresh = { id: 'one', status: 'proposal-ready', updatedAt: '2026-09-30T00:00:01Z' }
    api.onMaintenanceTask.mock.calls.at(-1)![0]({ task: fresh })
    finish([{ id: 'one', status: 'analyzing', updatedAt: '' }, { id: 'two', status: 'active', updatedAt: '' }])
    await reading
    expect(store.getState().tasks).toEqual([fresh, expect.objectContaining({ id: 'two' })])
  })
  it('ignores an older initialization failure after a successful refresh', async () => {
    let reject!: (error: Error) => void
    api.listMaintenanceTasks.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
    const old = store.getState().initialize()
    api.listMaintenanceTasks.mockResolvedValueOnce([])
    await store.getState().initialize()
    reject(new Error('old failure'))
    await old
    expect(store.getState().error).toBeNull()
  })
  it('uses actual applied/rejected audit records and refreshes after apply', async () => {
    const task = { id: 'task', blueprintId: 'checkout-b', updatedAt: '' }
    const audit = { id: 'audit', selectedOperationIds: ['one'], rejectedOperationIds: ['two'], status: 'applied' }
    api.applyMaintenanceChangeSet.mockResolvedValue({ task, appliedOperationIds: ['one'] }); api.listMaintenanceAudits.mockResolvedValue([audit])
    const input = { taskId: 'task', changeSetId: 'proposal', operationIds: ['one'], confirmedDeleteOperationIds: [] }
    expect(await store.getState().apply(input)).toBe(true)
    expect(api.applyMaintenanceChangeSet).toHaveBeenCalledWith(input)
    expect(store.getState().audits['checkout-b']).toEqual([audit])
    expect(api.refresh).toHaveBeenCalledOnce()
  })
  it('surfaces a stale apply without refreshing or inventing an audit', async () => {
    api.applyMaintenanceChangeSet.mockRejectedValue(new Error('STALE_SOURCE_HASH'))
    expect(await store.getState().apply({ taskId: 'task', changeSetId: 'proposal', operationIds: ['one'] })).toBe(false)
    expect(store.getState().error).toBe('STALE_SOURCE_HASH')
    expect(api.refresh).not.toHaveBeenCalled(); expect(api.listMaintenanceAudits).not.toHaveBeenCalled()
  })
  it('prepares and applies only selected undo operations then refreshes', async () => {
    const pending = { changeSet: { id: 'undo', blueprintId: 'checkout-b' }, conflicts: [] }
    api.prepareMaintenanceUndo.mockResolvedValue(pending); api.applyMaintenanceUndo.mockResolvedValue({ appliedOperationIds: ['undo-one'] })
    expect(await store.getState().prepareUndo('checkout-b', 'audit')).toBe(true)
    const input = { blueprintId: 'checkout-b', undoChangeSetId: 'undo', operationIds: ['undo-one'], confirmedDeleteOperationIds: [] }
    expect(await store.getState().applyUndo(input)).toBe(true)
    expect(api.applyMaintenanceUndo).toHaveBeenCalledWith(input)
    expect(store.getState().pendingUndo).toBeNull(); expect(api.refresh).toHaveBeenCalledOnce()
  })
  it('blocks another checkout and retains pending undo on a source conflict', async () => {
    api.prepareMaintenanceUndo.mockResolvedValue({ changeSet: { id: 'undo', blueprintId: 'checkout-b' }, conflicts: [] })
    await store.getState().prepareUndo('checkout-b', 'audit')
    expect(await store.getState().applyUndo({ blueprintId: 'checkout-a', undoChangeSetId: 'undo', operationIds: ['one'] })).toBe(false)
    expect(api.applyMaintenanceUndo).not.toHaveBeenCalled()
    api.applyMaintenanceUndo.mockRejectedValue(new Error('STALE_SOURCE_HASH'))
    expect(await store.getState().applyUndo({ blueprintId: 'checkout-b', undoChangeSetId: 'undo', operationIds: ['one'] })).toBe(false)
    expect(store.getState().pendingUndo).not.toBeNull(); expect(store.getState().error).toBe('STALE_SOURCE_HASH'); expect(api.refresh).not.toHaveBeenCalled()
  })
})
