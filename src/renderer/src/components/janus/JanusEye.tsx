import type { Ref } from 'react'
import { getJanusModeIdentity, type JanusMode } from './janusIdentity'

export type { JanusMode } from './janusIdentity'

export interface JanusEyeProps {
  mode: JanusMode
  /** 尺寸基准（px），默认 10。预留缩放能力，当前视觉由 CSS 固定 */
  size?: number
  className?: string
  /** 左眼元素 ref — 用于长按蓄力时 translateX 靠拢 */
  leftRef?: Ref<HTMLDivElement>
  /** 右眼元素 ref — 用于长按蓄力时 translateX 靠拢 */
  rightRef?: Ref<HTMLDivElement>
}

/**
 * JanusEye — CSS 驱动的灵动岛微型眼
 *
 * 所有视觉样式（尺寸、颜色、动画）由 janus-island.css 中的
 * .mode-{mode} .janus-eye-mini / .left-eye-mini / .right-eye-mini 规则控制。
 * 组件仅负责渲染正确的 DOM 结构与 data 属性。
 */
export function JanusEye({ mode, size = 10, className, leftRef, rightRef }: JanusEyeProps) {
  const identity = getJanusModeIdentity(mode)

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '3px',
      }}
      data-janus-mode={mode}
      role="img"
      aria-label={`Janus eye - ${identity.label} mode`}
    >
      {mode === 'sleep' ? (
        <div className="janus-eye-mini" />
      ) : (
        <>
          <div ref={leftRef} className="left-eye-mini janus-eye-mini" />
          <div ref={rightRef} className="right-eye-mini janus-eye-mini" />
        </>
      )}
    </div>
  )
}
