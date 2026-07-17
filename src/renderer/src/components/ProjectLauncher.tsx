/**
 * src/renderer/src/components/ProjectLauncher.tsx
 *
 * 项目启动主界面组件
 * 集成项目检测、配置管理、启动运行的完整流程
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import type { LaunchConfig } from '@/types/project'
import {
  createLatestRequestGuard,
  executeCurrentTask,
  getProjectLauncherMode,
  projectService,
} from '@/services/project'
import ProjectSettings from './ProjectSettings'
import ProjectRunningList from './ProjectRunningList'
import styles from './ProjectLauncher.module.css'

interface ProjectLauncherProps {
  projectPath: string
}

/**
 * 项目启动器主容器
 * 管理两个主要模式：
 * 1. 设置模式 - 配置项目启动参数
 * 2. 运行模式 - 显示运行中的项目
 */
export function ProjectLauncher({ projectPath }: ProjectLauncherProps) {
  const [mode, setMode] = useState<'settings' | 'running'>('settings')
  const [config, setConfig] = useState<LaunchConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadGuardRef = useRef(createLatestRequestGuard())

  // 加载现有配置
  useEffect(() => {
    const isCurrent = loadGuardRef.current.begin()
    void loadConfig(isCurrent)
    return loadGuardRef.current.cancel
  }, [projectPath])

  async function loadConfig(isCurrent = loadGuardRef.current.begin()) {
    setLoading(true)
    setError(null)
    await executeCurrentTask(isCurrent, () => projectService.readConfig(projectPath), {
      onSuccess: (loadedConfig) => {
        setConfig(loadedConfig)
        setMode(getProjectLauncherMode(loadedConfig))
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : 'Failed to load config')
      },
      onFinally: () => setLoading(false),
    })
  }

  const handleConfigSaved = useCallback((newConfig: LaunchConfig) => {
    setConfig(newConfig)
    setMode('running')
  }, [])

  const handleBackToSettings = useCallback(() => {
    setMode('settings')
  }, [])

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <p>检测项目...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>
          <p className={styles.errorText}>{error}</p>
          <button onClick={() => loadConfig()} className={styles.retryBtn}>
            重试
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {mode === 'settings' ? (
        <ProjectSettings projectPath={projectPath} onSave={handleConfigSaved} />
      ) : (
        <ProjectRunningList
          projectPath={projectPath}
          config={config}
          onEditSettings={handleBackToSettings}
        />
      )}
    </div>
  )
}

export default ProjectLauncher
