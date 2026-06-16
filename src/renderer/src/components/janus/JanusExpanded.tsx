import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import type { JanusMode } from './JanusEye'

/* ════════════════════════════════════════════════════════════
   JanusExpanded — 展开面板组件
   CRT 效果 + Divine Halo + 大型 CSS 驱动眼
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

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      handleCollapse()
    },
    [handleCollapse],
  )

  /*-- 状态文本 --*/
  const modeLabel =
    mode === 'analytics' ? 'ANALYTICS' : mode === 'running' ? 'RUNNING' : 'ORDER'

  const statusText =
    isRunning
      ? 'DIVINE REACTOR // OVERLOAD'
      : mode === 'analytics'
        ? 'ANALYTICS // PROCESSING'
        : 'ORDER // IDLE'

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

      {/* 展开容器 */}
      <div
        className="absolute left-1/2"
        style={{ top: 38, transform: 'translateX(-50%)' }}
      >
        <div
          className={`janus-expanded ${expandedModeClass} ${collapsing ? 'collapsing' : ''}`}
          onDoubleClick={handleDoubleClick}
          onAnimationEnd={collapsing ? handleCollapseEnd : undefined}
        >
          {/* Header */}
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
            <div className="text-[9px] text-[#52525b]">双击空白处收合</div>
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

            {/* Divine Halo */}
            <div
              className={`divine-halo-container ${
                mode === 'analytics' ? 'analytics' : ''
              } ${isRunning ? 'running' : ''}`}
            >
              <div className="halo-outer" />
              <div className="halo-inner" />
            </div>

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

          {/* Footer */}
          <div
            className="flex justify-between items-center pt-1.5 text-[10px]"
            style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.05)',
              color: '#71717a',
            }}
          >
            <span>神性协议终端</span>
            <span className="text-[10px] font-bold tracking-[1px] island-footer-right">
              MODE: {modeLabel}
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
