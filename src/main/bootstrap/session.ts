import { app, type Session } from 'electron'
import { mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { readdir, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const OFFICE_FRAME_CSP = "frame-src 'self' http://127.0.0.1:*; object-src 'none'; base-uri 'self'"
const STALE_HOOK_DIR_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const cspSessions = new WeakSet<Session>()

export function installProductionCsp(session: Session): void {
  if (!app.isPackaged || cspSessions.has(session)) return
  cspSessions.add(session)
  session.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== 'mainFrame' || !details.url.startsWith('file:')) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }
    const responseHeaders = { ...details.responseHeaders }
    for (const header of Object.keys(responseHeaders)) {
      if (header.toLowerCase() === 'content-security-policy') delete responseHeaders[header]
    }
    callback({ responseHeaders: { ...responseHeaders, 'Content-Security-Policy': [OFFICE_FRAME_CSP] } })
  })
}

export function configureApplicationProfile(isHookClient: boolean, argv: string[] = process.argv): void {
  const hasExplicitUserDataDir = argv.some(
    (argument) => argument === '--user-data-dir' || argument.startsWith('--user-data-dir=')
  )
  if (isHookClient || app.isPackaged || hasExplicitUserDataDir) return
  app.setPath('userData', join(app.getPath('appData'), 'JanusX-Dev'))
}

function canWriteDirectory(directory: string): boolean {
  try {
    mkdirSync(directory, { recursive: true })
    const probePath = join(directory, `.janusx-write-test-${process.pid}`)
    writeFileSync(probePath, '')
    unlinkSync(probePath)
    return true
  } catch {
    return false
  }
}

export function configureChromiumSessionPaths(isHookClient: boolean): void {
  if (isHookClient) {
    const hookDataRoot = join(tmpdir(), 'JanusX', 'hook-client', String(process.pid))
    const hookSessionData = join(hookDataRoot, 'session')
    const hookCacheData = join(hookDataRoot, 'Cache')
    if (!canWriteDirectory(hookDataRoot) || !canWriteDirectory(hookSessionData) || !canWriteDirectory(hookCacheData)) return
    app.setPath('userData', hookDataRoot)
    app.setPath('sessionData', hookSessionData)
    app.commandLine.appendSwitch('disk-cache-dir', hookCacheData)
    app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
    app.disableHardwareAcceleration()
    return
  }

  cleanupStaleHookClientDirs()

  const preferredSessionData = join(app.getPath('userData'), 'chromium-session')
  const sessionDataPath = canWriteDirectory(preferredSessionData)
    ? preferredSessionData
    : join(tmpdir(), 'JanusX', 'chromium-session', String(process.pid))
  if (!canWriteDirectory(sessionDataPath)) return
  app.setPath('sessionData', sessionDataPath)
  app.commandLine.appendSwitch('disk-cache-dir', join(sessionDataPath, 'Cache'))
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM means the process exists but we may not signal it.
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

// Fire-and-forget cleanup of leftover per-PID hook-client temp dirs from
// crashed/exited processes. Removes a dir only when its PID is not us and no
// longer running, or when it is older than the age threshold. Failures are
// swallowed so startup is never affected.
export function cleanupStaleHookClientDirs(): void {
  const root = join(tmpdir(), 'JanusX', 'hook-client')
  void (async () => {
    let entries
    try {
      entries = await readdir(root, { withFileTypes: true })
    } catch {
      return
    }
    const now = Date.now()
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dirPath = join(root, entry.name)
      const pid = Number(entry.name)
      let stale = false
      if (Number.isInteger(pid) && pid > 0) {
        stale = pid !== process.pid && !isProcessAlive(pid)
      }
      if (!stale) {
        try {
          stale = now - (await stat(dirPath)).mtimeMs > STALE_HOOK_DIR_MAX_AGE_MS
        } catch {
          continue
        }
      }
      if (stale) {
        await rm(dirPath, { recursive: true, force: true }).catch(() => {})
      }
    }
  })()
}
