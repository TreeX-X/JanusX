import { createElement, useRef, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { useNoteStore } from '../../stores/note'

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

export function DrawerViewTabs({ open, activeView, onSelect }: { open: boolean; activeView: DrawerView; onSelect: (view: DrawerView) => void }) {
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
      'aria-label': 'Drawer view',
      className: 'absolute right-3 top-1 flex h-5 overflow-hidden border border-[rgba(255,255,255,0.08)] text-[10px]',
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
        className: 'px-2 capitalize',
        style: {
          color: activeView === view ? '#ffb27d' : '#666',
          background: activeView === view ? 'rgba(255,120,48,.1)' : '#101112',
        },
        onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
          event.stopPropagation()
          onSelect(view)
        },
        onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => handleKeyDown(event, view),
      },
      view,
    )),
  )
}

export function getDrawerHeight(open: boolean, view: DrawerView): string {
  if (!open) return '28px'
  return view === 'note' ? '380px' : '210px'
}

export function shouldRemoveTerminalNotes(event: TerminalLifecycleEvent): boolean {
  return event === 'kill-removed'
}

export function applyTerminalNoteLifecycle(event: TerminalLifecycleEvent, terminalId: string): void {
  if (shouldRemoveTerminalNotes(event)) useNoteStore.getState().removeTerminalGroup(terminalId)
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
