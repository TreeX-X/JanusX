import type { AppTheme } from './ipc/theme'
import { getThemeDefinition } from './theme/registry'

const COLOR_QUERY_SEQUENCES = [
  '\x1b]10;?\x07',
  '\x1b]10;?\x1b\\',
  '\x1b]11;?\x07',
  '\x1b]11;?\x1b\\',
] as const

export const TERMINAL_DEFAULT_COLORS = {
  foreground: '#d4d4d4',
  background: '#151517',
} as const

/** planche 纸面前景/背景：正文 ink，底 paper，对齐 design tokens。 */
export const PLANCHE_TERMINAL_COLORS = {
  foreground: '#1C343B',
  background: '#EFE4C5',
} as const

export function getTerminalDefaultColors(theme: AppTheme | unknown): {
  foreground: string
  background: string
} {
  const palette = getThemeDefinition(theme).xterm
  return { foreground: palette.foreground, background: palette.background }
}

/** 全量 palette 唯一来源：theme definition（M1 统一结构）。此处保留同名导出兼容旧引用。 */
export const PLANCHE_XTERM_PALETTE: Record<string, string> = getThemeDefinition('planche').xterm

export const DARK_XTERM_PALETTE: Record<string, string> = getThemeDefinition('dark').xterm

export function getXtermPalette(theme: AppTheme | unknown): Record<string, string> {
  return { ...getThemeDefinition(theme).xterm }
}

function toOscRgb(color: string): string {
  const hex = color.slice(1)
  return `rgb:${hex.slice(0, 2).repeat(2)}/${hex.slice(2, 4).repeat(2)}/${hex.slice(4, 6).repeat(2)}`
}

export interface TerminalColorQueryResponder {
  push(data: string): string
}

function partialQuerySuffix(data: string): string {
  const maxLength = Math.min(
    data.length,
    Math.max(...COLOR_QUERY_SEQUENCES.map((sequence) => sequence.length)) - 1,
  )

  for (let length = maxLength; length > 0; length -= 1) {
    const suffix = data.slice(-length)
    if (COLOR_QUERY_SEQUENCES.some(
      (sequence) => suffix.length < sequence.length && sequence.startsWith(suffix),
    )) {
      return suffix
    }
  }

  return ''
}

/** Answers Codex's startup color probes without waiting for the renderer IPC round trip. */
export function createTerminalColorQueryResponder(
  resolveTheme?: () => AppTheme | unknown,
): TerminalColorQueryResponder {
  let pending = ''

  return {
    push(data) {
      const input = pending + data
      pending = partialQuerySuffix(input)

      const colors = getTerminalDefaultColors(resolveTheme?.())
      const responses: string[] = []
      for (const match of input.matchAll(/\x1b](10|11);\?(?:\x07|\x1b\\)/g)) {
        const color = match[1] === '10' ? colors.foreground : colors.background
        responses.push(`\x1b]${match[1]};${toOscRgb(color)}\x1b\\`)
      }
      return responses.join('')
    },
  }
}

export function isDefaultColorQuery(data: string): boolean {
  return data === '?'
}
