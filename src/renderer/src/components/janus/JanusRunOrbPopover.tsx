import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { useWorkspaceStore } from '@/stores/workspace'
import { HoldToConfirm } from '@/components/ui/HoldToConfirm'
import { projectService } from '@/services/project'
import type { WorkspaceRunInfo } from '@/stores/running'
import { startWorkspacePath, stopWorkspaceProjects } from './useProjectRunning'
import { formatOrbUptime } from './JanusRunOrb'

const OUTPUT_PREVIEW_CHARS = 120
const ARM_TIMEOUT_MS = 3000

function truncateLine(line: string): string {
  const cleaned = line.replace(/\u001b\[[0-9;]*m/g, '').trim()
  return cleaned.length > OUTPUT_PREVIEW_CHARS ? `${cleaned.slice(0, OUTPUT_PREVIEW_CHARS)}…` : cleaned
}

export interface StoppedWorkspaceSnapshot {
  workspaceId: string
  workspaceName: string
  workspacePath: string
}

interface JanusRunOrbPopoverProps {
  /** null = 该工作区已无运行进程（停止成功后的空态，可一键重启） */
  info: WorkspaceRunInfo | null
  stopping: boolean
  stoppedSnapshot?: StoppedWorkspaceSnapshot | null
  onClose: () => void
}

/**
 * JanusRunOrbPopover — 运行球轻面板（不停靠展开态 auxiliary）
 *
 * 关闭面板（×/点外/Esc）只关视图；停止走分级摩擦：
 * 停止全部 = HoldToConfirm 按住 1s，单进程 = hover 出 ⊘ 两步 arm 确认。
 */
export function JanusRunOrbPopover({ info, stopping, stoppedSnapshot = null, onClose }: JanusRunOrbPopoverProps) {
  const { t } = useI18n('janus')
  const [outputByProject, setOutputByProject] = useState<Record<string, string>>({})
  const [armedProjectId, setArmedProjectId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [restarting, setRestarting] = useState(false)
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (armTimerRef.current) clearTimeout(armTimerRef.current)
  }, [])

  const workspaceId = info?.workspaceId ?? stoppedSnapshot?.workspaceId ?? ''
  const projectIds = info?.projects.map((p) => p.id).join(',') ?? ''

  // 懒查每进程最后一行输出（面板打开/进程集合变化时）
  useEffect(() => {
    if (!info) return
    let cancelled = false
    setActionError(null)
    void (async () => {
      const entries = await Promise.all(
        info.projects.map(async (project) => {
          try {
            const detail = await projectService.get(project.id)
            const lines = detail.output.map(truncateLine).filter(Boolean)
            return [project.id, lines[lines.length - 1] ?? ''] as const
          } catch {
            return [project.id, ''] as const
          }
        }),
      )
      if (!cancelled) {
        setOutputByProject(Object.fromEntries(entries))
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, projectIds])

  const armStopOne = (projectId: string) => {
    if (armTimerRef.current) clearTimeout(armTimerRef.current)
    setArmedProjectId(projectId)
    armTimerRef.current = setTimeout(() => setArmedProjectId(null), ARM_TIMEOUT_MS)
  }

  const confirmStopOne = async (projectId: string) => {
    if (armTimerRef.current) clearTimeout(armTimerRef.current)
    setArmedProjectId(null)
    try {
      await projectService.stop(projectId)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }

  const handleStopAll = () => {
    if (!info) return
    setActionError(null)
    void stopWorkspaceProjects(info.workspaceId, info.workspacePath).then((ok) => {
      if (!ok) setActionError(t('janus:island.runOrb.stopping'))
    })
  }

  const handleRestart = async () => {
    const path = info?.workspacePath ?? stoppedSnapshot?.workspacePath
    if (!path) return
    setRestarting(true)
    setActionError(null)
    try {
      const ok = await startWorkspacePath(path)
      if (!ok) setActionError(t('janus:island.runOrb.noConfig'))
    } finally {
      setRestarting(false)
    }
  }

  const handleSwitch = () => {
    if (!info) return
    useWorkspaceStore.getState().setActiveWorkspace(info.workspaceId)
    onClose()
  }

  // 已停止空态：球已随轮询消失，面板保留重启入口
  if (!info) {
    return (
      <div className="janus-run-orb-popover" role="dialog" aria-label={stoppedSnapshot?.workspaceName ?? ''}>
        <div className="janus-run-orb-popover-empty">
          <span>{t('janus:island.runOrb.stoppedEmpty')}</span>
          {stoppedSnapshot && <small>{stoppedSnapshot.workspaceName}</small>}
        </div>
        {actionError && <div className="janus-run-orb-popover-error" role="alert">{actionError}</div>}
        <div className="janus-run-orb-popover-footer">
          <button type="button" className="janus-run-orb-btn" disabled={restarting} onClick={() => void handleRestart()}>
            {t('janus:island.runOrb.restartDev')}
          </button>
          <button type="button" className="janus-run-orb-btn janus-run-orb-btn--ghost" onClick={onClose}>
            {t('janus:island.runOrb.panelClose')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="janus-run-orb-popover" role="dialog" aria-label={info.workspaceName}>
      <header className="janus-run-orb-popover-header">
        <strong>{info.workspaceName}</strong>
        <button
          type="button"
          className="janus-run-orb-popover-close"
          aria-label={t('janus:island.runOrb.panelClose')}
          title={t('janus:island.runOrb.panelClose')}
          onClick={onClose}
        >
          ×
        </button>
      </header>

      {actionError && <div className="janus-run-orb-popover-error" role="alert">{actionError}</div>}

      <ul className="janus-run-orb-process-list">
        {info.projects.map((project) => {
          const armed = armedProjectId === project.id
          return (
            <li key={project.id} className="janus-run-orb-process">
              <div className="janus-run-orb-process-main">
                <span className="janus-run-orb-process-name">{project.name}</span>
                <span className="janus-run-orb-process-meta">
                  PID {project.pid}
                  {typeof project.port === 'number' && project.port > 0 ? ` · :${project.port}` : ''}
                  {` · ${formatOrbUptime(project.uptime)}`}
                </span>
                <span className="janus-run-orb-process-output">
                  {outputByProject[project.id] || t('janus:island.runOrb.outputEmpty')}
                </span>
              </div>
              {armed ? (
                <span className="janus-run-orb-arm">
                  <small>{t('janus:island.runOrb.stopOneConfirm')}</small>
                  <button type="button" className="janus-run-orb-btn janus-run-orb-btn--danger" onClick={() => void confirmStopOne(project.id)}>
                    {t('janus:island.runOrb.stopOne')}
                  </button>
                  <button type="button" className="janus-run-orb-btn janus-run-orb-btn--ghost" onClick={() => setArmedProjectId(null)}>
                    {t('janus:island.runOrb.cancel')}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="janus-run-orb-stop-one"
                  title={t('janus:island.runOrb.stopOneConfirm')}
                  aria-label={t('janus:island.runOrb.stopOneConfirm')}
                  onClick={() => armStopOne(project.id)}
                >
                  ⊘
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <div className="janus-run-orb-popover-footer">
        <button type="button" className="janus-run-orb-btn" onClick={handleSwitch}>
          {t('janus:island.runOrb.switchTo')}
        </button>
        <HoldToConfirm
          label={t('janus:island.runOrb.stopAllHoldHint')}
          disabled={stopping}
          className="janus-run-orb-btn janus-run-orb-btn--danger"
          onConfirm={handleStopAll}
        >
          {stopping ? t('janus:island.runOrb.stopping') : t('janus:island.runOrb.stopAll')}
        </HoldToConfirm>
      </div>
    </div>
  )
}
