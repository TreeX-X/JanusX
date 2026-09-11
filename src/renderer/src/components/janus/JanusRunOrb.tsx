import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { useWorkspaceStore } from '@/stores/workspace'
import { createHoldToConfirmController, isHoldConfirmKey } from '@/lib/hold-to-confirm'
import { useRunningStore, type WorkspaceRunInfo } from '@/stores/running'
import { stopWorkspaceProjects } from './useProjectRunning'
import { JanusRunOrbPopover } from './JanusRunOrbPopover'

/** 球长按停止的按住时长：与 HoldToConfirm 默认 1000ms 对齐 */
const ORB_HOLD_MS = 1000

export function formatOrbUptime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

/** 从 runner id `${path}::${config}::${ts}` 还原配置名 */
export function orbConfigLabel(info: WorkspaceRunInfo): string {
  const prefix = info.workspacePath ? `${info.workspacePath}::` : ''
  const first = info.projects[0]
  if (first && prefix && first.id.startsWith(prefix)) {
    const config = first.id.slice(prefix.length).split('::')[0]
    if (config) return config
  }
  return first?.name ?? ''
}

interface JanusRunOrbProps {
  info: WorkspaceRunInfo
  open: boolean
  leaving?: boolean
  onOpenChange: (workspaceId: string | null) => void
}

/**
 * JanusRunOrb — 单个工作区的运行卫星球
 *
 * 单击只导航/预览（异工作区切换，同工作区开面板），永不销毁；
 * 按住 1s（HoldToConfirm 同款控制器）才停止归属工作区全部进程，
 * 中途松开/滑离/失焦即取消并回退到打开面板。
 */
export function JanusRunOrb({ info, open, leaving = false, onOpenChange }: JanusRunOrbProps) {
  const { t } = useI18n('janus')
  const { workspaceId } = info
  const stopping = useRunningStore((s) => workspaceId in s.stoppingByWorkspace)
  const pulse = useRunningStore((s) => s.pulseByWorkspace[workspaceId] ?? 0)
  const isActive = useWorkspaceStore((s) => s.activeWorkspaceId === workspaceId)
  const [holding, setHolding] = useState(false)
  const suppressClickRef = useRef(false)
  const confirmRef = useRef<() => void>(() => {})
  const controllerRef = useRef<ReturnType<typeof createHoldToConfirmController> | null>(null)
  if (controllerRef.current === null) {
    controllerRef.current = createHoldToConfirmController({
      durationMs: ORB_HOLD_MS,
      onStart: () => setHolding(true),
      onCancel: () => setHolding(false),
      onConfirm: () => {
        setHolding(false)
        confirmRef.current()
      },
    })
  }
  useEffect(() => () => controllerRef.current?.dispose(), [])

  confirmRef.current = () => {
    suppressClickRef.current = true
    onOpenChange(workspaceId)
    void stopWorkspaceProjects(workspaceId, info.workspacePath)
  }

  const startHold = () => {
    if (stopping || leaving) return
    controllerRef.current?.start()
  }
  const cancelHold = () => controllerRef.current?.cancel()

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    if (stopping || leaving) return
    if (open) {
      onOpenChange(null)
      return
    }
    if (!isActive) {
      useWorkspaceStore.getState().setActiveWorkspace(workspaceId)
    }
    onOpenChange(workspaceId)
  }

  const count = info.projects.length
  const uptime = info.projects.reduce((max, p) => Math.max(max, p.uptime), 0)
  const config = orbConfigLabel(info)
  const initial = (info.workspaceName || '?').trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="janus-run-orb-anchor">
      <button
        type="button"
        className={`janus-run-orb${holding ? ' is-holding' : ''}${open ? ' is-open' : ''}${isActive ? ' is-active' : ''}`}
        data-workspace-id={workspaceId}
        data-state={stopping ? 'stopping' : 'running'}
        data-leaving={leaving ? 'true' : undefined}
        disabled={leaving}
        aria-label={t('janus:island.runOrb.orbAria', { name: info.workspaceName, count })}
        title={t('janus:island.runOrb.tooltip', { name: info.workspaceName, config, count, uptime: formatOrbUptime(uptime) })}
        onClick={handleClick}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          e.stopPropagation()
          startHold()
        }}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onBlur={cancelHold}
        onKeyDown={(e) => {
          if (!isHoldConfirmKey(e.key)) return
          e.preventDefault()
          e.stopPropagation()
          if (!e.repeat) startHold()
        }}
        onKeyUp={(e) => {
          if (!isHoldConfirmKey(e.key)) return
          e.preventDefault()
          e.stopPropagation()
          cancelHold()
        }}
      >
        <span className="janus-run-orb-orbit" aria-hidden="true" />
        {/* key 随 pulse 递增而重挂，使 orb-nudge 动画每次都重播 */}
        <span key={pulse} className={pulse > 0 ? 'janus-run-orb-core janus-run-orb-nudge' : 'janus-run-orb-core'} aria-hidden="true">
          {stopping ? '…' : initial}
        </span>
        {count > 1 && !stopping && (
          <span className="janus-run-orb-badge" aria-hidden="true">{count}</span>
        )}
      </button>
      {open && (
        <JanusRunOrbPopover info={info} stopping={stopping} onClose={() => onOpenChange(null)} />
      )}
    </div>
  )
}
