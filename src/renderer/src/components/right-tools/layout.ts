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
  const minimum = rightToolPanelMinWidth(activeToolId)
  const effectiveMaxWidth = Math.min(
    rightToolPanelMaxWidth(activeToolId),
    availableWidth - CENTER_WORKSPACE_MIN_WIDTH - RIGHT_TOOL_RAIL_WIDTH,
  )
  const responsiveAutoCollapsed = effectiveMaxWidth < minimum
  // 产物工作区打开只做“默认收起”（由 App 在打开瞬间 setPanelCollapsed(true)），
  // 不再强制 effectiveCollapsed：空间足够时用户点击 rail 仍可手动展开。
  // forcedCollapsed 因此只保留响应式（空间不足）分支。
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
