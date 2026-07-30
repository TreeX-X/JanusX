import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  defineJanusxDarkTheme,
  JANUSX_DARK_THEME,
  JANUSX_DARK_THEME_NAME,
} from '../../src/renderer/src/lib/monaco-theme'

const readSource = (relativePath: string) =>
  readFileSync(resolve(__dirname, '../../src/renderer/src', relativePath), 'utf8')

const VIEWERS = [
  'components/viewers/MonacoViewer.tsx',
  'components/viewers/MarkdownViewer.tsx',
  'components/viewers/HtmlViewer.tsx',
]

describe('monaco theme', () => {
  it('registers under the shared name', () => {
    const defineTheme = vi.fn()
    defineJanusxDarkTheme({ editor: { defineTheme } })

    expect(defineTheme).toHaveBeenCalledWith(JANUSX_DARK_THEME_NAME, JANUSX_DARK_THEME)
  })

  it('uses hex colors only — Monaco silently drops rgba() strings', () => {
    for (const [key, value] of Object.entries(JANUSX_DARK_THEME.colors)) {
      expect(value, key).toMatch(/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i)
    }
  })

  it('themes the find widget so its chrome is not left at vs-dark defaults', () => {
    const colors = JANUSX_DARK_THEME.colors as Record<string, string>

    expect(colors['editorWidget.background']).toBeDefined()
    expect(colors['input.background']).toBeDefined()
    expect(colors['inputOption.activeBorder']).toBeDefined()
    expect(colors['editor.findMatchBackground']).toBeDefined()
  })

  it('is defined in exactly one place — every viewer delegates to it', () => {
    for (const viewer of VIEWERS) {
      const source = readSource(viewer)
      expect(source, viewer).toContain('defineJanusxDarkTheme(monaco)')
      expect(source, viewer).not.toContain('monaco.editor.defineTheme(')
      expect(source, viewer).toContain('theme={JANUSX_DARK_THEME_NAME}')
    }
  })
})

describe('find widget hit-testing (globals.css)', () => {
  const css = readFileSync(
    resolve(__dirname, '../../src/renderer/src/styles/globals.css'),
    'utf8',
  )

  it('keeps the option toggles in the hit-test layer, not just the buttons', () => {
    expect(css).toContain('.monaco-editor .find-widget .monaco-custom-toggle')
    expect(css).toContain('.monaco-editor .find-widget .monaco-findInput > .controls')
  })

  it('drops transient hover labels out of hit-testing at the top of the overlay chain', () => {
    // The overlay is .context-view > .workbench-hover-container > .monaco-hover. Neutralizing only
    // the inner hover leaves the positioned .context-view wrapper intercepting clicks, which is
    // what kept the close button and option toggles unclickable. pointer-events inherits, so the
    // rule belongs on the wrapper.
    expect(css).toContain(
      '.context-view:has(> .workbench-hover-container:not(.locked))',
    )
    expect(css).toMatch(
      /\.context-view:has\(> \.workbench-hover-container:not\(\.locked\)\) \{\s*visibility: hidden !important;\s*pointer-events: none !important;/,
    )
  })

  it('hides the label with visibility, not display, so Monaco can still measure it', () => {
    expect(css).not.toMatch(
      /\.context-view:has\(> \.workbench-hover-container:not\(\.locked\)\) \{\s*display: none/,
    )
  })

  it('centers the close button in the same 25px row as the other actions', () => {
    expect(css).toContain('top: calc(3px + (25px - 22px) / 2)')
  })
})

/**
 * The hover fix above is CSS against Monaco's internal DOM, so it can only stay correct while that
 * DOM keeps its shape. These assertions read the installed Monaco and fail loudly on upgrade if any
 * link in the chain is renamed — cheaper than rediscovering the flicker by hand.
 */
describe('monaco hover overlay contract (pins the DOM the fix relies on)', () => {
  const monacoVs = resolve(__dirname, '../../node_modules/monaco-editor/esm/vs')
  const readMonaco = (relativePath: string) =>
    readFileSync(resolve(monacoVs, relativePath), 'utf8')

  it('renders hovers into a ContextView classed .context-view', () => {
    expect(readMonaco('platform/hover/browser/hoverService.js')).toContain('showContextView')
    expect(readMonaco('base/browser/ui/contextview/contextview.js')).toContain("$('.context-view')")
  })

  it('wraps the hover in .workbench-hover-container and toggles .locked on it', () => {
    const hoverWidget = readMonaco('platform/hover/browser/hoverWidget.js')

    expect(hoverWidget).toContain('workbench-hover-container')
    expect(hoverWidget).toContain("classList.toggle('locked'")
  })

  it('still resets pointer-events on .context-view.fixed, so !important stays required', () => {
    expect(readMonaco('base/browser/ui/contextview/contextview.css')).toMatch(
      /\.context-view\.fixed \{\s*all: initial;/,
    )
  })

  it('never re-enables pointer-events inside the hover subtree', () => {
    // If Monaco ever sets pointer-events: auto on a hover descendant, inheritance no longer covers
    // the whole subtree and the single root rule stops being sufficient.
    for (const file of [
      'platform/hover/browser/hover.css',
      'base/browser/ui/hover/hoverWidget.css',
    ]) {
      expect(readMonaco(file), file).not.toMatch(/pointer-events:\s*auto/)
    }
  })

  it('keeps the find controls on the class names the hit-test rule lists', () => {
    expect(readMonaco('base/browser/ui/toggle/toggle.js')).toContain("'monaco-custom-toggle'")
    expect(readMonaco('base/browser/ui/findinput/findInput.css')).toContain(
      '.monaco-findInput > .controls',
    )
    expect(readMonaco('editor/contrib/find/browser/findWidget.css')).toContain(
      '.button.codicon-widget-close',
    )
  })
})
