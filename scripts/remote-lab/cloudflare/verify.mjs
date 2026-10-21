import assert from 'node:assert/strict'
import { randomBytes, createHmac } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import WebSocket from 'ws'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'

const endpoint = process.argv[2]
if (!endpoint || !/^wss?:\/\//.test(endpoint)) {
  console.error('Usage: npm run verify -- wss://YOUR_WORKER.workers.dev/signal')
  process.exit(1)
}
const health = new URL(endpoint)
health.protocol = health.protocol === 'wss:' ? 'https:' : 'http:'
health.pathname = '/health'
health.search = ''
const sockets = []
const proxy = process.argv.includes('--proxy') ? process.env.HTTPS_PROXY || process.env.https_proxy : undefined
if (process.argv.includes('--proxy') && !proxy) throw Error('--proxy requires HTTPS_PROXY')
const agent = proxy ? new HttpsProxyAgent(proxy) : undefined
const report = { endpoint, checkedAt: new Date().toISOString(), viaProxy: Boolean(proxy), scope: 'HTTPS/WSS signaling from this computer only; no phone or UDP validation', checks: [] }
const invite = randomBytes(24).toString('hex')
const secret = randomBytes(32).toString('hex')

function next(ws, event, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(Error(`Missing ${type ?? event}`)), 15000)
    const onError = error => finish(error)
    const onEvent = (value, ...rest) => {
      try {
        if (event === 'message') {
          const message = JSON.parse(String(value))
          if (message.type === type) finish(null, message)
        } else finish(null, [value, ...rest])
      } catch (error) { finish(error) }
    }
    function finish(error, value) {
      clearTimeout(timer)
      ws.off(event, onEvent)
      ws.off('error', onError)
      if (error) reject(error)
      else resolve(value)
    }
    ws.on(event, onEvent)
    ws.on('error', onError)
  })
}

async function join(role) {
  const ws = new WebSocket(endpoint, { handshakeTimeout: 15000, agent })
  sockets.push(ws)
  await once(ws, 'open')
  const joined = next(ws, 'message', 'joined')
  ws.send(JSON.stringify({ type: 'join', invite, role }))
  await joined
  return ws
}

try {
  const body = await new Promise((resolve, reject) => {
    const request = (health.protocol === 'https:' ? httpsRequest : httpRequest)(health, { agent, signal: AbortSignal.timeout(15000) }, response => {
      let text = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { text += chunk })
      response.on('error', reject)
      response.on('end', () => {
        if (response.statusCode !== 200) reject(Error(`Health HTTP ${response.statusCode}`))
        else resolve(text)
      })
    })
    request.on('error', reject)
    request.end()
  })
  assert.equal(body, 'JanusX signaling\n')
  report.checks.push('HTTPS health and trusted TLS')
  const host = await join('host')
  const ready = next(host, 'message', 'peer-ready')
  const client = await join('client')
  await ready
  report.checks.push('host/client joins and peer-ready')
  for (const [sender, receiver, type] of [[host, client, 'offer'], [client, host, 'answer']]) {
    const sdp = 'v=0\r\na=ice-ufrag:verify\r\n'
    const expected = { type, data: {
      type, sdp, mac: createHmac('sha256', secret).update(`${invite}\n${type}\n${sdp}`).digest('hex'), offerUfrag: 'verify',
    } }
    const received = next(receiver, 'message', type)
    sender.send(JSON.stringify(expected))
    assert.deepEqual(await received, expected)
    report.checks.push(`signed ${type} forwarded unchanged`)
  }
  for (const [sender, receiver] of [[host, client], [client, host]]) {
    const expected = { type: 'candidate', data: {
      candidate: 'candidate:1 1 udp 123 2001:db8::1 5000 typ host', sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'verify',
    } }
    const received = next(receiver, 'message', 'candidate')
    sender.send(JSON.stringify(expected))
    assert.deepEqual(await received, expected)
  }
  report.checks.push('bidirectional IPv6 UDP candidate and generation metadata')
  const pong = next(host, 'pong')
  host.ping('janusx-check')
  assert.equal(String((await pong)[0]), 'janusx-check')
  report.checks.push('WebSocket protocol ping/pong')
  const left = next(host, 'message', 'peer-left')
  const closed = next(client, 'close')
  client.send(JSON.stringify({ type: 'input', data: 'rejection-test' }))
  assert.equal((await closed)[0], 1008)
  await left
  report.checks.push('business message rejection and peer-left')
  const rejoined = next(host, 'message', 'peer-ready')
  await join('client')
  await rejoined
  report.checks.push('released role reconnect')
} catch (error) {
  report.error = String(error)
  process.exitCode = 1
} finally {
  for (const ws of sockets) ws.terminate()
  await mkdir(new URL('./.wrangler/', import.meta.url), { recursive: true })
  await writeFile(new URL(`./.wrangler/public-verification${proxy ? '-proxy' : ''}.json`, import.meta.url), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}
