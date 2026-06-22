import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { JanusMode } from './JanusEye'
import { JanusChat } from './JanusChat'

/* ════════════════════════════════════════════════════════════
   JanusExpanded — 展开面板组件
   CRT 效果 + Divine Halo + 大型 CSS 驱动眼 + 对话界面
   ════════════════════════════════════════════════════════════ */

interface JanusExpandedProps {
  mode: JanusMode
  isRunning: boolean
  onCollapse: () => void
}

/** mode → CSS class for large eye container */
function faceClass(mode: JanusMode): string {
  if (mode === 'analytics') return 'mode-analytics'
  if (mode === 'running') return 'mode-running'
  // 'sleep' and 'order' both use cyan management visuals
  return 'mode-order'
}

export function JanusExpanded({
  mode,
  isRunning,
  onCollapse,
}: JanusExpandedProps) {
  const [collapsing, setCollapsing] = useState(false)
  const [showChat, setShowChat] = useState(false)

  const handleCollapse = useCallback(() => {
    setCollapsing(true)
  }, [])

  const handleCollapseEnd = useCallback(() => {
    setCollapsing(false)
    onCollapse()
  }, [onCollapse])

  const handleBackdropClick = useCallback(() => {
    handleCollapse()
  }, [handleCollapse])

  const handleHeaderDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      handleCollapse()
    },
    [handleCollapse],
  )

  const toggleChat = useCallback(() => {
    setShowChat(prev => !prev)
  }, [])

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

  return createPortal(
    <div
      className="janus-backdrop visible titlebar-no-drag"
      style={{ zIndex: 99999 }}
    >
      {/* 遮罩 */}
      <div
        className="janus-backdrop-bg"
        onClick={handleBackdropClick}
      />

      {/* 展开容器 — 定位由 CSS .janus-expanded 管理 */}
      <div
        className={`janus-expanded ${expandedModeClass} ${collapsing ? 'collapsing' : ''}`}
        onAnimationEnd={collapsing ? handleCollapseEnd : undefined}
      >
          {/* Header */}
          <div
            className="flex justify-between items-center pb-1.5 janus-expanded-header"
            style={{
              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onDoubleClick={handleHeaderDoubleClick}
            title="双击标题栏收合"
          >
            <div
              className="text-[11px] font-bold uppercase tracking-[1px] flex items-center gap-1.5 island-title"
            >
              <span>◎</span> JANUS ENGINE
            </div>
            <div className="text-[9px] text-[#52525b]">双击标题栏收合</div>
          </div>

          {/* CRT 区域 */}
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

          {/* 对话界面 */}
          <JanusChat visible={showChat} modeColor={modeColor} />

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
                onClick={toggleChat}
                style={{ color: showChat ? modeColor : '#52525b' }}
              >
                {showChat ? '◎ 关闭对话' : '◎ 对话'}
              </button>
            </span>
            <span className="text-[10px] font-bold tracking-[1px] island-footer-right">
              MODE: {modeLabel}
            </span>
          </div>
        </div>

    </div>,
    document.body,
  )
}
