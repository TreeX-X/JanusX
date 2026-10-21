import {
  clampRightToolPanelWidth,
  preferredRightToolPanelWidth,
  rightToolPanelMaxWidth,
  rightToolPanelMinWidth,
} from '@/right-tools/state'
import type { RightToolId, RightToolPreferencesV1 } from '@/right-tools/types'

export const RIGHT_TOOL_RAIL_WIDTH = 48
export const CENTER_WORKSPACE_MIN_WIDTH = 320

interface RightDockLayoutInput {
  availableWidth: number
  panelCollapsed: boolean
  panelWidth: number
  panelWidths?: RightToolPreferencesV1['panelWidths']
  activeToolId?: RightToolId | null
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
  panelWidths,
  activeToolId,
  hasActiveTool,
}: RightDockLayoutInput): RightDockLayout {
  const effectiveMaxWidth = Math.min(
    rightToolPanelMaxWidth(activeToolId),
    availableWidth - CENTER_WORKSPACE_MIN_WIDTH - RIGHT_TOOL_RAIL_WIDTH,
  )
  // Docked panels reserve space; floating previews use the rail only.
  const responsiveAutoCollapsed = effectiveMaxWidth < rightToolPanelMinWidth(activeToolId)
  const effectiveCollapsed = panelCollapsed || responsiveAutoCollapsed
  const preferredWidth = preferredRightToolPanelWidth(panelWidth, panelWidths, activeToolId)
  const constrainedPanelWidth = clampRightToolPanelWidth(preferredWidth, effectiveMaxWidth, activeToolId)

  return {
    effectiveCollapsed,
    responsiveAutoCollapsed,
    effectiveMaxWidth,
    panelWidth: constrainedPanelWidth,
    dockWidth: RIGHT_TOOL_RAIL_WIDTH + (!effectiveCollapsed && hasActiveTool ? constrainedPanelWidth : 0),
  }
}
