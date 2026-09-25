import { beforeEach, describe, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ applyMaintenanceChangeSet: vi.fn(), applyMaintenanceUndo: vi.fn(), listMaintenanceAudits: vi.fn(), prepareMaintenanceUndo: vi.fn(), refresh: vi.fn(), error: null as string | null }))
vi.mock('../../src/renderer/src/services/blueprint', () => ({ ...api, cancelMaintenanceTask: vi.fn(), completeMaintenanceTask: vi.fn(), dismissMaintenanceProposal: vi.fn(), listMaintenanceTasks: vi.fn(), onMaintenanceTask: vi.fn(), startMaintenanceTask: vi.fn() }))
vi.mock('../../src/renderer/src/stores/blueprint', () => ({ useBlueprintStore: { getState: () => ({ refreshAfterAnalysis: api.refresh, error: api.error }) } }))
import { useBlueprintMaintenanceStore as store } from '../../src/renderer/src/stores/blueprint-maintenance'

describe('maintenance audit and refresh store', () => {
  beforeEach(() => { vi.clearAllMocks(); api.error = null; store.setState({ tasks: [], audits: {}, pendingUndo: null, error: null }); api.refresh.mockResolvedValue(undefined); api.listMaintenanceAudits.mockResolvedValue([]) })
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
