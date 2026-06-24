import { useState, useCallback, useEffect, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useAppStore } from '@/stores/app'
import { JanusEye } from './JanusEye'
import { useIslandGesture } from './useIslandGesture'
import { useJanusState } from './useJanusState'
import { projectService, type ProjectConfig } from '@/services/project'
import type { Workspace } from '@/types'
import { JanusChat } from './JanusChat'
import type { Message } from './useJanusChat'

/* ════════════════════════════════════════════════════════════
   JanusIsland — 52×26px 折叠态胶囊
   状态由 useJanusState 统一管理，视觉由 data-mode 属性驱动
   ════════════════════════════════════════════════════════════ */

/** useProjectRunning — 管理项目运行状态 */
function useProjectRunning(activeWorkspace: Workspace | undefined) {
  const { janusRunning, setJanusRunning, setRunningProjects } = useAppStore()
  const [workspaceConfig, setWorkspaceConfig] = useState<ProjectConfig | null>(null)
  const configRef = useRef<ProjectConfig | null>(null)

  useEffect(() => {
    if (!activeWorkspace) {
      setWorkspaceConfig(null)
      setRunningProjects([])
      setJanusRunning(false)
      configRef.current = null
      return
    }

    const loadData = async () => {
      try {
        const config = await projectService.readConfig(activeWorkspace.path)
        setWorkspaceConfig(config)
        configRef.current = config
        const running = await projectService.listByWorkspace(activeWorkspace.path)
        setRunningProjects(running)
        setJanusRunning(running.length > 0)
      } catch (err) {
        console.error('Failed to load workspace data:', err)
      }
    }

    loadData()
    const interval = setInterval(loadData, 3000)
    return () => clearInterval(interval)
  }, [activeWorkspace, setJanusRunning, setRunningProjects])

  useEffect(() => { configRef.current = workspaceConfig }, [workspaceConfig])

  const toggleRunning = useCallback(async () => {
    if (!activeWorkspace || !configRef.current) return
    try {
      if (janusRunning) {
        const running = await projectService.listByWorkspace(activeWorkspace.path)
        await Promise.all(running.map((p) => projectService.stop(p.id)))
        setJanusRunning(false)
        setRunningProjects([])
      } else {
        const cfg = configRef.current
        const defaultConfig =
          cfg.configurations.find((c) => c.name === 'dev') || cfg.configurations[0]
        if (defaultConfig) {
          const success = await projectService.start(activeWorkspace.path, defaultConfig.name)
          if (success) {
            const running = await projectService.listByWorkspace(activeWorkspace.path)
            setJanusRunning(running.length > 0)
            setRunningProjects(running)
          }
        }
      }
    } catch (err) {
      console.error('Failed to toggle project:', err)
    }
  }, [activeWorkspace, janusRunning, setJanusRunning, setRunningProjects])

  return { janusRunning, toggleRunning }
}

interface JanusIslandProps {
  stage?: 'collapsed' | 'peek' | 'expanded'
  onAdvance: () => void
  onCollapse: () => void
  onStepBack: () => void
  onRunningChange?: (isRunning: boolean) => void
  messages: Message[]
  pendingContent: string
  isStreaming: boolean
  error: string | null
  onChatSend: (text: string) => void
  onChatStop: () => void
  onChatRetry: () => void
  onChatClear: () => void
  onOpenLlmConfig: () => void
}

function faceClass(mode: 'sleep' | 'order' | 'analytics' | 'running'): string {
  if (mode === 'analytics') return 'mode-analytics'
  if (mode === 'running') return 'mode-running'
  return 'mode-order'
}

