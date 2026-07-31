/**
 * Single definition of the `janusx-dark` Monaco theme.
 *
 * All three viewers (code / markdown / html) register a theme under this one name, so whichever
 * mounted last used to win — and they had drifted apart on selection colors. Keeping the colors
 * here means the editor chrome, and in particular the find widget, looks the same whichever
 * viewer opened the file.
 *
 * Colors track the Orca-inspired shell tokens in `globals.css`: widget chrome on
 * `--shell-pane-chrome`, inputs on `--shell-canvas`, and JanusX amber for cursor, focus, active
 * options and match highlights.
 */
export const JANUSX_DARK_THEME_NAME = 'janusx-dark'

/** Monaco wants `#RRGGBB` / `#RRGGBBAA` — `rgba()` strings are ignored. */
export const JANUSX_DARK_THEME = {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#151517',
    'editor.foreground': '#d4d4d4',
    'editor.lineHighlightBackground': '#1c1c1e',
    'editorCursor.foreground': '#ff7830',
    'editor.selectionBackground': '#264f7859',
    'editor.inactiveSelectionBackground': '#264f782e',
    'editorLineNumber.foreground': '#444444',
    'editorLineNumber.activeForeground': '#888888',

    /*-- Find widget / inputs: neutral shell chrome, amber for state --*/
    'editorWidget.background': '#1e1e1f',
    'editorWidget.foreground': '#e0e0e0',
    'editorWidget.border': '#2b2b2e',
    'input.background': '#151517',
    'input.foreground': '#e0e0e0',
    'input.border': '#2b2b2e',
    'focusBorder': '#f47d43',
    'inputOption.activeBackground': '#f47d431f',
    'inputOption.activeBorder': '#f47d436b',
    'inputOption.activeForeground': '#ff9159',
    'toolbar.hoverBackground': '#2b2b2e',
    'editor.findMatchBackground': '#ff783059',
    'editor.findMatchBorder': '#ff7830',
    'editor.findMatchHighlightBackground': '#ff78302e',
  },
} as const

interface MonacoThemeApi {
  editor: {
    defineTheme(name: string, theme: unknown): void
  }
}

export function defineJanusxDarkTheme(monaco: MonacoThemeApi): void {
  monaco.editor.defineTheme(JANUSX_DARK_THEME_NAME, JANUSX_DARK_THEME)
}
