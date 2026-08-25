import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/stores/app'
import { projectService, type ProjectConfig } from '@/services/project'
import type { Workspace } from '@/types'

export function useProjectRunning(activeWorkspace: Workspace | undefined) {
  const janusRunning = useAppStore((state) => state.janusRunning)
  const setJanusRunning = useAppStore((state) => state.setJanusRunning)
  const setRunningProjects = useAppStore((state) => state.setRunningProjects)
  const [workspaceConfig, setWorkspaceConfig] = useState<ProjectConfig | null>(null)
  const configRef = useRef<ProjectConfig | null>(null)
  const configKeyRef = useRef('')
  const runningKeyRef = useRef('')

  useEffect(() => {
    if (!activeWorkspace) {
      setWorkspaceConfig(null)
      setRunningProjects([])
      setJanusRunning(false)
      configRef.current = null
      configKeyRef.current = ''
      runningKeyRef.current = ''
      return
    }

    const loadData = async () => {
      try {
        const config = await projectService.readConfig(activeWorkspace.path)
        configRef.current = config
        const configKey = JSON.stringify(config)
        if (configKeyRef.current !== configKey) {
          configKeyRef.current = configKey
          setWorkspaceConfig(config)
        }

        const running = await projectService.listByWorkspace(activeWorkspace.path)
        const runningKey = JSON.stringify(running)
        if (runningKeyRef.current !== runningKey) {
          runningKeyRef.current = runningKey
          setRunningProjects(running)
          setJanusRunning(running.length > 0)
        }
      } catch (error) {
        console.error('Failed to load workspace data:', error)
      }
    }

    void loadData()
    const interval = window.setInterval(loadData, 3000)
    return () => window.clearInterval(interval)
  }, [activeWorkspace, setJanusRunning, setRunningProjects])

  useEffect(() => { configRef.current = workspaceConfig }, [workspaceConfig])

  const toggleRunning = useCallback(async () => {
    if (!activeWorkspace || !configRef.current) return
    try {
      if (janusRunning) {
        const running = await projectService.listByWorkspace(activeWorkspace.path)
        await Promise.all(running.map((project) => projectService.stop(project.id)))
        setJanusRunning(false)
        setRunningProjects([])
        return
      }

      const defaultConfig = configRef.current.configurations.find((config) => config.name === 'dev')
        ?? configRef.current.configurations[0]
      if (!defaultConfig) return
      const success = await projectService.start(activeWorkspace.path, defaultConfig.name)
      if (!success) return
      const running = await projectService.listByWorkspace(activeWorkspace.path)
      setJanusRunning(running.length > 0)
      setRunningProjects(running)
    } catch (error) {
      console.error('Failed to toggle project:', error)
    }
  }, [activeWorkspace, janusRunning, setJanusRunning, setRunningProjects])

  return { janusRunning, toggleRunning }
}
