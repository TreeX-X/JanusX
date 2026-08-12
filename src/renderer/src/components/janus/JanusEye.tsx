import type { Ref } from 'react'
import type { JanusMode } from './janusIdentity'
import { useI18n } from '@/i18n/useI18n'

export type { JanusMode } from './janusIdentity'

export interface JanusEyeProps {
  mode: JanusMode
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
export function JanusEye({ mode, className, leftRef, rightRef }: JanusEyeProps) {
  const { t } = useI18n('janus')
  const modeLabelKeyMap: Record<JanusMode, string> = {
    sleep: 'janus:identity.mode.idle',
    order: 'janus:identity.mode.ready',
    analytics: 'janus:identity.mode.scanning',
    running: 'janus:identity.mode.running',
  }

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
      aria-label={t('janus:identity.eyeAria', { mode: t(modeLabelKeyMap[mode]) })}
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
