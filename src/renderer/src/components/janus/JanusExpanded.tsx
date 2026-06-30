import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JanusMode } from './JanusEye'
import { JanusChat } from './JanusChat'
import type { Message } from './useJanusChat'

/* ════════════════════════════════════════════════════════════
   JanusExpanded — 展开面板组件
   CRT 效果 + Divine Halo + 大型 CSS 驱动眼 + 对话界面
   ════════════════════════════════════════════════════════════ */

interface JanusExpandedProps {
  stage: 'peek' | 'expanded'
  mode: JanusMode
  isRunning: boolean
  onAdvance: () => void
  onCollapse: () => void
  onStepBack: () => void
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

/** mode → CSS class for large eye container */
function faceClass(mode: JanusMode): string {
  if (mode === 'analytics') return 'mode-analytics'
  if (mode === 'running') return 'mode-running'
  // 'sleep' and 'order' both use cyan management visuals
  return 'mode-order'
}

export function JanusExpanded({
  stage,
  mode,
  isRunning,
  onAdvance,
  onCollapse,
  onStepBack,
  messages,
  pendingContent,
  isStreaming,
  error,
  onChatSend,
  onChatStop,
  onChatRetry,
  onChatClear,
  onOpenLlmConfig,
}: JanusExpandedProps) {
  const [collapsing, setCollapsing] = useState(false)
  const [enteredFromCollapsed, setEnteredFromCollapsed] = useState(true)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const [view, setView] = useState<'dual' | 'vision' | 'chat'>('dual')

  useEffect(() => {
    if (stage === 'peek') setView('dual')
  }, [stage])

  useEffect(() => {
    const timer = window.setTimeout(() => setEnteredFromCollapsed(false), 220)
    return () => window.clearTimeout(timer)
  }, [])

  const handleCollapse = useCallback(() => {
    setCollapsing(true)
  }, [])

  const handleCollapseEnd = useCallback(() => {
    setCollapsing(false)
    onCollapse()
  }, [onCollapse])

  const handleBackdropClick = useCallback(() => {
    if (stage === 'expanded') {
      onStepBack()
      return
    }
    handleCollapse()
  }, [handleCollapse, onStepBack, stage])

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (stage === 'peek') {
        onAdvance()
        return
      }
      onStepBack()
    },
    [onAdvance, onStepBack, stage],
  )

  // 视图循环：dual → vision → chat → dual
  const cycleView = useCallback(() => {
    setView(prev => (prev === 'dual' ? 'vision' : prev === 'vision' ? 'chat' : 'dual'))
  }, [])

  // 按钮文案显示「下一目标态」
  const nextViewLabel =
    view === 'dual' ? '◎ 仅视觉' : view === 'vision' ? '◎ 仅对话' : '◎ 双栏'

  /*-- 状态文本 --*/
  const modeLabel =
    mode === 'analytics' ? 'ANALYTICS' : mode === 'running' ? 'RUNNING' : 'ORDER'

  const statusText =
    isRunning
      ? 'RUNNING // ACTIVE'
      : mode === 'analytics'
        ? 'ANALYTICS // PROCESSING...'
        : 'ORDER // IDLE'

  /*-- 模式颜色 --*/
  const modeColor = mode === 'running' ? '#00ff88' : '#ff7830'
  const peekTitle = useMemo(() => {
    if (isRunning) return 'Running'
    if (mode === 'analytics') return 'Analyzing'
    if (mode === 'sleep') return 'Idle'
    return 'Ready'
  }, [isRunning, mode])
  const peekSubtitle = useMemo(() => {
    if (isRunning) return 'Workspace active'
    if (mode === 'analytics') return 'Blueprint view engaged'
    if (mode === 'sleep') return 'No workspace selected'
    return 'Double-click to open'
  }, [isRunning, mode])

  /*-- 粒子系统 --*/
  const [particles, setParticles] = useState<Array<{
    id: number; left: number; size: number; duration: number
  }>>([])
  const pidRef = useRef(0)

  useEffect(() => {
    const isActive = mode === 'analytics' || isRunning
    const speed = isActive ? 200 : 800

    const spawn = () => {
      const id = ++pidRef.current
      const left = 20 + Math.random() * 60
      const size = (isActive && Math.random() > 0.5) ? 6 : (Math.random() > 0.8 ? 12 : 6)
      const duration = isActive ? (1.5 + Math.random() * 2) : (3 + Math.random() * 4)
      setParticles(prev => [...prev, { id, left, size, duration }])
      setTimeout(() => setParticles(prev => prev.filter(p => p.id !== id)), duration * 1000)
    }

    const interval = setInterval(spawn, speed)
    return () => clearInterval(interval)
  }, [mode, isRunning])

  /*-- expanded 面板的模式 class --*/
  const expandedModeClass = isRunning
    ? 'mode-running'
    : mode === 'analytics'
      ? 'mode-analytics'
      : 'mode-order'

  useEffect(() => {
    if (collapsing) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      const shell = shellRef.current
      if (!shell || !target || shell.contains(target)) return
      handleBackdropClick()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      handleBackdropClick()
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [collapsing, handleBackdropClick])

  return (
    <>
      {stage === 'expanded' && <div className="janus-veil" />}
      <div
        ref={shellRef}
        className={`janus-expanded ${expandedModeClass}${enteredFromCollapsed ? ' from-collapsed' : ''}${collapsing ? ' collapsing' : ''}`}
        data-stage={stage}
        data-view={view}
        role="region"
        aria-label="Janus Island"
        onDoubleClick={handleDoubleClick}
        onAnimationEnd={collapsing ? handleCollapseEnd : undefined}
      >
        {stage === 'peek' ? (
          <div className="janus-peek-shell">
            <div className="janus-peek-orbit" aria-hidden="true" />
            <div className="janus-peek-core">
              <div className={`janus-peek-sigil ${expandedModeClass}`}>
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
              <div className="janus-peek-pulse" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        ) : (
          <>
          <div
            className="flex justify-between items-center pb-1.5"
            style={{
              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          >
            <div
              className="text-[11px] font-bold uppercase tracking-[1px] flex items-center gap-1.5 island-title"
            >
              <span>◎</span> JANUS ENGINE
            </div>
            <div className="text-[9px] text-[#52525b]">Esc / 外部点击收起</div>
          </div>

          <div
            className="janus-expanded-body"
          >
            {/* CRT 区域（左栏） */}
            <div
              className={`janus-crt ${isRunning ? 'running' : ''}`}
            >
              {/* 透视网格 */}
              <div className={`warp-grid ${isRunning ? 'running' : ''}`} />

              {/* 扫描线 */}
              <div className={`scanline ${isRunning ? 'running' : ''}`} />

              {/* 像素覆盖 */}
              <div className="pixel-overlay" />

              {/* 升腾粒子 */}
              {particles.map(({ id, left, size, duration }) => (
                <div
                  key={id}
                  className="particle"
                  style={{ left: `${left}%`, width: size, height: size, animation: `float-up ${duration}s ease-in forwards` }}
                />
              ))}

              {/* 悬浮大型眼 — CSS 驱动，非 JanusEye 组件 */}
              <div className="levitation-wrapper">
                <div className={`janus-face-lg ${faceClass(mode)}`}>
                  <div className="janus-eye-lg left-eye-lg" />
                  <div className="janus-eye-lg right-eye-lg" />
                </div>
              </div>

              {/* 状态文本 */}
              <div className="janus-status-text">
                {statusText}
              </div>
            </div>

            {/* 对话界面（右栏，停靠态） */}
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

          {/* Footer */}
          <div
            className="flex justify-between items-center pt-1.5 text-[10px]"
            style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.05)',
              color: '#71717a',
            }}
          >
            <span className="flex items-center gap-2">
              <span>神性协议终端</span>
              <button
                className="janus-chat-toggle"
                onClick={cycleView}
                style={{ color: modeColor }}
              >
                {nextViewLabel}
              </button>
            </span>
            <span className="text-[10px] font-bold tracking-[1px] island-footer-right">
              MODE: {modeLabel}
            </span>
          </div>
          </>
        )}
      </div>
    </>
  )
}
