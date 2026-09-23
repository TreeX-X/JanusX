// Note: the Markdown view tab uses the conventional file glyph in components/ui/MarkdownIcon.tsx — see .agents/notes/implemented/feature/2026-09-21-drawer-markdown-file-glyph.md
import { createElement, useRef, type ComponentType, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { Activity } from 'lucide-react'
import { useDraftCardStore } from '../../stores/draft-card'
import tabs from '../ui/TabStrip.module.css'
import { MarkdownIcon, type MarkdownIconProps } from '../ui/MarkdownIcon'

export type DrawerView = 'runtime' | 'note'
export type TerminalLifecycleEvent = 'kill-removed' | 'exit' | 'workspace-switch'

export const DRAWER_VIEWS: readonly DrawerView[] = ['runtime', 'note']

export function getDrawerTabId(view: DrawerView): string {
  return `drawer-${view}-tab`
}

export function getDrawerPanelId(view: DrawerView): string {
  return `drawer-${view}-panel`
}

export function getDrawerPanelAttributes(view: DrawerView) {
  return {
    id: getDrawerPanelId(view),
    role: 'tabpanel' as const,
    'aria-labelledby': getDrawerTabId(view),
  }
}

export function getNextDrawerView(view: DrawerView, key: string): DrawerView | null {
  if (key === 'Home') return DRAWER_VIEWS[0]
  if (key === 'End') return DRAWER_VIEWS.at(-1)!
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null
  const offset = key === 'ArrowRight' ? 1 : -1
  return DRAWER_VIEWS[(DRAWER_VIEWS.indexOf(view) + offset + DRAWER_VIEWS.length) % DRAWER_VIEWS.length]
}

const DRAWER_VIEW_ICONS: Record<DrawerView, ComponentType<MarkdownIconProps>> = { runtime: Activity, note: MarkdownIcon }

export interface DrawerViewTabsProps {
  open: boolean
  activeView: DrawerView
  onSelect: (view: DrawerView) => void
  /** Localized labels; the view id is the fallback so the tabs render without an i18n provider. */
  labels?: Partial<Record<DrawerView, string>>
  ariaLabel?: string
}

// Text tabs with a 2px underline instead of filled chips: no segment carries a background, the selected
// tab brightens its text, takes the accent on its icon and draws the bar on the header's bottom edge.
export function DrawerViewTabs({ open, activeView, onSelect, labels, ariaLabel }: DrawerViewTabsProps) {
  const tabRefs = useRef<Record<DrawerView, HTMLButtonElement | null>>({ runtime: null, note: null })

  if (!open) return null

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, view: DrawerView) => {
    const nextView = getNextDrawerView(view, event.key)
    if (!nextView) return
    event.preventDefault()
    onSelect(nextView)
    tabRefs.current[nextView]?.focus()
  }

  return createElement(
    'div',
    {
      role: 'tablist',
      'aria-label': ariaLabel ?? 'Drawer view',
      className: tabs.strip,
      onClick: (event: ReactMouseEvent<HTMLDivElement>) => event.stopPropagation(),
    },
    DRAWER_VIEWS.map((view) => createElement(
      'button',
      {
        key: view,
        ref: (node: HTMLButtonElement | null): void => { tabRefs.current[view] = node },
        id: getDrawerTabId(view),
        type: 'button',
        role: 'tab',
        'aria-controls': getDrawerPanelId(view),
        'aria-selected': activeView === view,
        tabIndex: activeView === view ? 0 : -1,
        className: tabs.tab,
        onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
          event.stopPropagation()
          onSelect(view)
        },
        onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => handleKeyDown(event, view),
      },
      createElement(DRAWER_VIEW_ICONS[view], { className: tabs.icon, strokeWidth: 1.75, 'aria-hidden': true }),
      createElement('span', null, labels?.[view] ?? view),
    )),
  )
}

// Note: the drawer keeps a per-view user height clamped between a floor and the pane reserve — see .agents/notes/implemented/feature/2026-09-19-runtime-drawer-cards-resize.md
export const DRAWER_COLLAPSED_HEIGHT = 28
export const DRAWER_MIN_HEIGHT = 120
export const DRAWER_MIN_PANE_HEIGHT = 160
export const DRAWER_DEFAULT_HEIGHT: Record<DrawerView, number> = { runtime: 210, note: 380 }

export type DrawerHeights = Partial<Record<DrawerView, number>>

export function clampDrawerHeight(height: number, maximum: number): number {
  const ceiling = Math.max(DRAWER_MIN_HEIGHT, Math.round(maximum))
  return Math.min(ceiling, Math.max(DRAWER_MIN_HEIGHT, Math.round(height)))
}

export function getDrawerHeight(open: boolean, view: DrawerView, heights: DrawerHeights = {}): string {
  if (!open) return `${DRAWER_COLLAPSED_HEIGHT}px`
  return `${heights[view] ?? DRAWER_DEFAULT_HEIGHT[view]}px`
}

export function shouldRemoveTerminalDrafts(event: TerminalLifecycleEvent): boolean {
  return event === 'kill-removed'
}

export function applyTerminalDraftLifecycle(event: TerminalLifecycleEvent, terminalId: string): void {
  if (shouldRemoveTerminalDrafts(event)) useDraftCardStore.getState().removeTerminalDraftGroup(terminalId)
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
