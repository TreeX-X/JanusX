import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/stores/app'
import { isScopeRunning, selectIsWorkspaceRunning, useRunningStore } from '@/stores/running'
import { sameScopePath, useWorktreeStore } from '@/stores/worktree'
import { projectService, type ProjectConfig } from '@/services/project'
import type { Workspace } from '@/types'

export type StartActiveOutcome = 'started' | 'already-running' | 'no-config' | 'no-workspace'

export interface ScopeRunTarget {
  workspaceId: string
  /** 工作区根：配置继承来源与停止归属。 */
  workspacePath: string
  /** 启动目标（worktree 路径；主盘即 workspacePath）。 */
  scopePath: string
  branch?: string | null
  configName?: string
}

/** 从 worktree 列表解析目标分支（启动时快照，供运行球子芽展示）。 */
export function resolveScopeBranch(workspaceId: string, scopePath: string): string | undefined {
  const worktrees = useWorktreeStore.getState().worktreesByWorkspace[workspaceId] ?? []
  return worktrees.find((entry) => sameScopePath(entry.path, scopePath))?.branch ?? undefined
}

/**
 * 按 worktree 作用域启动：配置读目标目录，缺失时继承工作区根模板
 * （命令仍在目标目录执行，继承配置的 cwd 越界由 runner 拒绝）。
 */
export async function startScope(target: ScopeRunTarget): Promise<boolean> {
  try {
    const config =
      (await projectService.readConfig(target.scopePath)) ??
      (target.scopePath === target.workspacePath ? null : await projectService.readConfig(target.workspacePath))
    const defaultConfig = config?.configurations.find((item) => item.name === 'dev')
      ?? config?.configurations[0]
    if (!defaultConfig) return false
    return await projectService.start(target.scopePath, target.configName ?? defaultConfig.name, {
      identity: {
        workspaceId: target.workspaceId,
        scopePath: target.scopePath,
        ...(target.branch ? { branch: target.branch } : {}),
      },
      inheritFrom: target.workspacePath,
    })
  } catch (error) {
    console.error('Failed to start scope project:', error)
    return false
  }
}

/** 停止整个工作区的全部进程（运行球上的显式操作调用，乐观进入 stopping） */
export async function stopWorkspaceProjects(workspaceId: string, workspacePath: string): Promise<boolean> {
  useRunningStore.getState().markStopping(workspaceId)
  try {
    const running = await projectService.listByWorkspace(workspacePath)
    await Promise.all(running.map((project) => projectService.stop(project.id)))
    return true
  } catch (error) {
    console.error('Failed to stop workspace projects:', error)
    useRunningStore.getState().clearStopping(workspaceId)
    return false
  }
}

/** 停止单个 worktree 作用域的全部进程（子芽长按 / 面板 scope 头）。 */
export async function stopScopeProjects(scopePath: string): Promise<boolean> {
  useRunningStore.getState().markStoppingScope(scopePath)
  try {
    const all = await projectService.list()
    const inScope = all.filter(
      (project) => project.scopePath
        ? sameScopePath(project.scopePath, scopePath)
        : project.id.startsWith(`${scopePath}::`),
    )
    await Promise.all(inScope.map((project) => projectService.stop(project.id)))
    return true
  } catch (error) {
    console.error('Failed to stop scope projects:', error)
    useRunningStore.getState().clearStoppingScope(scopePath)
    return false
  }
}

/**
 * useProjectRunning — 当前工作区的运行派生 + 启停 API
 *
 * P0 后不再自己轮询：运行真相来自 useGlobalRunning 写入的 useRunningStore，
 * 此处只做 activeWorkspace 派生（兼容 app.janusRunning/runningProjects 旧读者）
 * 与启动/停止动作。长按语义为仅启动（幂等），停止一律走球上的显式操作。
 * 启动目标为触发时的当前 worktree（activePaths 快照），不是工作区根。
 */
export function useProjectRunning(activeWorkspace: Workspace | undefined) {
  // 注意：selector 必须返回 store 内的稳定引用（禁止内联 ?? [] 等新建引用，
  // 否则 getSnapshot 每次返回新引用导致无限重渲染）。派生数组用 useMemo。
  const activeWorkspaceId = activeWorkspace?.id
  const janusRunning = useRunningStore(selectIsWorkspaceRunning(activeWorkspaceId))
  const activeInfo = useRunningStore((state) =>
    activeWorkspaceId ? state.runningByWorkspace[activeWorkspaceId] : undefined,
  )
  const activeProjects = useMemo(() => activeInfo?.projects ?? [], [activeInfo])
  const setJanusRunning = useAppStore((state) => state.setJanusRunning)
  const setRunningProjects = useAppStore((state) => state.setRunningProjects)
  const [workspaceConfig, setWorkspaceConfig] = useState<ProjectConfig | null>(null)

  // 兼容旧读者：把派生结果镜像到 app store（ProjectSettings 自查，不依赖此处）
  useEffect(() => {
    setJanusRunning(janusRunning)
  }, [janusRunning, setJanusRunning])
  useEffect(() => {
    setRunningProjects(activeProjects)
  }, [activeProjects, setRunningProjects])

  // 启动需要配置：只读配置，不轮询运行态（展示用，启动时仍按目标目录重新解析）
  useEffect(() => {
    if (!activeWorkspace) {
      setWorkspaceConfig(null)
      return
    }
    let alive = true
    void projectService.readConfig(activeWorkspace.path)
      .then((config) => {
        if (alive) setWorkspaceConfig(config)
      })
      .catch((error) => {
        if (alive) console.error('Failed to load workspace config:', error)
      })
    return () => {
      alive = false
    }
  }, [activeWorkspace])

  /** 幂等启动当前 worktree：该作用域已运行则不调 start，由调用方决定脉冲提示 */
  const startActiveOnce = useCallback(async (): Promise<StartActiveOutcome> => {
    if (!activeWorkspace) return 'no-workspace'
    // 触发时快照目标：异步期间切换 worktree 不会把启动送到另一目录
    const worktreeState = useWorktreeStore.getState()
    const scopePath = worktreeState.activePaths[activeWorkspace.id] ?? activeWorkspace.path
    if (isScopeRunning(activeWorkspace.id, scopePath)) return 'already-running'
    const ok = await startScope({
      workspaceId: activeWorkspace.id,
      workspacePath: activeWorkspace.path,
      scopePath,
      branch: resolveScopeBranch(activeWorkspace.id, scopePath),
    })
    if (!ok) return 'no-config'
    return 'started'
  }, [activeWorkspace])

  /** 停止整个工作区的全部进程（球上的显式操作调用） */
  const stopWorkspace = useCallback(async (workspaceId: string, workspacePath: string): Promise<boolean> => {
    return stopWorkspaceProjects(workspaceId, workspacePath)
  }, [])

  return { janusRunning, workspaceConfig, startActiveOnce, stopWorkspace }
}
