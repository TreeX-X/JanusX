import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/stores/app'
import { selectIsWorkspaceRunning, useRunningStore } from '@/stores/running'
import { projectService, type ProjectConfig } from '@/services/project'
import type { Workspace } from '@/types'

export type StartActiveOutcome = 'started' | 'already-running' | 'no-config' | 'no-workspace'

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

/** 按路径启动工作区默认配置（dev 优先），供停止后的重新启动使用 */
export async function startWorkspacePath(workspacePath: string): Promise<boolean> {
  try {
    const config = await projectService.readConfig(workspacePath)
    const defaultConfig = config?.configurations.find((item) => item.name === 'dev')
      ?? config?.configurations[0]
    if (!defaultConfig) return false
    return await projectService.start(workspacePath, defaultConfig.name)
  } catch (error) {
    console.error('Failed to start workspace project:', error)
    return false
  }
}

/**
 * useProjectRunning — 当前工作区的运行派生 + 启停 API
 *
 * P0 后不再自己轮询：运行真相来自 useGlobalRunning 写入的 useRunningStore，
 * 此处只做 activeWorkspace 派生（兼容 app.janusRunning/runningProjects 旧读者）
 * 与启动/停止动作。长按语义为仅启动（幂等），停止一律走球上的显式操作。
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

  // 启动需要配置：只读配置，不轮询运行态
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

  /** 幂等启动：已运行则不调 start，由调用方决定脉冲提示 */
  const startActiveOnce = useCallback(async (): Promise<StartActiveOutcome> => {
    if (!activeWorkspace) return 'no-workspace'
    if (useRunningStore.getState().runningByWorkspace[activeWorkspace.id]) return 'already-running'
    try {
      const config = await projectService.readConfig(activeWorkspace.path)
      setWorkspaceConfig(config)
      const defaultConfig = config?.configurations.find((item) => item.name === 'dev')
        ?? config?.configurations[0]
      if (!defaultConfig) return 'no-config'
      const success = await projectService.start(activeWorkspace.path, defaultConfig.name)
      if (!success) return 'no-config'
      return 'started'
    } catch (error) {
      console.error('Failed to start project:', error)
      return 'no-config'
    }
  }, [activeWorkspace])

  /** 停止整个工作区的全部进程（球上的显式操作调用） */
  const stopWorkspace = useCallback(async (workspaceId: string, workspacePath: string): Promise<boolean> => {
    return stopWorkspaceProjects(workspaceId, workspacePath)
  }, [])

  return { janusRunning, workspaceConfig, startActiveOnce, stopWorkspace }
}
