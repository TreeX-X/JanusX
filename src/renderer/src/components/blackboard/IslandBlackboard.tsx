import { useCallback, useEffect, useState } from 'react'
import { ChevronUp } from 'lucide-react'
import { useAppStore, BLACKBOARD_MIN_HEIGHT, saveBlackboardHeight } from '@/stores/app'
import { useI18n } from '@/i18n/useI18n'
import { BlueprintView } from '../blueprint/BlueprintView'
import { BlueprintDetailPortalContext } from '../blueprint/blueprintDetailPortal'
import './island-blackboard.css'

/* ════════════════════════════════════════════════════════════
   IslandBlackboard —— 岛下拉副黑板
   Note: .agents/notes/workbench/island-blackboard.md

   形态：中部工作区列内的上带。下拉手势把主工作区下滑让位，
   板在空出的上带里长出——不是从顶部盖下的卷帘，也不碰左右栏架。
   板面复用蓝图界面（BlueprintView）：画布节点可交互点击查看，
   左侧详情槽显示内容；不带右侧对话，不设文件钉。
   ════════════════════════════════════════════════════════════ */

export function IslandBlackboard() {
  const { t } = useI18n('janus')
  const blackboardHeight = useAppStore((s) => s.blackboardHeight)
  const blackboardDrag = useAppStore((s) => s.blackboardDrag)
  const setBlackboardHeight = useAppStore((s) => s.setBlackboardHeight)
  const [detailPortalNode, setDetailPortalNode] = useState<HTMLDivElement | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  /*-- 拖拽预览跟手；落点/收起用 settled 高度 --*/
  const dragging = blackboardDrag !== null
  const effectiveHeight = dragging ? blackboardDrag : blackboardHeight

  const persistHeight = useCallback((height: number) => {
    saveBlackboardHeight(height)
  }, [])

  const close = useCallback(() => {
    useAppStore.getState().setBlackboardDrag(null)
    setBlackboardHeight(0)
  }, [setBlackboardHeight])

  /*-- Esc 收板：焦点在 iframe 内时 Esc 归板内页面本身 --*/
  useEffect(() => {
    if (blackboardHeight === 0 && blackboardDrag === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const active = document.activeElement
      if (active && (active.tagName === 'IFRAME' || active instanceof HTMLIFrameElement)) return
      close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [blackboardHeight, blackboardDrag, close])

  /*-- 下缘拖高/上推收板：9px 命中区，与工作区分隔线同语言 --*/
  const onEdgePointerDown = useCallback((event: React.PointerEvent) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = blackboardHeight
    const move = (ev: PointerEvent) => {
      const next = Math.min(Math.max(startHeight + (ev.clientY - startY), 0), window.innerHeight * 0.7)
      setBlackboardHeight(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const settled = useAppStore.getState().blackboardHeight
      if (settled < BLACKBOARD_MIN_HEIGHT) {
        close()
      } else {
        persistHeight(settled)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [blackboardHeight, setBlackboardHeight, close, persistHeight])

  return (
    <section
      className="island-blackboard"
      data-dragging={dragging || undefined}
      style={{ height: effectiveHeight }}
      aria-label={t('janus:blackboard.title')}
      aria-hidden={effectiveHeight === 0}
    >
      {effectiveHeight > 0 && (
        <>
          <header className="bb-bar">
            <span className="bb-title">{t('janus:blackboard.title')}</span>
            <button
              type="button"
              className="bb-collapse"
              onClick={close}
              title={t('janus:blackboard.close')}
              aria-label={t('janus:blackboard.close')}
            >
              <ChevronUp size={14} aria-hidden="true" />
            </button>
          </header>

          <div className="bb-slot">
            <div className="bb-blueprint-row">
              <BlueprintDetailPortalContext.Provider value={detailPortalNode}>
                <div
                  ref={setDetailPortalNode}
                  className="bb-detail-slot"
                  data-open={detailOpen ? 'true' : 'false'}
                />
                <div className="bb-canvas-slot">
                  <BlueprintView density="workbench" onDetailOpenChange={setDetailOpen} />
                </div>
              </BlueprintDetailPortalContext.Provider>
            </div>
          </div>

          <div
            className="bb-edge"
            role="separator"
            aria-orientation="horizontal"
            aria-label={t('janus:blackboard.title')}
            onPointerDown={onEdgePointerDown}
          />
        </>
      )}
    </section>
  )
}
