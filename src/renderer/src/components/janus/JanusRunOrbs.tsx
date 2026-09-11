import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { useWorkspaceStore } from '@/stores/workspace'
import { sortWorkspaceRunInfos, useRunningStore, type WorkspaceRunInfo } from '@/stores/running'
import { stopWorkspaceProjects } from './useProjectRunning'
import { JanusRunOrb } from './JanusRunOrb'
import { JanusRunOrbPopover, type StoppedWorkspaceSnapshot } from './JanusRunOrbPopover'

/** 直接可见球上限，超出收纳为 +N 聚合球 */
const MAX_VISIBLE_ORBS = 3
/** 球消散动画时长（与 orb-pop 200ms 对齐） */
const LEAVE_MS = 200

/**
 * JanusRunOrbs — 运行球簇（母体右侧卫星）
 *
 * 一工作区一球，按启动先后排序；`+N` 聚合收纳溢出；
 * 球消失走 200ms 收缩；点外/`Esc` 只关面板不碰进程。
 */
export function JanusRunOrbs() {
  const { t } = useI18n('janus')
  // selector 只取稳定引用，排序派生在渲染层 useMemo（禁止在 selector 内返回新数组，见 useProjectRunning 注释）
  const byId = useRunningStore((s) => s.runningByWorkspace)
  const ids = useMemo(
    () => sortWorkspaceRunInfos(Object.values(byId)).map((info) => info.workspaceId),
    [byId],
  )
  const [openFor, setOpenFor] = useState<string | null>(null)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [leavingIds, setLeavingIds] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const lastInfosRef = useRef<Record<string, WorkspaceRunInfo>>({})
  const leaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  useEffect(() => () => {
    for (const timer of Object.values(leaveTimersRef.current)) clearTimeout(timer)
  }, [])

  // 快照保留：消散动画与停止后空态需要最后一帧归属信息
  for (const [id, info] of Object.entries(byId)) {
    lastInfosRef.current[id] = info
  }

  // 消散：从轮询消失的球播 orb-pop 200ms 后再卸载（正开着面板的走幽灵锚点）
  const prevIdsRef = useRef<string[]>(ids)
  useEffect(() => {
    const prev = prevIdsRef.current
    prevIdsRef.current = ids
    const vanished = prev.filter((id) => !ids.includes(id) && id !== openFor && !leavingIds.includes(id))
    if (vanished.length === 0) return
    setLeavingIds((current) => [...current, ...vanished])
    for (const id of vanished) {
      leaveTimersRef.current[id] = setTimeout(() => {
        setLeavingIds((current) => current.filter((item) => item !== id))
        delete leaveTimersRef.current[id]
      }, LEAVE_MS)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, openFor])

  // 点外 / Esc 只关面板
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && !containerRef.current?.contains(target)) {
        setOpenFor(null)
        setOverflowOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpenFor(null)
      setOverflowOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const visibleIds = ids.slice(0, MAX_VISIBLE_ORBS)
  const overflowIds = ids.slice(MAX_VISIBLE_ORBS)
  const ghostSnapshot: StoppedWorkspaceSnapshot | null = useMemo(() => {
    if (!openFor || byId[openFor]) return null
    const last = lastInfosRef.current[openFor]
    if (!last) return null
    return { workspaceId: last.workspaceId, workspaceName: last.workspaceName, workspacePath: last.workspacePath }
  }, [openFor, byId])

  if (ids.length === 0 && leavingIds.length === 0 && !ghostSnapshot) return null

  return (
    <div
      ref={containerRef}
      className="janus-run-orbs"
      role="status"
      aria-label={t('janus:island.runOrb.clusterAria', { count: ids.length })}
    >
      {visibleIds.map((id) => {
        const info = byId[id]
        if (!info) return null
        return (
          <JanusRunOrb
            key={id}
            info={info}
            open={openFor === id}
            onOpenChange={(next) => {
              setOpenFor(next)
              if (next) setOverflowOpen(false)
            }}
          />
        )
      })}
      {overflowIds.length > 0 && (
        <div className="janus-run-orb-anchor">
          <button
            type="button"
            className={`janus-run-orb janus-run-orb--overflow${overflowOpen ? ' is-open' : ''}`}
            aria-label={t('janus:island.runOrb.overflowAria', { count: overflowIds.length })}
            title={t('janus:island.runOrb.overflowAria', { count: overflowIds.length })}
            onClick={() => {
              setOverflowOpen((open) => !open)
              setOpenFor(null)
            }}
          >
            <span className="janus-run-orb-core" aria-hidden="true">+{overflowIds.length}</span>
          </button>
          {overflowOpen && (
            <div className="janus-run-orb-popover" role="dialog" aria-label={t('janus:island.runOrb.overflowAria', { count: overflowIds.length })}>
              <ul className="janus-run-orb-overflow-list">
                {overflowIds.map((id) => {
                  const info = byId[id]
                  if (!info) return null
                  return (
                    <OverflowRow key={id} info={info} onSwitch={() => {
                      useWorkspaceStore.getState().setActiveWorkspace(id)
                      setOverflowOpen(false)
                    }} />
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}
      {leavingIds.map((id) => {
        const info = lastInfosRef.current[id]
        if (!info || byId[id]) return null
        return <JanusRunOrb key={id} info={info} leaving open={false} onOpenChange={() => undefined} />
      })}
      {ghostSnapshot && (
        <div className="janus-run-orb-anchor">
          <span className="janus-run-orb janus-run-orb--ghost" aria-hidden="true">
            <span className="janus-run-orb-core">○</span>
          </span>
          <JanusRunOrbPopover
            info={null}
            stopping={false}
            stoppedSnapshot={ghostSnapshot}
            onClose={() => setOpenFor(null)}
          />
        </div>
      )}
    </div>
  )
}

function OverflowRow({ info, onSwitch }: { info: WorkspaceRunInfo; onSwitch: () => void }) {
  const { t } = useI18n('janus')
  const [armed, setArmed] = useState(false)
  const [failed, setFailed] = useState(false)

  const handleStop = async () => {
    if (!armed) {
      setArmed(true)
      return
    }
    const ok = await stopWorkspaceProjects(info.workspaceId, info.workspacePath)
    setFailed(!ok)
    setArmed(false)
  }

  return (
    <li className="janus-run-orb-overflow-row">
      <button type="button" className="janus-run-orb-overflow-main" onClick={onSwitch} title={t('janus:island.runOrb.switchTo')}>
        <strong>{info.workspaceName}</strong>
        <small>{t('janus:island.runOrb.overflowRowMeta', { count: info.projects.length })}</small>
      </button>
      <button
        type="button"
        className={`janus-run-orb-btn janus-run-orb-btn--danger${armed ? ' is-armed' : ''}`}
        title={armed ? t('janus:island.runOrb.stopOneConfirm') : t('janus:island.runOrb.stopAllHoldHint')}
        onClick={() => void handleStop()}
        onBlur={() => setArmed(false)}
      >
        {armed ? t('janus:island.runOrb.stopOne') : '⊘'}
      </button>
      {failed && <small className="janus-run-orb-overflow-error" role="alert">{t('janus:island.runOrb.stopping')}</small>}
    </li>
  )
}
