import { beforeEach, describe, expect, it } from 'vitest'
import { ProjectType, type RunningProjectSummary } from '../../../src/shared/ipc/project'
import {
  ORPHAN_WORKSPACE_ID,
  groupByWorkspace,
  sortWorkspaceRunInfos,
  useRunningStore,
} from '../../../src/renderer/src/stores/running'

function summary(id: string, startTime = '2026-09-09T00:00:00.000Z'): RunningProjectSummary {
  return { id, pid: 1, type: ProjectType.Vite, name: 'dev', startTime, uptime: 1000 }
}

describe('groupByWorkspace', () => {
  it('groups projects by workspace path prefix', () => {
    const next = groupByWorkspace(
      [summary('C:\\a::dev::1'), summary('C:\\b::dev::2')],
      [
        { id: 'wa', name: 'A', path: 'C:\\a' },
        { id: 'wb', name: 'B', path: 'C:\\b' },
      ],
    )
    expect(Object.keys(next).sort()).toEqual(['wa', 'wb'])
    expect(next.wa.projects).toHaveLength(1)
    expect(next.wb.workspaceName).toBe('B')
  })

  it('prefers the longest path on prefix overlap', () => {
    const next = groupByWorkspace(
      [summary('/a/app2::dev::1')],
      [
        { id: 'w1', name: 'app', path: '/a/app' },
        { id: 'w2', name: 'app2', path: '/a/app2' },
      ],
    )
    expect(Object.keys(next)).toEqual(['w2'])
  })

  it('collects unknown processes into orphan without dropping', () => {
    const next = groupByWorkspace(
      [summary('/gone::dev::1')],
      [{ id: 'wa', name: 'A', path: '/a' }],
    )
    expect(next[ORPHAN_WORKSPACE_ID].projects).toHaveLength(1)
  })

  it('takes the earliest startTime and sorts stably', () => {
    const next = groupByWorkspace(
      [
        summary('C:\\b::dev::1', '2026-09-09T00:00:02.000Z'),
        summary('C:\\a::dev::1', '2026-09-09T00:00:01.000Z'),
      ],
      [
        { id: 'wa', name: 'A', path: 'C:\\a' },
        { id: 'wb', name: 'B', path: 'C:\\b' },
      ],
    )
    const sorted = sortWorkspaceRunInfos(Object.values(next))
    expect(sorted.map((info) => info.workspaceId)).toEqual(['wa', 'wb'])
    expect(next.wa.startedAt).toBe(Date.parse('2026-09-09T00:00:01.000Z'))
  })
})

describe('useRunningStore', () => {
  beforeEach(() => {
    useRunningStore.getState().resetForTests()
  })

  it('setFromGrouped replaces truth and clears stopping for vanished workspaces', () => {
    const store = useRunningStore.getState()
    store.setFromGrouped({
      wa: { workspaceId: 'wa', workspaceName: 'A', workspacePath: 'C:\\a', projects: [summary('C:\\a::dev::1')], startedAt: 1 },
    })
    useRunningStore.getState().markStopping('wa')
    useRunningStore.getState().setFromGrouped({})
    const state = useRunningStore.getState()
    expect(state.runningByWorkspace).toEqual({})
    expect(state.stoppingByWorkspace).toEqual({})
  })

  it('pulse increments per workspace', () => {
    useRunningStore.getState().pulse('wa')
    useRunningStore.getState().pulse('wa')
    expect(useRunningStore.getState().pulseByWorkspace.wa).toBe(2)
  })

  it('removeWorkspace cleans running and stopping', () => {
    const store = useRunningStore.getState()
    store.setFromGrouped({
      wa: { workspaceId: 'wa', workspaceName: 'A', workspacePath: 'C:\\a', projects: [summary('C:\\a::dev::1')], startedAt: 1 },
    })
    store.markStopping('wa')
    store.removeWorkspace('wa')
    expect(useRunningStore.getState().runningByWorkspace).toEqual({})
    expect(useRunningStore.getState().stoppingByWorkspace).toEqual({})
  })
})