export function JanusIsland({
  stage = 'collapsed',
  onAdvance,
  onCollapse,
  onStepBack,
  onRunningChange,
  messages,
  pendingContent,
  isStreaming,
  error,
  onChatSend,
  onChatStop,
  onChatRetry,
  onChatClear,
  onOpenLlmConfig,
}: JanusIslandProps) {
  const { mode, isSwitching, activeWorkspace, eyeContainerRef } = useJanusState()
  const { janusRunning, toggleRunning } = useProjectRunning(activeWorkspace)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const [view, setView] = useState<'dual' | 'vision' | 'chat'>('dual')
  const [particles, setParticles] = useState<Array<{ id: number; left: number; size: number; duration: number }>>([])
  const pidRef = useRef(0)

  const blueprintMode = useAppStore((s) => s.blueprintMode)
  const setBlueprintMode = useAppStore((s) => s.setBlueprintMode)

  const handleLongPress = useCallback(async () => {
    await toggleRunning()
  }, [toggleRunning])

  const handleDoubleTap = useCallback(() => { onAdvance() }, [onAdvance])

  const handleIslandKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (stage !== 'collapsed' || event.repeat) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    onAdvance()
  }, [onAdvance, stage])

  const handleSwipeFlip = useCallback(() => {
    setBlueprintMode(!blueprintMode)
  }, [blueprintMode, setBlueprintMode])

  const handleDragProgress = useCallback((_deltaY: number, progress: number) => {
    useAppStore.getState().setDragFlipProgress(progress)
  }, [])

  const handleShellDoubleClick = useCallback(() => {
    if (stage === 'peek') {
      onAdvance()
      return
    }
    if (stage === 'expanded') {
      onStepBack()
    }
  }, [onAdvance, onStepBack, stage])

  const cycleView = useCallback(() => {
    setView((prev) => (prev === 'dual' ? 'vision' : prev === 'vision' ? 'chat' : 'dual'))
  }, [])

  const {
    islandRef,
    pullHintRef,
    eyeLeftRef,
    eyeRightRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } = useIslandGesture({
    onLongPress: handleLongPress,
    onSwipeFlip: handleSwipeFlip,
    onDoubleTap: handleDoubleTap,
    onDragProgress: handleDragProgress,
    isRunning: janusRunning,
  })

  const peekTitle = useMemo(() => {
    if (janusRunning) return 'Running'
    if (mode === 'analytics') return 'Analyzing'
    if (mode === 'sleep') return 'Idle'
    return 'Ready'
  }, [janusRunning, mode])

  const peekSubtitle = useMemo(() => {
    if (janusRunning) return 'Workspace active'
    if (mode === 'analytics') return 'Blueprint view engaged'
    if (mode === 'sleep') return 'No workspace selected'
    return 'Double-click to open'
  }, [janusRunning, mode])

  const modeLabel = mode === 'analytics' ? 'ANALYTICS' : mode === 'running' ? 'RUNNING' : 'ORDER'
  const statusText = janusRunning
    ? 'RUNNING // ACTIVE'
    : mode === 'analytics'
      ? 'ANALYTICS // PROCESSING...'
      : 'ORDER // IDLE'
  const modeColor = mode === 'running' ? '#00ff88' : '#ff7830'
  const nextViewLabel = view === 'dual' ? '◎ 仅视觉' : view === 'vision' ? '◎ 仅对话' : '◎ 双栏'

  useEffect(() => {
    if (stage === 'peek') setView('dual')
  }, [stage])

  useEffect(() => {
    if (stage === 'collapsed') return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      const shell = shellRef.current
      if (!shell || !target || shell.contains(target)) return
      if (stage === 'expanded') onStepBack()
      else onCollapse()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (stage === 'expanded') onStepBack()
      else onCollapse()
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onCollapse, onStepBack, stage])

  useEffect(() => {
    if (stage !== 'expanded') {
      setParticles([])
      return
    }
    const active = mode === 'analytics' || janusRunning
    const speed = active ? 200 : 800
    const spawn = () => {
      const id = ++pidRef.current
      const left = 20 + Math.random() * 60
      const size = active && Math.random() > 0.5 ? 6 : Math.random() > 0.8 ? 12 : 6
      const duration = active ? 1.5 + Math.random() * 2 : 3 + Math.random() * 4
      setParticles((prev) => [...prev, { id, left, size, duration }])
      window.setTimeout(() => setParticles((prev) => prev.filter((p) => p.id !== id)), duration * 1000)
    }
    const interval = window.setInterval(spawn, speed)
    return () => window.clearInterval(interval)
  }, [janusRunning, mode, stage])

  useEffect(() => {
    onRunningChange?.(janusRunning)
    document.body.classList.toggle('is-running', janusRunning)
    return () => { document.body.classList.remove('is-running') }
  }, [janusRunning, onRunningChange])

  return (
    <div
      ref={shellRef}
      className={`janus-island-shell ${faceClass(mode)}`}
      data-stage={stage}
      data-view={view}
      data-mode={mode}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (stage !== 'collapsed') handleShellDoubleClick()
      }}
    >
      {stage === 'expanded' && <div className="janus-veil" />}
      <div ref={pullHintRef} className="pull-hint" />
      <div className="burst-ripple" />
      <div
        ref={islandRef}
        data-mode={mode}
        data-stage={stage}
        className={`janus-island${isSwitching ? ' switching' : ''}`}
        role={stage === 'collapsed' ? 'button' : undefined}
        tabIndex={stage === 'collapsed' ? 0 : undefined}
        aria-label={stage === 'collapsed' ? 'Open Janus Island' : undefined}
        onKeyDown={stage === 'collapsed' ? handleIslandKeyDown : undefined}
        onPointerDown={stage === 'collapsed' ? handlePointerDown : undefined}
        onPointerMove={stage === 'collapsed' ? handlePointerMove : undefined}
        onPointerUp={stage === 'collapsed' ? handlePointerUp : undefined}
        onPointerCancel={stage === 'collapsed' ? handlePointerCancel : undefined}
      >
        <div className="janus-collapsed-core">
          <div ref={(el) => { eyeContainerRef.current = el }} className="janus-face-mini">
            <JanusEye mode={mode} size={10} leftRef={eyeLeftRef} rightRef={eyeRightRef} />
          </div>
        </div>

        <div className="janus-peek-shell">
          <div className="janus-peek-orbit" aria-hidden="true" />
          <div className="janus-peek-core">
            <div className="janus-peek-leading">
              <div className={`janus-peek-sigil ${faceClass(mode)}`}>
                <div className="janus-peek-halo halo-outer" aria-hidden="true" />
                <div className="janus-peek-halo halo-inner" aria-hidden="true" />
                <div className="janus-peek-eyes" aria-hidden="true">
                  <div className="janus-peek-eye left" />
                  <div className="janus-peek-eye right" />
                </div>
              </div>
              <div className="janus-peek-copy">
                <div className="janus-peek-title">{peekTitle}</div>
                <div className="janus-peek-subtitle">{peekSubtitle}</div>
              </div>
            </div>
            <div className="janus-peek-trailing">
              <div className="janus-peek-statusline">{statusText}</div>
              <div className="janus-peek-pulse" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </div>

        <div className="janus-expanded-shell">
          <div className="janus-expanded-topbar">
            <div className="janus-expanded-brand island-title">
              <span>◎</span> JANUS ENGINE
            </div>
            <div className="janus-expanded-meta">
              <span className="janus-expanded-meta-text">Esc / 双击收起</span>
              <span className="janus-expanded-mode-pill">{modeLabel}</span>
            </div>
          </div>

          <div className="janus-expanded-body">
            <div className={`janus-crt ${janusRunning ? 'running' : ''}`}>
              <div className={`warp-grid ${janusRunning ? 'running' : ''}`} />
              <div className={`scanline ${janusRunning ? 'running' : ''}`} />
              <div className="pixel-overlay" />
              {particles.map(({ id, left, size, duration }) => (
                <div
                  key={id}
                  className="particle"
                  style={{ left: `${left}%`, width: size, height: size, animation: `float-up ${duration}s ease-in forwards` }}
                />
              ))}
              <div className="levitation-wrapper">
                <div className={`janus-face-lg ${faceClass(mode)}`}>
                  <div className="janus-eye-lg left-eye-lg" />
                  <div className="janus-eye-lg right-eye-lg" />
                </div>
              </div>
              <div className="janus-status-text">{statusText}</div>
            </div>

            <JanusChat
              visible
              docked
              modeColor={modeColor}
              messages={messages}
              pendingContent={pendingContent}
              isStreaming={isStreaming}
              error={error}
              onSend={onChatSend}
              onStop={onChatStop}
              onRetry={onChatRetry}
              onClear={onChatClear}
              onOpenLlmConfig={onOpenLlmConfig}
            />
          </div>

          <div className="janus-expanded-bottombar">
            <div className="janus-expanded-caption">
              <span>神性协议终端</span>
              <span className="janus-expanded-caption-divider" />
              <span>{statusText}</span>
            </div>
            <div className="janus-expanded-actions">
              <button className="janus-chat-toggle" onClick={cycleView} style={{ color: modeColor }}>
                {nextViewLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
