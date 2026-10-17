import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { useWorkspaceStore } from '@/stores/workspace'
import { createHoldToConfirmController, isHoldConfirmKey } from '@/lib/hold-to-confirm'
import { scopeKey, useRunningStore, type ScopeRunInfo, type WorkspaceRunInfo } from '@/stores/running'
import { stopScopeProjects, stopWorkspaceProjects } from './useProjectRunning'
import { JanusRunOrbPopover } from './JanusRunOrbPopover'

/** 球长按停止的按住时长：与 HoldToConfirm 默认 1000ms 对齐 */
const ORB_HOLD_MS = 1000
/** 每组直接可见的 worktree 子芽上限，超出收纳为 +N */
const MAX_VISIBLE_BUDS = 2

export function formatOrbUptime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

/** 优先读启动时盖章的配置名；旧数据从 runner id `${path}::${config}::${ts}` 还原 */
export function orbConfigLabel(info: WorkspaceRunInfo): string {
  const first = info.projects[0]
  if (first?.configName) return first.configName
  const prefix = info.workspacePath ? `${info.workspacePath}::` : ''
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
  focusScopePath?: string | null
  onOpenChange: (workspaceId: string | null, focusScope?: string | null) => void
}

/**
 * JanusRunOrb — 单个工作区的运行球组（主球 + worktree 子芽）
 *
 * 单击只导航/预览（异工作区切换，同工作区开面板），永不销毁；
 * 按住 1s（HoldToConfirm 同款控制器）才停止归属工作区全部进程，
 * 中途松开/滑离/失焦即取消并回退到打开面板。
 * 运行横跨多个 worktree 时主球右侧分蘖子芽：子芽单击开面板定位该
 * 作用域，按住 1s 只停该 worktree。单 worktree 形态与旧单球一致。
 */
export function JanusRunOrb({ info, open, leaving = false, focusScopePath = null, onOpenChange }: JanusRunOrbProps) {
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
  const multiScope = info.scopes.length > 1
  const visibleBuds = multiScope ? info.scopes.slice(0, MAX_VISIBLE_BUDS) : []
  const overflowBuds = multiScope ? info.scopes.slice(MAX_VISIBLE_BUDS) : []

  return (
    <div className="janus-run-orb-anchor">
      <button
        type="button"
        className={`janus-run-orb${holding ? ' is-holding' : ''}${open ? ' is-open' : ''}${isActive ? ' is-active' : ''}`}
        data-workspace-id={workspaceId}
        data-state={stopping ? 'stopping' : 'running'}
        data-scopes={multiScope ? info.scopes.length : undefined}
        style={multiScope ? { ['--orb-segments' as string]: String(info.scopes.length) } : undefined}
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
      {multiScope && (
        <span className="janus-run-orb-buds" aria-hidden="false">
          {visibleBuds.map((scope) => (
            <ScopeBud
              key={scopeKey(scope.scopePath)}
              scope={scope}
              active={focusScopePath != null && scopeKey(scope.scopePath) === scopeKey(focusScopePath)}
              disabled={leaving}
              onOpen={() => onOpenChange(workspaceId, scope.scopePath)}
            />
          ))}
          {overflowBuds.length > 0 && (
            <button
              type="button"
              className="janus-run-orb-bud janus-run-orb-bud--more"
              disabled={leaving}
              title={t('janus:island.runOrb.overflowBuds', { count: overflowBuds.length })}
              aria-label={t('janus:island.runOrb.overflowBuds', { count: overflowBuds.length })}
              onClick={() => onOpenChange(workspaceId)}
            >
              +{overflowBuds.length}
            </button>
          )}
        </span>
      )}
      {open && (
        <JanusRunOrbPopover
          info={info}
          stopping={stopping}
          focusScopePath={focusScopePath}
          onClose={() => onOpenChange(null)}
        />
      )}
    </div>
  )
}

/** worktree 子芽：单击开面板定位该作用域，按住 1s 停止该 worktree 全部进程 */
function ScopeBud({
  scope,
  active,
  disabled,
  onOpen,
}: {
  scope: ScopeRunInfo
  active: boolean
  disabled?: boolean
  onOpen: () => void
}) {
  const { t } = useI18n('janus')
  const stopping = useRunningStore((s) => scopeKey(scope.scopePath) in s.stoppingByScope)
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
    void stopScopeProjects(scope.scopePath)
  }

  const count = scope.projects.length
  const uptime = scope.projects.reduce((max, p) => Math.max(max, p.uptime), 0)
  const label = scope.branch || scope.scopePath.split(/[\\/]/).filter(Boolean).pop() || '?'
  const startHold = () => {
    if (stopping || disabled) return
    controllerRef.current?.start()
  }
  const cancelHold = () => controllerRef.current?.cancel()

  return (
    <button
      type="button"
      className={`janus-run-orb-bud${holding ? ' is-holding' : ''}${active ? ' is-active' : ''}`}
      data-state={stopping ? 'stopping' : 'running'}
      disabled={disabled}
      title={t('janus:island.runOrb.budTooltip', {
        name: label,
        path: scope.scopePath,
        count,
        uptime: formatOrbUptime(uptime),
      })}
      aria-label={t('janus:island.runOrb.budAria', { name: label, count })}
      onClick={() => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false
          return
        }
        if (stopping || disabled) return
        onOpen()
      }}
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
      {stopping ? '…' : (count > 1 ? count : '')}
    </button>
  )
}
