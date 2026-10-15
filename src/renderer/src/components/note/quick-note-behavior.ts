// Note: the Markdown editor moved out of this drawer into its own workspace pane — see .agents/notes/workbench/markdown-pane-entry.md
import { useDraftCardStore } from '../../stores/draft-card'

export type TerminalLifecycleEvent = 'kill-removed' | 'exit' | 'workspace-switch'

/** The drawer carries only the runtime monitor now; the Markdown editor is a workspace pane. */
export const RUNTIME_DRAWER_VIEW = 'runtime' as const

export function getDrawerPanelId(): string {
  return 'drawer-runtime-panel'
}

// Note: the drawer keeps a per-view user height clamped between a floor and the pane reserve — see .agents/notes/workbench/runtime-drawer-cards-resize.md
export const DRAWER_COLLAPSED_HEIGHT = 28
export const DRAWER_MIN_HEIGHT = 120
export const DRAWER_MIN_PANE_HEIGHT = 160
export const DRAWER_DEFAULT_HEIGHT = 320

export function clampDrawerHeight(height: number, maximum: number): number {
  const ceiling = Math.max(DRAWER_MIN_HEIGHT, Math.round(maximum))
  return Math.min(ceiling, Math.max(DRAWER_MIN_HEIGHT, Math.round(height)))
}

export function getDrawerHeight(open: boolean, height?: number): string {
  if (!open) return `${DRAWER_COLLAPSED_HEIGHT}px`
  return `${height ?? DRAWER_DEFAULT_HEIGHT}px`
}

export function shouldRemoveTerminalDrafts(_event: TerminalLifecycleEvent): boolean {
  // 草稿归属已从终端改为工作区/全局作用域：结束终端只是关闭呈现，
  // 文稿另有独立的删除动作，不再随终端生命周期消失。
  return false
}

export function applyTerminalDraftLifecycle(event: TerminalLifecycleEvent, _terminalId: string): void {
  // 保留调用点以维持 TerminalArea 的生命周期接线形状，但草稿不再随终端消失。
  if (shouldRemoveTerminalDrafts(event)) useDraftCardStore.getState().clearAll()
}

export function formatNoteAge(updatedAt: number, now = Date.now()): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - updatedAt) / 1000))
  if (elapsedSeconds < 60) return 'just now'
  const elapsedMinutes = Math.floor(elapsedSeconds / 60)
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours}h ago`
  return `${Math.floor(elapsedHours / 24)}d ago`
}
