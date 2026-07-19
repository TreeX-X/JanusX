import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import type { RightToolId } from '@/right-tools/types'
import { useAppStore } from '@/stores/app'
import { useRightToolStore } from '@/stores/right-tools'
import { useWorkspaceStore } from '@/stores/workspace'
import {
  clampRightToolPanelWidth,
  RIGHT_TOOL_PANEL_MIN_WIDTH,
} from '@/right-tools/state'
import { RightToolHost } from './RightToolHost'
import { RightToolRail } from './RightToolRail'
import { RightToolTabs } from './RightToolTabs'
import styles from './RightDock.module.css'

export interface RightDockProps {
  effectiveCollapsed: boolean
  effectiveMaxWidth: number
  forcedCollapsed: boolean
  onResizingChange: (resizing: boolean) => void
}

interface ResizeSession {
  pointerId: number
  target: HTMLDivElement
  startX: number
  startWidth: number
}

export function RightDock({
  effectiveCollapsed,
  effectiveMaxWidth,
  forcedCollapsed,
  onResizingChange,
}: RightDockProps) {
  const openToolIds = useRightToolStore((state) => state.openToolIds)
  const activeToolId = useRightToolStore((state) => state.activeToolId)
  const panelWidth = useRightToolStore((state) => state.panelWidth)
  const activateTool = useRightToolStore((state) => state.activateTool)
  const closeTool = useRightToolStore((state) => state.closeTool)
  const toggleFromRail = useRightToolStore((state) => state.toggleFromRail)
  const setPanelWidth = useRightToolStore((state) => state.setPanelWidth)
  const panelCollapsed = useAppStore((state) => state.panelCollapsed)
  const togglePanel = useAppStore((state) => state.togglePanel)
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId)
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const resizeSessionRef = useRef<ResizeSession | null>(null)
  const bodyStyleRef = useRef<{ cursor: string; userSelect: string } | null>(null)
  const workspacePath = workspaces.find(({ id }) => id === activeWorkspaceId)?.path ?? null
  const contentVisible = !effectiveCollapsed && activeToolId !== null
  const maximum = Math.max(RIGHT_TOOL_PANEL_MIN_WIDTH, effectiveMaxWidth)
  const renderedPanelWidth = clampRightToolPanelWidth(panelWidth, maximum)

  useEffect(() => {
    if (effectiveMaxWidth < RIGHT_TOOL_PANEL_MIN_WIDTH) return
    const width = clampRightToolPanelWidth(panelWidth, effectiveMaxWidth)
    if (width !== panelWidth) setPanelWidth(width)
  }, [effectiveMaxWidth, panelWidth, setPanelWidth])

  const finishResize = useCallback(() => {
    const session = resizeSessionRef.current
    if (session?.target.hasPointerCapture(session.pointerId)) {
      session.target.releasePointerCapture(session.pointerId)
    }
    resizeSessionRef.current = null
    if (session) onResizingChange(false)
    if (bodyStyleRef.current) {
      document.body.style.cursor = bodyStyleRef.current.cursor
      document.body.style.userSelect = bodyStyleRef.current.userSelect
      bodyStyleRef.current = null
    }
  }, [onResizingChange])

  useEffect(() => finishResize, [finishResize])

  useEffect(() => {
    if (effectiveCollapsed) finishResize()
  }, [effectiveCollapsed, finishResize])

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    finishResize()
    resizeSessionRef.current = {
      pointerId: event.pointerId,
      target: event.currentTarget,
      startX: event.clientX,
      startWidth: renderedPanelWidth,
    }
    bodyStyleRef.current = {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    event.currentTarget.setPointerCapture(event.pointerId)
    onResizingChange(true)
    event.preventDefault()
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const session = resizeSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    setPanelWidth(clampRightToolPanelWidth(session.startWidth + session.startX - event.clientX, maximum))
  }

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (resizeSessionRef.current?.pointerId === event.pointerId) finishResize()
  }

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const widths: Partial<Record<string, number>> = {
      ArrowLeft: renderedPanelWidth + 16,
      ArrowRight: renderedPanelWidth - 16,
      Home: RIGHT_TOOL_PANEL_MIN_WIDTH,
      End: maximum,
    }
    const width = widths[event.key]
    if (width === undefined) return
    setPanelWidth(clampRightToolPanelWidth(width, maximum))
    event.preventDefault()
  }

  const handleRailTool = (toolId: RightToolId) => {
    const manualCollapsed = useAppStore.getState().panelCollapsed
    toggleFromRail(toolId)
    if (forcedCollapsed) useAppStore.getState().setPanelCollapsed(manualCollapsed)
  }

  return (
    <aside className={styles.dock} data-collapsed={effectiveCollapsed} aria-label="右侧工具 Dock">
      <div
        className={styles.panel}
        style={{ width: renderedPanelWidth }}
        hidden={!contentVisible}
        aria-hidden={!contentVisible}
        {...(!contentVisible ? { inert: '' } : {})}
        data-testid="right-tool-panel-shell"
      >
          <div
            className={styles.resizeHandle}
            role="separator"
            aria-label="调整右侧工具面板宽度"
            aria-orientation="vertical"
            aria-valuemin={RIGHT_TOOL_PANEL_MIN_WIDTH}
            aria-valuemax={Math.round(maximum)}
            aria-valuenow={Math.round(renderedPanelWidth)}
            tabIndex={0}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onLostPointerCapture={handlePointerEnd}
            onKeyDown={handleResizeKeyDown}
          />
          <div className={styles.panelHeader}>
            <RightToolTabs
              openToolIds={openToolIds}
              activeToolId={activeToolId}
              onActivate={activateTool}
              onClose={closeTool}
            />
            <button
              type="button"
              className={styles.headerCollapse}
              aria-label="折叠右侧工具面板"
              title="折叠面板"
              onClick={togglePanel}
            >
              <span className={styles.collapseGlyph} aria-hidden="true" />
            </button>
          </div>
          <RightToolHost
            openToolIds={openToolIds}
            activeToolId={activeToolId}
            workspaceId={activeWorkspaceId}
            workspacePath={workspacePath}
            dockVisible={contentVisible}
            onClose={closeTool}
          />
      </div>
      <RightToolRail
        openToolIds={openToolIds}
        activeToolId={activeToolId}
        collapsed={effectiveCollapsed || panelCollapsed}
        panelToggleDisabled={forcedCollapsed}
        onToggleTool={handleRailTool}
        onTogglePanel={togglePanel}
      />
    </aside>
  )
}
