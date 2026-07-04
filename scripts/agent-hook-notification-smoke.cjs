const { app, BrowserWindow, Notification } = require('electron')
const { randomBytes } = require('crypto')
const http = require('http')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const token = randomBytes(18).toString('hex')
const smokeSource = process.env.JANUSX_SMOKE_SOURCE || 'codex'
const smokeEvent = process.env.JANUSX_SMOKE_EVENT || 'Stop'
const userDataHooksDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'janusx', 'janusx', 'hooks')
const hookScriptPath =
  process.env.JANUSX_SMOKE_HOOK_SCRIPT ||
  path.join(userDataHooksDir, 'janusx-agent-hook.ps1')
const legacyHookScriptPath = path.join(userDataHooksDir, 'janusx-hook.ps1')

function existingHookScript() {
  const fs = require('fs')
  if (fs.existsSync(hookScriptPath)) return hookScriptPath
  if (fs.existsSync(legacyHookScriptPath)) return legacyHookScriptPath
  throw new Error(`Hook script not found: ${hookScriptPath}`)
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function invokeHook(scriptPath, port) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      JANUSX_HOOK_PORT: String(port),
      JANUSX_HOOK_TOKEN: token,
      JANUSX_HOOK_TERMINAL_ID: 'smoke-terminal',
      JANUSX_HOOK_WORKSPACE_ID: 'smoke-workspace',
      JANUSX_HOOK_ENGINE: smokeSource,
    }
    const command = `& '${scriptPath.replace(/'/g, "''")}' -Source '${smokeSource.replace(/'/g, "''")}' -EventName '${smokeEvent.replace(/'/g, "''")}' -Marker 'janusx-agent-hook-v2'`
    const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      cwd: process.cwd(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('close', (code) => resolve({ code, stdout, stderr }))
    child.stdin.end(JSON.stringify({ session_id: 'smoke', message: `JanusX ${smokeSource} hook smoke test` }))
  })
}

async function main() {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.janusx.app')
  }

  await app.whenReady()

  const window = new BrowserWindow({
    width: 420,
    height: 220,
    show: false,
    webPreferences: {
      contextIsolation: true,
    },
  })
  await window.loadURL('data:text/html,<html><body>JanusX hook smoke</body></html>')

  const hookPath = existingHookScript()
  let payload = null
  let nativeFailed = null
  let nativeShown = false

  const server = http.createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/api/agent-hook') {
      response.writeHead(404)
      response.end()
      return
    }
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401)
      response.end()
      return
    }

    payload = JSON.parse(await readBody(request))
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ ok: true }))

    const notification = new Notification({
      title: 'JanusX hook smoke',
      body: `${payload.source} ${payload.event} received`,
    })
    notification.on('show', () => {
      nativeShown = true
      console.log('NATIVE_NOTIFICATION_SHOW')
    })
    notification.on('failed', (_event, error) => {
      nativeFailed = error
      console.log(`NATIVE_NOTIFICATION_FAILED ${error}`)
    })
    notification.show()
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  console.log(`HOOK_SCRIPT ${hookPath}`)
  console.log(`HOOK_EVENT ${smokeSource}:${smokeEvent}`)
  console.log(`NOTIFICATION_SUPPORTED ${Notification.isSupported()}`)

  const hookResult = await invokeHook(hookPath, port)
  console.log(`HOOK_EXIT ${hookResult.code}`)
  if (hookResult.stderr.trim()) console.log(`HOOK_STDERR ${hookResult.stderr.trim()}`)

  await new Promise((resolve) => setTimeout(resolve, 2500))
  server.close()

  console.log(`BRIDGE_RECEIVED ${payload ? 'yes' : 'no'}`)
  if (payload) {
    console.log(`PAYLOAD ${payload.source}:${payload.event}:${payload.terminalId}:${payload.workspaceId}`)
  }
  console.log(`NATIVE_SHOWN ${nativeShown ? 'yes' : 'no'}`)
  console.log(`NATIVE_FAILED ${nativeFailed || 'no'}`)

  window.destroy()
  app.quit()

  process.exit(payload && !nativeFailed ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  app.quit()
  process.exit(1)
})
