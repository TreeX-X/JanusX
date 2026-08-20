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

function toOscRgb(color: string): string {
  const hex = color.slice(1)
  return `rgb:${hex.slice(0, 2).repeat(2)}/${hex.slice(2, 4).repeat(2)}/${hex.slice(4, 6).repeat(2)}`
}

const COLOR_QUERY_RESPONSES: Record<string, string> = {
  '10': `\x1b]10;${toOscRgb(TERMINAL_DEFAULT_COLORS.foreground)}\x1b\\`,
  '11': `\x1b]11;${toOscRgb(TERMINAL_DEFAULT_COLORS.background)}\x1b\\`,
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
export function createTerminalColorQueryResponder(): TerminalColorQueryResponder {
  let pending = ''

  return {
    push(data) {
      const input = pending + data
      pending = partialQuerySuffix(input)

      const responses: string[] = []
      for (const match of input.matchAll(/\x1b](10|11);\?(?:\x07|\x1b\\)/g)) {
        responses.push(COLOR_QUERY_RESPONSES[match[1]])
      }
      return responses.join('')
    },
  }
}

export function isDefaultColorQuery(data: string): boolean {
  return data === '?'
}
