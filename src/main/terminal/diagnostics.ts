import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'

function serializeDetails(details: Record<string, unknown> | undefined): string {
  if (!details) return ''
  try {
    return ` ${JSON.stringify(details)}`
  } catch {
    return ' [unserializable details]'
  }
}

export function logTerminalDiagnostic(message: string, details?: Record<string, unknown>): void {
  try {
    const dir = join(app.getPath('userData'), 'janusx', 'logs')
    mkdirSync(dir, { recursive: true })
    appendFileSync(
      join(dir, 'terminal.log'),
      `${new Date().toISOString()} ${message}${serializeDetails(details)}\n`,
      'utf8',
    )
  } catch {
    // Diagnostics must never affect terminal creation.
  }
}
