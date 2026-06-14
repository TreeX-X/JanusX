/**
 * src/renderer/src/components/ProjectRunningList.tsx
 *
 * 项目运行中列表
 * 显示所有运行中的项目，实时日志推送
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import type { LaunchConfig } from '@/types/project'
import styles from './ProjectRunningList.module.css'

interface ProjectRunningListProps {
  projectPath: string
  config: LaunchConfig | null
  onEditSettings: () => void
}

interface RunningProject {
  id: string
  name: string
  type: string
  port?: number
  pid: number
  uptime: number
  output: string[]
}

/**
 * 项目运行列表
 * 展示：项目信息 + 实时日志 + 操作按钮
 */
export function ProjectRunningList({
  projectPath,
  config,
  onEditSettings,
}: ProjectRunningListProps) {
  const [projects, setProjects] = useState<RunningProject[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  /*-- 用于追踪已选中项目的输出日志 --*/
  const [selectedOutput, setSelectedOutput] = useState<string[]>([])
  const selectedProjectIdRef = useRef<string | null>(null)

  /*-- 同步 ref --*/
  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId
  }, [selectedProjectId])

  // 加载运行中的项目列表（2s 轮询）
  useEffect(() => {
    loadProjects()
    const interval = setInterval(loadProjects, 2000)
    return () => clearInterval(interval)
  }, [projectPath])

  /*-- 对选中项目单独轮询 output（2s 间隔） --*/
  useEffect(() => {
    if (!selectedProjectId) return
    fetchSelectedOutput()
    const interval = setInterval(fetchSelectedOutput, 2000)
    return () => clearInterval(interval)
  }, [selectedProjectId])

  async function loadProjects() {
    try {
      const result = await window.electron.invoke('project:list') as any

      if (result.success) {
        const filtered = result.data.filter((p: any) =>
          p.id.startsWith(projectPath)
        )
        setProjects(filtered)

        if (filtered.length > 0 && !selectedProjectIdRef.current) {
          setSelectedProjectId(filtered[0].id)
        }
      }
    } catch (err) {
      console.error('Failed to load projects:', err)
    }
  }

  /*-- 获取选中项目的详细信息（包含 output） --*/
  async function fetchSelectedOutput() {
    const id = selectedProjectIdRef.current
    if (!id) return
    try {
      const result = await window.electron.invoke('project:get', id) as any
      if (result.success && result.data.output) {
        setSelectedOutput(result.data.output)
      }
    } catch {
      /*-- 静默失败，项目可能已退出 --*/
    }
  }

  // 启动项目
  const handleRun = useCallback(async (configName: string = 'dev') => {
    setLoading(true)
    setError(null)

    try {
      const result = await window.electron.invoke(
        'project:run',
        projectPath,
        configName
      ) as any

      if (result.success) {
        await loadProjects()
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run project')
    } finally {
      setLoading(false)
    }
  }, [projectPath])

  // 停止项目
  const handleStop = useCallback(async (projectId: string) => {
    try {
      const result = await window.electron.invoke('project:stop', projectId) as any

      if (result.success) {
        await loadProjects()
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop project')
    }
  }, [])

  const selectedProject = projects.find(p => p.id === selectedProjectId)

  return (
    <div className={styles.container}>
      {/* 头部：配置信息 + 启动按钮 */}
      <div className={styles.header}>
        <div className={styles.info}>
          <h2>{config?.projectName || '未命名项目'}</h2>
          <p className={styles.path}>{projectPath}</p>
          {config && (
            <div className={styles.configs}>
              {config.configurations.map(cfg => (
                <button
                  key={cfg.name}
                  onClick={() => handleRun(cfg.name)}
                  disabled={loading}
                  className={styles.runBtn}
                  title={`启动 ${cfg.name} 配置`}
                >
                  ▶ {cfg.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={onEditSettings} className={styles.editBtn}>
          ⚙️ 设置
        </button>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {/* 项目列表和日志展示 */}
      <div className={styles.content}>
        {/* 左侧：项目列表 */}
        <div className={styles.projectList}>
          <div className={styles.listHeader}>
            <span>运行中的项目 ({projects.length})</span>
          </div>

          {projects.length === 0 ? (
            <div className={styles.empty}>
              <p>暂无运行中的项目</p>
              {config && (
                <p>点击上方"启动"按钮开始运行</p>
              )}
            </div>
          ) : (
            projects.map(project => (
              <div
                key={project.id}
                className={`${styles.projectItem} ${
                  selectedProjectId === project.id ? styles.selected : ''
                }`}
                onClick={() => setSelectedProjectId(project.id)}
              >
                <div className={styles.projectItemMain}>
                  <div className={styles.projectItemTitle}>{project.name}</div>
                  <div className={styles.projectItemMeta}>
                    <span className={styles.type}>{project.type}</span>
                    {project.port && (
                      <span className={styles.port}>
                        <a
                          href={`http://localhost:${project.port}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                        >
                          :{project.port}
                        </a>
                      </span>
                    )}
                  </div>
                  <div className={styles.uptime}>
                    PID {project.pid} • {formatUptime(project.uptime)}
                  </div>
                </div>

                <button
                  onClick={e => {
                    e.stopPropagation()
                    handleStop(project.id)
                  }}
                  className={styles.stopBtn}
                  title="停止项目"
                >
                  ⊘
                </button>
              </div>
            ))
          )}
        </div>

        {/* 右侧：日志展示 */}
        {selectedProject && (
          <div className={styles.logPanel}>
            <div className={styles.logHeader}>
              <span>日志输出</span>
              <span className={styles.logTime}>
                {selectedProject.uptime > 0 && `运行 ${formatUptime(selectedProject.uptime)}`}
              </span>
            </div>

            <div className={styles.logContent}>
              {selectedOutput.length === 0 ? (
                <p className={styles.logEmpty}>等待输出...</p>
              ) : (
                selectedOutput.map((line, idx) => (
                  <div key={idx} className={styles.logLine}>
                    {line}
                  </div>
                ))
              )}
            </div>

            <div className={styles.logFooter}>
              <p>💡 点击项目列表中的端口链接直接打开浏览器</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 格式化运行时间
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

export default ProjectRunningList
