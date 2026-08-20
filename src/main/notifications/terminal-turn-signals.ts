const MAX_ERROR_WINDOW = 2_048

const ANSI_CSI = /\x1b\[[0-?]*[ -/]*[@-~]/g
const ANSI_OSC = /\x1b\].*?(?:\x07|\x1b\\)/g
const SERVICE_ERROR_PATTERNS = [
  /\b(?:api\s+error|request\s+failed|request\s+error|unexpected\s+status|http\s+error|status\s+code)\b[^\r\n]{0,96}\b(?:429|503)\b/i,
  /\b(?:429|503)\b[^\r\n]{0,96}\b(?:too\s+many\s+requests|rate[ _-]?limit|service\s+unavailable|temporarily\s+unavailable|overloaded)\b/i,
  /\b(?:error|failed|failure)\b[^\r\n]{0,96}\b(?:rate[ _-]?limit(?:ed|_error)?|service\s+unavailable|server\s+overloaded)\b/i,
]

function plainTerminalText(data: string): string {
  return data.replace(ANSI_OSC, '').replace(ANSI_CSI, '').replace(/\r/g, '\n')
}

export function isTerminalInterrupt(data: string): boolean {
  return data === '\x03'
}

export interface TerminalServiceErrorDetector {
  push(data: string): string | null
  reset(): void
}

/** Detects terminal service failures conservatively across ANSI and PTY chunk boundaries. */
export function createTerminalServiceErrorDetector(): TerminalServiceErrorDetector {
  let window = ''

  return {
    push(data) {
      window = (window + plainTerminalText(data)).slice(-MAX_ERROR_WINDOW)
      const match = SERVICE_ERROR_PATTERNS
        .map((pattern) => window.match(pattern))
        .find((candidate) => candidate !== null)
      if (!match) return null

      const line = window
        .slice(window.lastIndexOf('\n', match.index ?? 0) + 1)
        .split('\n', 1)[0]
        .trim()
      window = ''
      return line || match[0].trim()
    },
    reset() {
      window = ''
    },
  }
}
