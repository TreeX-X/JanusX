import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Crosshair, Eye, Layers3 } from 'lucide-react'
import { JanusIdentityCore } from './JanusIdentityCore'
import type { JanusAgentIdentityId } from './janusIdentity'

export type RoundtableRole = 'user' | 'host' | 'agent-1' | 'agent-2'

export interface RoundtableStageParticipant {
  id: RoundtableRole
  name: string
  label: string
  identity: JanusAgentIdentityId
  color: string
}

interface RoundtableStageProps {
  participants: RoundtableStageParticipant[]
  workingRole: RoundtableRole | null
  ended: boolean
  onSelectParticipant?: (role: RoundtableRole) => void
  parchmentOpen?: boolean
  onToggleParchment?: () => void
}

type CameraMode = 'orbit' | 'top' | 'iso' | 'low'

const CAMERA_LABELS: Partial<Record<CameraMode, string>> = {
  orbit: '动态',
  top: '俯视',
  iso: '等距',
}

export function RoundtableStage({
  participants,
  workingRole,
  ended,
  onSelectParticipant,
  parchmentOpen = false,
  onToggleParchment,
}: RoundtableStageProps) {
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit')
  const [cameraTransitioning, setCameraTransitioning] = useState(false)
  const [selectedRole, setSelectedRole] = useState<RoundtableRole | null>(null)
  const [hoveredRole, setHoveredRole] = useState<RoundtableRole | null>(null)
  const stageRef = useRef<HTMLElement>(null)
  const cameraTransitionTimerRef = useRef<number | null>(null)
  const selectedParticipant = useMemo(
    () => participants.find((participant) => participant.id === (hoveredRole ?? selectedRole)) ?? null,
    [hoveredRole, participants, selectedRole],
  )
  const visibleParticipants = participants.length >= 4 ? participants : participants.slice(0, 4)

  useEffect(() => {
    let frame = 0

    const syncLabels = () => {
      const stage = stageRef.current
      if (stage) {
        const stageRect = stage.getBoundingClientRect()
        const pods = stage.querySelectorAll<HTMLElement>('.janus-roundtable-seat-pod')
        const labels = stage.querySelectorAll<HTMLElement>('.janus-roundtable-seat-label')
        pods.forEach((pod, index) => {
          const label = labels[index]
          if (!label) return
          const podRect = pod.getBoundingClientRect()
          label.style.left = `${podRect.left - stageRect.left + podRect.width / 2}px`
          label.style.top = `${podRect.top - stageRect.top - 40}px`
        })
      }
      frame = requestAnimationFrame(syncLabels)
    }

    frame = requestAnimationFrame(syncLabels)
    return () => cancelAnimationFrame(frame)
  }, [cameraMode, visibleParticipants.length])

  useEffect(() => () => {
    if (cameraTransitionTimerRef.current !== null) window.clearTimeout(cameraTransitionTimerRef.current)
  }, [])

  const selectParticipant = (role: RoundtableRole) => {
    setSelectedRole(role)
    onSelectParticipant?.(role)
  }

  const changeCameraMode = (mode: CameraMode) => {
    if (mode === cameraMode) return
    if (cameraTransitionTimerRef.current !== null) window.clearTimeout(cameraTransitionTimerRef.current)
    setCameraTransitioning(true)
    setCameraMode(mode)
    cameraTransitionTimerRef.current = window.setTimeout(() => {
      cameraTransitionTimerRef.current = null
      setCameraTransitioning(false)
    }, 900)
  }

  return (
    <section ref={stageRef} className="janus-roundtable-stage" aria-label="圆桌参会者">
      <div className={`janus-roundtable-scene janus-roundtable-scene--${cameraMode}${cameraTransitioning ? ' janus-roundtable-scene--camera-transitioning' : ''}`}>
        <div className="janus-roundtable-floor" aria-hidden="true" />
        <div className="janus-roundtable-orbit-anchor">
        <div className="janus-roundtable-table" aria-hidden="true">
          <div className="janus-roundtable-table-slab janus-roundtable-table-slab--bottom" />
          <div className="janus-roundtable-table-slab janus-roundtable-table-slab--rim" />
          <div className="janus-roundtable-table-slab janus-roundtable-table-slab--top">
            <div className="janus-roundtable-table-rim" />
            <div className="janus-roundtable-table-hud" />
          </div>
        </div>
        <button
          type="button"
          className="janus-roundtable-scroll"
          data-open={parchmentOpen}
          aria-label={parchmentOpen ? '关闭共享羊皮卷' : '打开共享羊皮卷'}
          aria-pressed={parchmentOpen}
          onClick={onToggleParchment}
        >
          <span className="janus-roundtable-scroll-core" aria-hidden="true">
            <span className="janus-roundtable-scroll-sheet" />
            <span className="janus-roundtable-scroll-roll janus-roundtable-scroll-roll--left" />
            <span className="janus-roundtable-scroll-roll janus-roundtable-scroll-roll--right" />
            <span className="janus-roundtable-scroll-ribbon" />
          </span>
        </button>
        <div className="janus-roundtable-seats">
          {visibleParticipants.map((participant, index) => {
            const angle = (360 / visibleParticipants.length) * index
            const isWorking = workingRole === participant.id
            const isSelected = selectedRole === participant.id
            return (
              <div
                key={participant.id}
                className="janus-roundtable-seat-slot"
                data-hovered={hoveredRole === participant.id}
                style={{
                  '--seat-angle': `${angle}deg`,
                  '--seat-color': participant.color,
                } as CSSProperties}
              >
                <button
                  type="button"
                  className="janus-roundtable-seat"
                  data-selected={isSelected}
                  data-working={isWorking}
                  data-ended={ended}
                  aria-pressed={isSelected}
                  aria-label={`${participant.name}，${participant.label}`}
                  onMouseEnter={() => setHoveredRole(participant.id)}
                  onMouseLeave={() => setHoveredRole(null)}
                  onFocus={() => setHoveredRole(participant.id)}
                  onBlur={() => setHoveredRole(null)}
                  onClick={() => selectParticipant(participant.id)}
                >
                  <span className="janus-roundtable-seat-pod">
                    <span className="janus-roundtable-seat-pod-face janus-roundtable-seat-pod-face--front">
                      <JanusIdentityCore
                        identity={participant.identity}
                        size="pod"
                        state={isWorking ? 'running' : ended ? 'done' : 'default'}
                        showHalo={false}
                        showScanline={false}
                        aria-label={participant.name}
                      />
                    </span>
                    <span className="janus-roundtable-seat-pod-face janus-roundtable-seat-pod-face--back" aria-hidden="true">
                      <JanusIdentityCore
                        identity={participant.identity}
                        size="pod"
                        state={isWorking ? 'running' : ended ? 'done' : 'default'}
                        showHalo={false}
                        showScanline={false}
                      />
                    </span>
                  </span>
                  <span className="janus-roundtable-seat-link" aria-hidden="true" />
                </button>
              </div>
            )
          })}
        </div>
        </div>
      </div>

      <div className={`janus-roundtable-seat-labels janus-roundtable-seat-labels--${cameraMode}`} aria-hidden="true">
        {visibleParticipants.map((participant, index) => (
          <span
            key={participant.id}
            className="janus-roundtable-seat-label"
            data-seat-index={index}
            style={{ '--seat-color': participant.color } as CSSProperties}
          >
            <strong>{participant.name}</strong>
            <small>{participant.label}</small>
          </span>
        ))}
      </div>

      <div className="janus-roundtable-focus-readout" aria-live="polite">
        {selectedParticipant?.name ?? (workingRole ? '正在发言' : ended ? '会议已结束' : '四席会议单元')}
      </div>
      <div
        className="janus-roundtable-camera-controls"
        role="toolbar"
        aria-label="圆桌视角"
        data-camera={cameraMode}
        data-transitioning={cameraTransitioning}
      >
        {(['orbit', 'top', 'iso', 'low'] as CameraMode[]).map((mode) => (
          <button key={mode} type="button" data-active={cameraMode === mode} onClick={() => changeCameraMode(mode)}>
            {mode === 'orbit' ? <Eye size={12} /> : mode === 'top' ? <Layers3 size={12} /> : <Crosshair size={12} />}
            {CAMERA_LABELS[mode] ?? mode.toUpperCase()}
          </button>
        ))}
      </div>
    </section>
  )
}
