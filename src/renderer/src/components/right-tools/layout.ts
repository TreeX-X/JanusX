import {
  clampRightToolPanelWidth,
  RIGHT_TOOL_PANEL_MIN_WIDTH,
} from '@/right-tools/state'

export const RIGHT_TOOL_RAIL_WIDTH = 48
export const CENTER_WORKSPACE_MIN_WIDTH = 320

interface RightDockLayoutInput {
  availableWidth: number
  panelCollapsed: boolean
  panelWidth: number
  hasActiveTool: boolean
}

export interface RightDockLayout {
  effectiveCollapsed: boolean
  responsiveAutoCollapsed: boolean
  effectiveMaxWidth: number
  panelWidth: number
  dockWidth: number
}

export function getRightDockLayout({
  availableWidth,
  panelCollapsed,
  panelWidth,
  hasActiveTool,
}: RightDockLayoutInput): RightDockLayout {
  const effectiveMaxWidth = Math.min(
    420,
    availableWidth - CENTER_WORKSPACE_MIN_WIDTH - RIGHT_TOOL_RAIL_WIDTH,
  )
  const responsiveAutoCollapsed = effectiveMaxWidth < RIGHT_TOOL_PANEL_MIN_WIDTH
  // 产物工作区打开只做“默认收起”（由 App 在打开瞬间 setPanelCollapsed(true)），
  // 不再强制 effectiveCollapsed：空间足够时用户点击 rail 仍可手动展开。
  // forcedCollapsed 因此只保留响应式（空间不足）分支。
  const effectiveCollapsed = panelCollapsed || responsiveAutoCollapsed
  const constrainedPanelWidth = clampRightToolPanelWidth(panelWidth, effectiveMaxWidth)

  return {
    effectiveCollapsed,
    responsiveAutoCollapsed,
    effectiveMaxWidth,
    panelWidth: constrainedPanelWidth,
    dockWidth: RIGHT_TOOL_RAIL_WIDTH + (!effectiveCollapsed && hasActiveTool ? constrainedPanelWidth : 0),
  }
}
