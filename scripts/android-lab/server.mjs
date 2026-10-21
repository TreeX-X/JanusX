import http from 'node:http'
import fs from 'node:fs/promises'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'

/** Local test-only signaling. Application messages cannot be sent via this API. */
export async function startLab({ port = 43820, listen = '127.0.0.1', invite = randomBytes(24).toString('hex'), stun = '' } = {}) {
  if (invite.length < 24) throw new Error('Invitation must have at least 24 characters')
  if (stun && !/^stun:[^\s]+$/.test(stun)) throw new Error('Only STUN is supported')
  const roles = new Map()
  const hostHtml = await fs.readFile(new URL('./host.html', import.meta.url))
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/host') { res.writeHead(404).end(); return }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
    res.end(hostHtml)
  })
  const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 })
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/signal' || wss.clients.size >= 8) { socket.destroy(); return }
    // Browser clients must come from this local host page; native clients have no Origin.
    const origin = req.headers.origin
    if (origin && origin !== `http://127.0.0.1:${server.address().port}`) { socket.destroy(); return }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws))
  })
  wss.on('connection', ws => {
    let role
    let bytes = 0
    let candidates = 0
    const timer = setTimeout(() => ws.close(1008, 'join timeout'), 5000)
    timer.unref()
    ws.on('error', () => {})
    ws.on('message', (raw, binary) => {
      try {
        if (binary || (bytes += raw.length) > 2 * 1024 * 1024) throw new Error('budget')
        const message = JSON.parse(raw.toString())
        if (!role) {
          const presented = Buffer.from(String(message.invite ?? ''))
          const expected = Buffer.from(invite)
          if (message.type !== 'join' || !['host', 'client'].includes(message.role)
            || presented.length !== expected.length || !timingSafeEqual(presented, expected) || roles.has(message.role)) throw new Error('join')
          role = message.role
          roles.set(role, ws)
          clearTimeout(timer)
          ws.send(JSON.stringify({ type: 'joined' }))
          if (roles.size === 2) roles.get('host').send(JSON.stringify({ type: 'peer-ready' }))
          return
        }
        const data = message.data
        if (message.type === 'candidate') {
          if (++candidates > 128 || typeof data?.candidate !== 'string' || data.candidate.length > 4096
            || !/ udp /i.test(data.candidate) || / typ relay(?: |$)/i.test(data.candidate)
            || !Number.isInteger(data.sdpMLineIndex) || typeof data.sdpMid !== 'string') throw new Error('candidate')
        } else if (message.type === (role === 'host' ? 'offer' : 'answer')) {
          if (typeof data?.sdp !== 'string' || data.sdp.length > 100000 || data.type !== message.type) throw new Error('sdp')
        } else throw new Error('type')
        const other = roles.get(role === 'host' ? 'client' : 'host')
        if (!other || other.readyState !== WebSocket.OPEN) throw new Error('peer')
        other.send(JSON.stringify({ type: message.type, data }))
      } catch { ws.close(1008, 'invalid signaling') }
    })
    ws.on('close', () => {
      clearTimeout(timer)
      if (role && roles.get(role) === ws) {
        roles.delete(role)
        for (const other of roles.values()) other.send(JSON.stringify({ type: 'peer-left' }))
      }
    })
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, listen, resolve) })
  return {
    port: server.address().port, invite, stun,
    async close() { for (const ws of wss.clients) ws.terminate(); await new Promise(r => wss.close(r)); await new Promise(r => server.close(r)) },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split(/=(.*)/s)))
  const lab = await startLab({ port: Number(args.port || 43820), listen: args.listen || '127.0.0.1', stun: args.stun || '' })
  const artifactDir = fileURLToPath(new URL('../../artifacts/android-lab/', import.meta.url))
  await fs.mkdir(artifactDir, { recursive: true })
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch({ headless: true, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] })
  const page = await browser.newPage()
  page.on('console', msg => { if (msg.type() === 'error') console.error('Host error:', msg.text()) })
  await page.goto(`http://127.0.0.1:${lab.port}/host`)
  await page.evaluate(config => window.startHost(config), { invite: lab.invite, stun: lab.stun })
  await fs.writeFile(`${artifactDir}/session.json`, JSON.stringify({ port: lab.port, invite: lab.invite, stun: lab.stun }, null, 2))
  console.log(`Local signaling and synthetic desktop ready on port ${lab.port}. Invitation: artifacts/android-lab/session.json`)
  const reportTimer = setInterval(async () => {
    try { await fs.writeFile(`${artifactDir}/host-report.json`, JSON.stringify(await page.evaluate(() => window.report), null, 2)) }
    catch { /* shutdown */ }
  }, 2000)
  let stopping = false
  async function stop() { if (stopping) return; stopping = true; clearInterval(reportTimer); await browser.close(); await lab.close() }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}
