import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  applyTerminalNoteLifecycle,
  DRAWER_VIEWS,
  DrawerViewTabs,
  formatNoteAge,
  getDrawerHeight,
  getDrawerPanelAttributes,
  getNextDrawerView,
  shouldRemoveTerminalNotes,
} from '../../../src/renderer/src/components/note/quick-note-behavior'
import { useNoteStore } from '../../../src/renderer/src/stores/note'

describe('Quick Note view behavior', () => {
  it('suppresses only the content editor perimeter focus highlight', () => {
    const css = readFileSync(new URL('../../../src/renderer/src/components/note/QuickNote.module.css', import.meta.url), 'utf8')
    expect(css).toContain('.editor textarea:focus { outline:none; box-shadow:none; }')
    expect(css).not.toMatch(/(?:input|button):focus[^{}]*\{[^}]*outline:\s*none/)
  })

  it('uses restrained radii on the note container, cards, editing surfaces, and controls', () => {
    const css = readFileSync(new URL('../../../src/renderer/src/components/note/QuickNote.module.css', import.meta.url), 'utf8')

    expect(css).toMatch(/\.root \{[^}]*border-radius:6px/)
    expect(css).toMatch(/\.card \{[^}]*border-radius:4px/)
    expect(css).toMatch(/\.toolbar input \{[^}]*border-radius:4px/)
    expect(css).toMatch(/\.editor textarea,\.preview \{[^}]*border-radius:4px/)
    expect(css).toMatch(/\.actions button \{[^}]*border-radius:4px/)
    expect(css).not.toContain('border-radius:999')
  })

  it('keeps export formats in an accessible conditional menu', () => {
    const source = readFileSync(new URL('../../../src/renderer/src/components/note/QuickNote.tsx', import.meta.url), 'utf8')

    expect(source.match(/>Export<\/button>/g)).toHaveLength(1)
    expect(source).toContain('aria-haspopup="menu"')
    expect(source).toContain('aria-expanded={exportOpen}')
    expect(source).toContain('{exportOpen && (')
    expect(source).toContain('role="menu" aria-label="Export format"')
    expect(source).toContain("{ format: 'md', label: 'Markdown (.md)' }")
    expect(source).toContain("{ format: 'txt', label: 'Plain text (.txt)' }")
    expect(source).toContain("{ format: 'html', label: 'HTML (.html)' }")
    expect(source).toContain("if (event.key !== 'Escape') return")
    expect(source).toContain('if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setExportOpen(false)')
  })

  it('uses the specified collapsed, runtime, and note drawer heights', () => {
    expect(getDrawerHeight(false, 'note')).toBe('28px')
    expect(getDrawerHeight(true, 'runtime')).toBe('210px')
    expect(getDrawerHeight(true, 'note')).toBe('380px')
  })

  it('associates the active tab with its panel and uses roving tab focus', () => {
    const markup = renderToStaticMarkup(createElement(
      'div',
      null,
      createElement(DrawerViewTabs, { open: true, activeView: 'note', onSelect: () => {} }),
      ...DRAWER_VIEWS.map((view) => createElement('div', { key: view, ...getDrawerPanelAttributes(view) })),
    ))

    expect(markup).toContain('id="drawer-runtime-tab"')
    expect(markup).toContain('aria-controls="drawer-runtime-panel"')
    expect(markup).toContain('id="drawer-note-tab"')
    expect(markup).toContain('aria-controls="drawer-note-panel"')
    expect(markup).toContain('id="drawer-runtime-panel" role="tabpanel" aria-labelledby="drawer-runtime-tab"')
    expect(markup).toContain('id="drawer-note-panel" role="tabpanel" aria-labelledby="drawer-note-tab"')
    expect(markup).toContain('aria-selected="true" tabindex="0"')
    expect(markup).toContain('aria-selected="false" tabindex="-1"')
  })

  it('does not render drawer tabs while the drawer is collapsed', () => {
    const markup = renderToStaticMarkup(createElement(DrawerViewTabs, {
      open: false,
      activeView: 'runtime',
      onSelect: () => {},
    }))

    expect(markup).toBe('')
  })

  it('reserves header space for tabs only while the drawer is expanded', () => {
    const source = readFileSync(new URL('../../../src/renderer/src/components/TerminalArea.tsx', import.meta.url), 'utf8')
    expect(source).toContain("drawerOpen ? 'pr-32' : 'pr-3'")
  })

  it('supports arrow, Home, and End navigation with wrapping', () => {
    expect(getNextDrawerView('runtime', 'ArrowRight')).toBe('note')
    expect(getNextDrawerView('note', 'ArrowRight')).toBe('runtime')
    expect(getNextDrawerView('runtime', 'ArrowLeft')).toBe('note')
    expect(getNextDrawerView('note', 'ArrowLeft')).toBe('runtime')
    expect(getNextDrawerView('note', 'Home')).toBe('runtime')
    expect(getNextDrawerView('runtime', 'End')).toBe('note')
    expect(getNextDrawerView('runtime', 'Enter')).toBeNull()
  })

  it('clears terminal notes only after the kill/remove branch', () => {
    expect(shouldRemoveTerminalNotes('kill-removed')).toBe(true)
    expect(shouldRemoveTerminalNotes('exit')).toBe(false)
    expect(shouldRemoveTerminalNotes('workspace-switch')).toBe(false)

    useNoteStore.getState().clearAll()
    useNoteStore.getState().addCard('killed')
    useNoteStore.getState().addCard('exited')
    useNoteStore.getState().addCard('switched')
    applyTerminalNoteLifecycle('kill-removed', 'killed')
    applyTerminalNoteLifecycle('exit', 'exited')
    applyTerminalNoteLifecycle('workspace-switch', 'switched')
    expect(useNoteStore.getState().drafts['killed']).toBeUndefined()
    expect(useNoteStore.getState().drafts['exited']).toHaveLength(1)
    expect(useNoteStore.getState().drafts['switched']).toHaveLength(1)
  })

  it('formats card update times for the list metadata', () => {
    const now = Date.UTC(2026, 6, 13, 12)
    expect(formatNoteAge(now - 30_000, now)).toBe('just now')
    expect(formatNoteAge(now - 3 * 60_000, now)).toBe('3m ago')
    expect(formatNoteAge(now - 2 * 60 * 60_000, now)).toBe('2h ago')
    expect(formatNoteAge(now - 3 * 24 * 60 * 60_000, now)).toBe('3d ago')
  })

  it('switches card groups with the active terminal id without deleting either group', () => {
    useNoteStore.getState().clearAll()
    useNoteStore.getState().addCard('terminal-a')
    useNoteStore.getState().addCard('terminal-b')
    expect(useNoteStore.getState().drafts['terminal-a']).toHaveLength(1)
    expect(useNoteStore.getState().drafts['terminal-b']).toHaveLength(1)
  })
})
