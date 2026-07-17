import { app, type Session } from 'electron'
import { mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const OFFICE_FRAME_CSP = "frame-src 'self' http://127.0.0.1:*; object-src 'none'; base-uri 'self'"
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

  const preferredSessionData = join(app.getPath('userData'), 'chromium-session')
  const sessionDataPath = canWriteDirectory(preferredSessionData)
    ? preferredSessionData
    : join(tmpdir(), 'JanusX', 'chromium-session', String(process.pid))
  if (!canWriteDirectory(sessionDataPath)) return
  app.setPath('sessionData', sessionDataPath)
  app.commandLine.appendSwitch('disk-cache-dir', join(sessionDataPath, 'Cache'))
}
