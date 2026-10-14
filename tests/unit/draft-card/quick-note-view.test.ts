import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  applyTerminalDraftLifecycle,
  clampDrawerHeight,
  DRAWER_DEFAULT_HEIGHT,
  DRAWER_MIN_HEIGHT,
  formatNoteAge,
  getDrawerHeight,
  getDrawerPanelId,
  shouldRemoveTerminalDrafts,
} from '../../../src/renderer/src/components/note/quick-note-behavior'
import { getDraftsByScope, useDraftCardStore } from '../../../src/renderer/src/stores/draft-card'

describe('Quick Note view behavior', () => {
  it('suppresses only the content editor perimeter focus highlight', () => {
    const css = readFileSync(new URL('../../../src/renderer/src/components/note/QuickNote.module.css', import.meta.url), 'utf8')
    expect(css).toContain('.editor textarea:focus { outline:none; box-shadow:none; }')
    expect(css).not.toMatch(/(?:input|button):focus[^{}]*\{[^}]*outline:\s*none/)
  })

  it('uses restrained radii on the note container, cards, editing surfaces, and controls', () => {
    const css = readFileSync(new URL('../../../src/renderer/src/components/note/QuickNote.module.css', import.meta.url), 'utf8')

    expect(css).toMatch(/\.root \{[^}]*border-radius: ?6px/)
    expect(css).toMatch(/\.card \{[^}]*border-radius: ?4px/)
    expect(css).toMatch(/\.title \{[^}]*border-radius: ?4px/)
    expect(css).toMatch(/\.editor textarea,\s*\.preview \{[^}]*border-radius: ?4px/)
    expect(css).toMatch(/\.actions button \{[^}]*border-radius: ?4px/)
    expect(css).toMatch(/\.tool \{[^}]*border-radius: ?4px/)
    expect(css).not.toMatch(/border-radius: ?999/)
  })

  it('keeps export formats in an accessible conditional menu', () => {
    const source = readFileSync(new URL('../../../src/renderer/src/components/note/QuickNote.tsx', import.meta.url), 'utf8')

    expect(source.match(/aria-haspopup="menu"/g)).toHaveLength(1)
    expect(source).toContain("{t('terminal:note.export')}")
    expect(source).toContain('aria-expanded={exportOpen}')
    expect(source).toContain('{exportOpen && (')
    expect(source).toContain('role="menu" aria-label="Export format"')
    expect(source).toContain("{ format: 'md', label: 'Markdown (.md)' }")
    expect(source).toContain("{ format: 'txt', label: 'Plain text (.txt)' }")
    expect(source).toContain("{ format: 'html', label: 'HTML (.html)' }")
    expect(source).toContain("if (event.key !== 'Escape') return")
    expect(source).toContain('if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setExportOpen(false)')
  })

  it('reads drafts by scope rather than by terminal', () => {
    const source = readFileSync(new URL('../../../src/renderer/src/components/note/QuickNote.tsx', import.meta.url), 'utf8')
    expect(source).toContain('getDraftsByScope(state, scopeId)')
    expect(source).toContain('state.activeDraftIdByScope[scopeId]')
    expect(source).not.toContain('terminalId={')
    // 没有终端时"粘贴到终端"整个按钮不渲染，而不是留一个必然后患的空调用。
    expect(source).toContain('{onPasteToTerminal && (')
  })

  it('uses the specified collapsed and runtime drawer heights', () => {
    expect(getDrawerHeight(false)).toBe('28px')
    expect(getDrawerHeight(true)).toBe(`${DRAWER_DEFAULT_HEIGHT}px`)
    expect(getDrawerHeight(true, 300)).toBe('300px')
  })

  it('clamps a user height between the floor and the pane reserve', () => {
    expect(clampDrawerHeight(40, 500)).toBe(DRAWER_MIN_HEIGHT)
    expect(clampDrawerHeight(900, 500)).toBe(500)
    expect(clampDrawerHeight(333.6, 500)).toBe(334)
    expect(clampDrawerHeight(300, 50)).toBe(DRAWER_MIN_HEIGHT)
  })

  it('gives the single runtime drawer panel a stable id', () => {
    expect(getDrawerPanelId()).toBe('drawer-runtime-panel')
  })

  it('keeps the drawer to the runtime monitor after the Markdown move', () => {
    const source = readFileSync(new URL('../../../src/renderer/src/components/TerminalArea.tsx', import.meta.url), 'utf8')
    expect(source).not.toContain('DrawerViewTabs')
    expect(source).not.toContain('setDrawerView')
    expect(source).toContain('id={getDrawerPanelId()}')
    expect(source).toContain('hidden={!drawerOpen}')
    expect(source).toContain('height: getDrawerHeight(drawerOpen, drawerHeight)')
  })

  it('reserves header space for the drawer handle only while the drawer is expanded', () => {
    const source = readFileSync(new URL('../../../src/renderer/src/components/TerminalArea.tsx', import.meta.url), 'utf8')
    expect(source).toContain("drawerOpen ? 'pr-52' : 'pr-3'")
  })

  it('keeps the production terminal tree mounted independently from drawer state', () => {
    const source = readFileSync(new URL('../../../src/renderer/src/components/TerminalArea.tsx', import.meta.url), 'utf8')
    const leafStart = source.indexOf('function LeafPane(')
    const terminalAreaStart = source.indexOf('export function TerminalArea()')
    const leafSource = source.slice(leafStart, terminalAreaStart)
    const terminalAreaSource = source.slice(terminalAreaStart)
    const liveTreeNodeIndex = terminalAreaSource.indexOf('node={surface.paneTree}')
    const liveTreeIndex = terminalAreaSource.lastIndexOf('<PaneTreeView', liveTreeNodeIndex)
    const workspaceSurfaceIndex = terminalAreaSource.indexOf('workspaceSurfaces.map((surface) => {')
    const drawerIndex = terminalAreaSource.indexOf('className="relative flex-shrink-0 overflow-hidden transition-[height,background,border-color]"')

    expect(leafStart).toBeGreaterThanOrEqual(0)
    expect(workspaceSurfaceIndex).toBeGreaterThanOrEqual(0)
    expect(liveTreeIndex).toBeGreaterThanOrEqual(0)
    expect(drawerIndex).toBeGreaterThan(liveTreeIndex)
    expect(leafSource).toContain('{leaf.tabs.map((tab) => {')
    expect(leafSource).toContain('key={tab.id}')
    expect(leafSource).toContain('<CLITerminal')
    expect(leafSource).not.toContain('drawerOpen')
    expect(leafSource).not.toContain('drawerView')
    expect(terminalAreaSource).toContain("display: workspaceVisible ? 'block' : 'none'")
    expect(terminalAreaSource).toContain("...(!workspaceVisible ? { inert: '' } : {})")
    // 无项目时活动 surface 的宿主是全局哨兵，可见性按哨兵判。
    expect(terminalAreaSource).toContain('surface.workspaceId === GLOBAL_PANE_SCOPE')
  })

  it('keeps drafts through every terminal lifecycle event', () => {
    // 草稿归属已改为工作区/全局作用域：结束终端只是关闭呈现。
    expect(shouldRemoveTerminalDrafts('kill-removed')).toBe(false)
    expect(shouldRemoveTerminalDrafts('exit')).toBe(false)
    expect(shouldRemoveTerminalDrafts('workspace-switch')).toBe(false)

    useDraftCardStore.getState().clearAll()
    useDraftCardStore.getState().addDraft('workspace-1', 'killed')
    useDraftCardStore.getState().addDraft('workspace-1', 'exited')
    useDraftCardStore.getState().addDraft('workspace-1', 'switched')
    applyTerminalDraftLifecycle('kill-removed', 'killed')
    applyTerminalDraftLifecycle('exit', 'exited')
    applyTerminalDraftLifecycle('workspace-switch', 'switched')
    expect(getDraftsByScope(useDraftCardStore.getState(), 'workspace-1')).toHaveLength(3)
  })

  it('formats draft update times for the list metadata', () => {
    const now = Date.UTC(2026, 6, 13, 12)
    expect(formatNoteAge(now - 30_000, now)).toBe('just now')
    expect(formatNoteAge(now - 3 * 60_000, now)).toBe('3m ago')
    expect(formatNoteAge(now - 2 * 60 * 60_000, now)).toBe('2h ago')
    expect(formatNoteAge(now - 3 * 24 * 60 * 60_000, now)).toBe('3d ago')
  })

  it('groups drafts by scope so two terminals in one workspace share a list', () => {
    useDraftCardStore.getState().clearAll()
    useDraftCardStore.getState().addDraft('workspace-1', 'terminal-a')
    useDraftCardStore.getState().addDraft('workspace-1', 'terminal-b')
    expect(getDraftsByScope(useDraftCardStore.getState(), 'workspace-1')).toHaveLength(2)
    expect(useDraftCardStore.getState().drafts['terminal-a']).toBeUndefined()
  })
})
