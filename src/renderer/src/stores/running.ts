import { create } from 'zustand'
import type { RunningProjectSummary } from '../../../shared/ipc/project'

export interface WorkspaceRef {
  id: string
  name: string
  path: string
}

export interface WorkspaceRunInfo {
  workspaceId: string
  workspaceName: string
  workspacePath: string
  projects: RunningProjectSummary[]
  startedAt: number | null
}

export const ORPHAN_WORKSPACE_ID = '__orphan__'

/**
 * groupByWorkspace — projectService.list() 全量按工作区分组
 *
 * 分组键为 runner id 前缀 `${workspacePath}::`（见 services/project.ts）。
 * 路径前缀包含时（/a/app 与 /a/app2）按 path.length 降序优先最长匹配。
 * 查不到归属的进程归入 `__orphan__`，不丢球。
 */
export function groupByWorkspace(
  all: RunningProjectSummary[],
  workspaces: WorkspaceRef[],
): Record<string, WorkspaceRunInfo> {
  const sorted = [...workspaces].sort((a, b) => b.path.length - a.path.length)
  const grouped = new Map<string, WorkspaceRunInfo>()

  const ensure = (workspaceId: string, workspaceName: string, workspacePath: string): WorkspaceRunInfo => {
    const existing = grouped.get(workspaceId)
    if (existing) return existing
    const created: WorkspaceRunInfo = {
      workspaceId,
      workspaceName,
      workspacePath,
      projects: [],
      startedAt: null,
    }
    grouped.set(workspaceId, created)
    return created
  }

  for (const project of all) {
    const match = sorted.find((workspace) => project.id.startsWith(`${workspace.path}::`))
    const info = match
      ? ensure(match.id, match.name, match.path)
      : ensure(ORPHAN_WORKSPACE_ID, '未知归属', '')
    info.projects.push(project)
    const timestamp = Date.parse(project.startTime)
    if (Number.isFinite(timestamp)) {
      info.startedAt = info.startedAt === null ? timestamp : Math.min(info.startedAt, timestamp)
    }
  }

  return Object.fromEntries(grouped)
}

/** 按 startedAt 先后排序，保证球序稳定不跳 */
export function sortWorkspaceRunInfos(infos: WorkspaceRunInfo[]): WorkspaceRunInfo[] {
  return [...infos].sort((a, b) => {
    if (a.startedAt === null && b.startedAt === null) return a.workspaceId.localeCompare(b.workspaceId)
    if (a.startedAt === null) return 1
    if (b.startedAt === null) return -1
    if (a.startedAt !== b.startedAt) return a.startedAt - b.startedAt
    return a.workspaceId.localeCompare(b.workspaceId)
  })
}

interface RunningStore {
  runningByWorkspace: Record<string, WorkspaceRunInfo>
  updatedAt: number
  /** 按住确认中的工作区（stopping 灰化态），key=workspaceId，value=开始时间戳 */
  stoppingByWorkspace: Record<string, number>
  /** 已运行又长按时的确认脉冲计数，组件据此播 orb-nudge 动画 */
  pulseByWorkspace: Record<string, number>
  setFromGrouped: (next: Record<string, WorkspaceRunInfo>) => void
  markStopping: (workspaceId: string) => void
  clearStopping: (workspaceId: string) => void
  pulse: (workspaceId: string) => void
  removeWorkspace: (workspaceId: string) => void
  resetForTests: () => void
}

export const useRunningStore = create<RunningStore>((set) => ({
  runningByWorkspace: {},
  updatedAt: 0,
  stoppingByWorkspace: {},
  pulseByWorkspace: {},

  setFromGrouped: (next) => set((state) => {
    // stopping 超时回弹：对应工作区已从轮询消失则清掉 stopping（正常消失路径）
    const stoppingByWorkspace = { ...state.stoppingByWorkspace }
    for (const workspaceId of Object.keys(stoppingByWorkspace)) {
      if (!next[workspaceId]) delete stoppingByWorkspace[workspaceId]
    }
    return { runningByWorkspace: next, updatedAt: Date.now(), stoppingByWorkspace }
  }),

  markStopping: (workspaceId) => set((state) => ({
    stoppingByWorkspace: { ...state.stoppingByWorkspace, [workspaceId]: Date.now() },
  })),

  clearStopping: (workspaceId) => set((state) => {
    if (!(workspaceId in state.stoppingByWorkspace)) return {}
    const stoppingByWorkspace = { ...state.stoppingByWorkspace }
    delete stoppingByWorkspace[workspaceId]
    return { stoppingByWorkspace }
  }),

  pulse: (workspaceId) => set((state) => ({
    pulseByWorkspace: { ...state.pulseByWorkspace, [workspaceId]: (state.pulseByWorkspace[workspaceId] ?? 0) + 1 },
  })),

  removeWorkspace: (workspaceId) => set((state) => {
    if (!(workspaceId in state.runningByWorkspace) && !(workspaceId in state.stoppingByWorkspace)) return {}
    const runningByWorkspace = { ...state.runningByWorkspace }
    const stoppingByWorkspace = { ...state.stoppingByWorkspace }
    delete runningByWorkspace[workspaceId]
    delete stoppingByWorkspace[workspaceId]
    return { runningByWorkspace, stoppingByWorkspace, updatedAt: Date.now() }
  }),

  resetForTests: () => set({
    runningByWorkspace: {},
    updatedAt: 0,
    stoppingByWorkspace: {},
    pulseByWorkspace: {},
  }),
}))

export const selectIsWorkspaceRunning = (workspaceId: string | null | undefined) => (state: RunningStore): boolean =>
  !!workspaceId && !!state.runningByWorkspace[workspaceId]

/** 本体长按已运行时发出的确认脉冲（RunOrb 监听 pulse 播 orb-nudge 动画） */
export function nudgeRunOrb(workspaceId: string): void {
  useRunningStore.getState().pulse(workspaceId)
}
