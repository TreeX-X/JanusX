import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'
import WebSocket from 'ws'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

let mf
const sockets = []
const invite = () => randomBytes(24).toString('hex')
const candidate = { type: 'candidate', data: {
  candidate: 'candidate:1 1 udp 123 2001:db8::1 5000 typ host',
  sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'generation2',
} }

function next(ws, event, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(Error(`Missing ${type ?? event}`)), 8000)
    const listener = value => {
      try {
        if (event === 'message') {
          const message = JSON.parse(value.data)
          if (message.type === type) finish(null, message)
        } else finish(null, value)
      } catch (error) { finish(error) }
    }
    function finish(error, value) {
      clearTimeout(timer)
      ws.removeEventListener(event, listener)
      if (error) reject(error)
      else resolve(value)
    }
    ws.addEventListener(event, listener)
  })
}

async function connect() {
  const url = new URL('/signal', await mf.ready)
  url.protocol = 'ws:'
  const ws = new WebSocket(url)
  await once(ws, 'open')
  sockets.push(ws)
  return ws
}

async function join(room, role) {
  const ws = await connect()
  const joined = next(ws, 'message', 'joined')
  ws.send(JSON.stringify({ type: 'join', invite: room, role }))
  await joined
  return ws
}

async function pair() {
  const room = invite()
  const host = await join(room, 'host')
  const ready = next(host, 'message', 'peer-ready')
  const client = await join(room, 'client')
  await ready
  return { room, host, client }
}

before(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({
    name: 'janusx-signal',
    modules: true,
    scriptPath: fileURLToPath(new URL('../.wrangler/test-bundle/worker.js', import.meta.url)),
    compatibilityDate: '2026-10-21',
    durableObjects: { SIGNAL: { className: 'Signaling', useSQLite: true } },
  }))
  await mf.ready
})

after(async () => {
  for (const ws of sockets) {
    ws.terminate()
  }
  await mf?.dispose()
})

test('health and exact WebSocket endpoint', async () => {
  const response = await mf.dispatchFetch('https://signal.test/health')
  assert.equal(await response.text(), 'JanusX signaling\n')
  assert.equal((await mf.dispatchFetch('https://signal.test/signal')).status, 426)
  assert.equal((await mf.dispatchFetch('https://signal.test/other')).status, 404)
  assert.equal((await mf.dispatchFetch('https://signal.test/signal?secret=x')).status, 404)
})

test('existing join protocol forwards signed SDP and IPv6 generation metadata', async () => {
  const { host, client } = await pair()
  for (const [sender, receiver, type] of [[host, client, 'offer'], [client, host, 'answer']]) {
    const message = { type, data: { type, sdp: 'v=0\r\na=ice-ufrag:test\r\n', mac: 'b'.repeat(64), offerUfrag: 'test' } }
    const received = next(receiver, 'message', type)
    sender.send(JSON.stringify(message))
    assert.deepEqual(await received, message)
  }
  const received = next(host, 'message', 'candidate')
  client.send(JSON.stringify(candidate))
  assert.deepEqual(await received, candidate)
})

test('room isolation and hibernation retain role ownership and message budgets', async () => {
  const { room, host, client } = await pair()
  const outsider = await join(invite(), 'client')
  let leaked = false
  outsider.addEventListener('message', () => { leaked = true })
  await mf.unsafeEvictDurableObject('janusx-signal', 'Signaling', { name: 'janusx-signal-v1', webSockets: 'hibernate' })
  const received = next(host, 'message', 'candidate')
  client.send(JSON.stringify(candidate))
  assert.deepEqual(await received, candidate)
  assert.equal(leaked, false)
  const duplicate = await connect()
  const closed = next(duplicate, 'close')
  duplicate.send(JSON.stringify({ type: 'join', invite: room, role: 'host' }))
  assert.equal((await closed).code, 1008)
})

test('close releases the role, notifies its peer, and permits reconnect', async () => {
  const { room, host, client } = await pair()
  const left = next(host, 'message', 'peer-left')
  client.close(1000, 'Reconnect')
  await left
  const ready = next(host, 'message', 'peer-ready')
  await join(room, 'client')
  await ready
})

test('TCP, relay, business, invalid generation, wrong role, binary and oversize frames are rejected', async () => {
  const cases = [
    { ...candidate, data: { ...candidate.data, candidate: candidate.data.candidate.replace(' udp ', ' tcp ') } },
    { ...candidate, data: { ...candidate.data, candidate: candidate.data.candidate.replace('typ host', 'typ relay') } },
    { type: 'input', data: 'terminal content' },
    { ...candidate, data: { ...candidate.data, usernameFragment: 123 } },
    { type: 'offer', data: { type: 'offer', sdp: 'v=0', mac: 'b'.repeat(64) } },
    new Uint8Array([1, 2]).buffer,
    'x'.repeat(128 * 1024 + 1),
  ]
  for (const message of cases) {
    const client = await join(invite(), 'client')
    const closed = next(client, 'close')
    client.send(message instanceof ArrayBuffer || typeof message === 'string' ? message : JSON.stringify(message))
    assert.equal((await closed).code, 1008)
  }
})

test('extra envelope and data fields are not forwarded', async () => {
  const { host, client } = await pair()
  const received = next(host, 'message', 'candidate')
  client.send(JSON.stringify({ ...candidate, secret: 'private', data: { ...candidate.data, token: 'private' } }))
  assert.deepEqual(await received, candidate)
})

test('message count survives hibernation and closes at the budget', async () => {
  const client = await join(invite(), 'client')
  for (let i = 0; i < 100; i++) client.send(JSON.stringify(candidate))
  // Receiving on another socket serializes the preceding events before eviction.
  await join(invite(), 'host')
  await mf.unsafeEvictDurableObject('janusx-signal', 'Signaling', { name: 'janusx-signal-v1', webSockets: 'hibernate' })
  const closed = next(client, 'close')
  for (let i = 0; i < 200; i++) client.send(JSON.stringify(candidate))
  assert.equal((await closed).code, 1008)
})

test('unjoined sockets time out and invalid join messages are rejected', async () => {
  const invalid = await connect()
  const closed = next(invalid, 'close')
  invalid.send(JSON.stringify({ type: 'join', role: 'client', invite: 'short' }))
  assert.equal((await closed).code, 1008)
  const idle = await connect()
  // The close handshake can outlive the deadline; observe the server's explicit
  // rejection rather than requiring the transport to finish closing immediately.
  assert.deepEqual(await next(idle, 'message', 'error'), { type: 'error', message: 'join timeout' })
})
