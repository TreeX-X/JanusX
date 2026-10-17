import { beforeEach, describe, expect, it } from 'vitest'
import { ProjectType, type RunningProjectSummary } from '../../../src/shared/ipc/project'
import {
  ORPHAN_WORKSPACE_ID,
  groupByWorkspace,
  scopeKey,
  sortWorkspaceRunInfos,
  useRunningStore,
} from '../../../src/renderer/src/stores/running'

function summary(id: string, startTime = '2026-09-09T00:00:00.000Z'): RunningProjectSummary {
  return { id, pid: 1, type: ProjectType.Vite, name: 'dev', startTime, uptime: 1000 }
}

function stamped(
  id: string,
  stamp: { workspaceId: string; scopePath: string; branch?: string; configName?: string },
  startTime = '2026-09-09T00:00:00.000Z',
): RunningProjectSummary {
  return { ...summary(id, startTime), ...stamp }
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

  it('builds one scope per distinct project path from id prefix', () => {
    const next = groupByWorkspace(
      [summary('C:\\a::dev::1'), summary('C:\\a::api::2')],
      [{ id: 'wa', name: 'A', path: 'C:\\a' }],
    )
    expect(next.wa.scopes).toHaveLength(1)
    expect(next.wa.scopes[0].scopePath).toBe('C:\\a')
    expect(next.wa.scopes[0].projects).toHaveLength(2)
  })
})

describe('groupByWorkspace with stamped identity', () => {
  const refs = [
    { id: 'wa', name: 'A', path: 'C:\\a' },
    { id: 'wb', name: 'B', path: 'C:\\b' },
  ]

  it('keeps out-of-tree worktree runs with their workspace instead of orphan', () => {
    const next = groupByWorkspace(
      [stamped('C:\\a-wt\\login::dev::1', { workspaceId: 'wa', scopePath: 'C:\\a-wt\\login', branch: 'feat/login' })],
      refs,
    )
    expect(Object.keys(next)).toEqual(['wa'])
    expect(next.wa.scopes).toHaveLength(1)
    expect(next.wa.scopes[0].branch).toBe('feat/login')
    expect(next[ORPHAN_WORKSPACE_ID]).toBeUndefined()
  })

  it('groups runs of one workspace by worktree scope', () => {
    const next = groupByWorkspace(
      [
        stamped('C:\\a-wt\\login::dev::1', { workspaceId: 'wa', scopePath: 'C:\\a-wt\\login', branch: 'feat/login' }),
        stamped('C:\\a-wt\\login::api::2', { workspaceId: 'wa', scopePath: 'C:\\a-wt\\login', branch: 'feat/login' }),
        stamped('C:\\a::dev::3', { workspaceId: 'wa', scopePath: 'C:\\a', branch: 'main' }, '2026-09-09T00:00:01.000Z'),
      ],
      refs,
    )
    expect(next.wa.scopes).toHaveLength(2)
    // scopes sort by startedAt asc: login runs carry the earlier default stamp
    expect(next.wa.scopes.map((scope) => scope.branch)).toEqual(['feat/login', 'main'])
    expect(next.wa.scopes[0].projects).toHaveLength(2)
    expect(next.wa.scopes[1].projects).toHaveLength(1)
    expect(next.wa.projects).toHaveLength(3)
  })

  it('merges scope paths across slash and case spellings', () => {
    const next = groupByWorkspace(
      [
        stamped('C:/a-wt/login::dev::1', { workspaceId: 'wa', scopePath: 'C:/a-wt/login' }),
        stamped('C:\\a-wt\\login\\::api::2', { workspaceId: 'wa', scopePath: 'C:\\a-wt\\login\\' }),
      ],
      refs,
    )
    expect(next.wa.scopes).toHaveLength(1)
    expect(next.wa.scopes[0].projects).toHaveLength(2)
  })

  it('falls back to id prefix when stamped workspaceId is unknown', () => {
    const next = groupByWorkspace(
      [stamped('C:\\b::dev::1', { workspaceId: 'gone', scopePath: 'C:\\b' })],
      refs,
    )
    expect(Object.keys(next)).toEqual(['wb'])
    expect(next.wb.scopes[0].scopePath).toBe('C:\\b')
  })
})

describe('useRunningStore', () => {
  beforeEach(() => {
    useRunningStore.getState().resetForTests()
  })

  it('setFromGrouped replaces truth and clears stopping for vanished workspaces', () => {
    const store = useRunningStore.getState()
    store.setFromGrouped({
      wa: {
        workspaceId: 'wa',
        workspaceName: 'A',
        workspacePath: 'C:\\a',
        scopes: [{ scopePath: 'C:\\a', projects: [summary('C:\\a::dev::1')], startedAt: 1 }],
        projects: [summary('C:\\a::dev::1')],
        startedAt: 1,
      },
    })
    useRunningStore.getState().markStopping('wa')
    useRunningStore.getState().markStoppingScope('C:\\a')
    useRunningStore.getState().setFromGrouped({})
    const state = useRunningStore.getState()
    expect(state.runningByWorkspace).toEqual({})
    expect(state.stoppingByWorkspace).toEqual({})
    expect(state.stoppingByScope).toEqual({})
  })

  it('pulse increments per workspace', () => {
    useRunningStore.getState().pulse('wa')
    useRunningStore.getState().pulse('wa')
    expect(useRunningStore.getState().pulseByWorkspace.wa).toBe(2)
  })

  it('removeWorkspace cleans running and stopping', () => {
    const store = useRunningStore.getState()
    store.setFromGrouped({
      wa: {
        workspaceId: 'wa',
        workspaceName: 'A',
        workspacePath: 'C:\\a',
        scopes: [{ scopePath: 'C:\\a', projects: [summary('C:\\a::dev::1')], startedAt: 1 }],
        projects: [summary('C:\\a::dev::1')],
        startedAt: 1,
      },
    })
    store.markStopping('wa')
    store.removeWorkspace('wa')
    expect(useRunningStore.getState().runningByWorkspace).toEqual({})
    expect(useRunningStore.getState().stoppingByWorkspace).toEqual({})
  })
})
