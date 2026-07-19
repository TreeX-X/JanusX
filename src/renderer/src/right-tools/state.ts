import { isRightToolId, RIGHT_TOOL_IDS } from './registry'
import type {
  PanelCollapseCommand,
  RightToolId,
  RightToolPreferencesV1,
  RightToolTransition,
} from './types'

export const RIGHT_TOOL_SCHEMA_VERSION = 1 as const
export const RIGHT_TOOL_PANEL_MIN_WIDTH = 240
export const RIGHT_TOOL_PANEL_DEFAULT_WIDTH = 280
export const RIGHT_TOOL_PANEL_MAX_WIDTH = 420

const TOOL_ORDER = new Map(RIGHT_TOOL_IDS.map((id, index) => [id, index]))

export function createDefaultRightToolPreferences(): RightToolPreferencesV1 {
  return {
    schemaVersion: RIGHT_TOOL_SCHEMA_VERSION,
    openToolIds: [],
    activeToolId: null,
    panelWidth: RIGHT_TOOL_PANEL_DEFAULT_WIDTH,
  }
}

export function clampRightToolPanelWidth(
  width: unknown,
  maximum = RIGHT_TOOL_PANEL_MAX_WIDTH,
): number {
  const effectiveMaximum = Number.isFinite(maximum)
    ? Math.min(RIGHT_TOOL_PANEL_MAX_WIDTH, Math.max(RIGHT_TOOL_PANEL_MIN_WIDTH, maximum))
    : RIGHT_TOOL_PANEL_MAX_WIDTH

  if (typeof width !== 'number' || !Number.isFinite(width)) {
    return Math.min(RIGHT_TOOL_PANEL_DEFAULT_WIDTH, effectiveMaximum)
  }

  return Math.min(effectiveMaximum, Math.max(RIGHT_TOOL_PANEL_MIN_WIDTH, width))
}

export function normalizeRightToolIds(value: unknown): RightToolId[] {
  if (!Array.isArray(value)) return []

  return [...new Set(value.filter(isRightToolId))].sort(
    (left, right) => TOOL_ORDER.get(left)! - TOOL_ORDER.get(right)!,
  )
}

export function reconcileRightToolPreferences(value: unknown): RightToolPreferencesV1 {
  if (
    !isRecord(value) ||
    value.schemaVersion !== RIGHT_TOOL_SCHEMA_VERSION ||
    !Array.isArray(value.openToolIds) ||
    (value.activeToolId !== null && typeof value.activeToolId !== 'string')
  ) {
    return createDefaultRightToolPreferences()
  }

  const openToolIds = normalizeRightToolIds(value.openToolIds)
  const activeToolId = openToolIds.includes(value.activeToolId as RightToolId)
    ? (value.activeToolId as RightToolId)
    : (openToolIds[0] ?? null)

  return {
    schemaVersion: RIGHT_TOOL_SCHEMA_VERSION,
    openToolIds,
    activeToolId,
    panelWidth: clampRightToolPanelWidth(value.panelWidth),
  }
}

export function openRightTool(
  preferences: RightToolPreferencesV1,
  toolId: RightToolId,
): RightToolTransition {
  const current = reconcileRightToolPreferences(preferences)
  const openToolIds = normalizeRightToolIds([...current.openToolIds, toolId])

  return transition({ ...current, openToolIds, activeToolId: toolId }, 'expand')
}

export function activateRightTool(
  preferences: RightToolPreferencesV1,
  toolId: RightToolId,
): RightToolTransition {
  const current = reconcileRightToolPreferences(preferences)
  if (!current.openToolIds.includes(toolId)) return transition(current)

  return transition({ ...current, activeToolId: toolId }, 'expand')
}

export function closeRightTool(
  preferences: RightToolPreferencesV1,
  toolId: RightToolId,
): RightToolTransition {
  const current = reconcileRightToolPreferences(preferences)
  const closingIndex = current.openToolIds.indexOf(toolId)
  if (closingIndex < 0) return transition(current)

  const openToolIds = current.openToolIds.filter((id) => id !== toolId)
  if (current.activeToolId !== toolId) {
    return transition({ ...current, openToolIds })
  }

  if (openToolIds.length === 0) {
    return transition({ ...current, openToolIds, activeToolId: null }, 'collapse')
  }

  const activeToolId = openToolIds[closingIndex] ?? openToolIds[closingIndex - 1]
  return transition({ ...current, openToolIds, activeToolId })
}

export function toggleRightToolFromRail(
  preferences: RightToolPreferencesV1,
  toolId: RightToolId,
): RightToolTransition {
  const current = reconcileRightToolPreferences(preferences)
  if (!current.openToolIds.includes(toolId)) return openRightTool(current, toolId)
  if (current.activeToolId !== toolId) return activateRightTool(current, toolId)

  return transition(current, 'toggle')
}

function transition(
  preferences: RightToolPreferencesV1,
  panelCollapseCommand: PanelCollapseCommand = 'none',
): RightToolTransition {
  return { preferences, panelCollapseCommand }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
