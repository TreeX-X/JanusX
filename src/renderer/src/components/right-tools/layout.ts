import {
  clampRightToolPanelWidth,
  RIGHT_TOOL_PANEL_MIN_WIDTH,
} from '@/right-tools/state'

export const RIGHT_TOOL_RAIL_WIDTH = 48
export const CENTER_WORKSPACE_MIN_WIDTH = 320

interface RightDockLayoutInput {
  availableWidth: number
  panelCollapsed: boolean
  officeRendered: boolean
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
  officeRendered,
  panelWidth,
  hasActiveTool,
}: RightDockLayoutInput): RightDockLayout {
  const effectiveMaxWidth = Math.min(
    420,
    availableWidth - CENTER_WORKSPACE_MIN_WIDTH - RIGHT_TOOL_RAIL_WIDTH,
  )
  const responsiveAutoCollapsed = effectiveMaxWidth < RIGHT_TOOL_PANEL_MIN_WIDTH
  const effectiveCollapsed = panelCollapsed || officeRendered || responsiveAutoCollapsed
  const constrainedPanelWidth = clampRightToolPanelWidth(panelWidth, effectiveMaxWidth)

  return {
    effectiveCollapsed,
    responsiveAutoCollapsed,
    effectiveMaxWidth,
    panelWidth: constrainedPanelWidth,
    dockWidth: RIGHT_TOOL_RAIL_WIDTH + (!effectiveCollapsed && hasActiveTool ? constrainedPanelWidth : 0),
  }
}
