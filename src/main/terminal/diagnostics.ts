import { app } from 'electron'
import { appendFileSync, mkdirSync, renameSync, rmSync, statSync, truncateSync } from 'fs'
import { join } from 'path'

const MAX_LOG_BYTES = 5 * 1024 * 1024

function rotateIfNeeded(filePath: string): void {
  try {
    if (statSync(filePath).size < MAX_LOG_BYTES) return
  } catch {
    return
  }
  const oldPath = `${filePath}.old`
  try {
    rmSync(oldPath, { force: true })
    renameSync(filePath, oldPath)
  } catch {
    try {
      truncateSync(filePath, 0)
    } catch {
      // Rotation is best-effort; keep appending if it fails.
    }
  }
}

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
    const logPath = join(dir, 'terminal.log')
    rotateIfNeeded(logPath)
    appendFileSync(
      logPath,
      `${new Date().toISOString()} ${message}${serializeDetails(details)}\n`,
      'utf8',
    )
  } catch {
    // Diagnostics must never affect terminal creation.
  }
}
