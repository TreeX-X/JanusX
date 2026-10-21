import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { startLab } from './server.mjs'

async function connect(lab, role, invite = lab.invite) {
  const ws = new WebSocket(`ws://127.0.0.1:${lab.port}/signal`)
  await once(ws, 'open')
  const response = once(ws, invite === lab.invite ? 'message' : 'close')
  ws.send(JSON.stringify({ type: 'join', role, invite }))
  await response
  return ws
}
test('rejects invalid invitations without consuming the client slot', async () => {
  const lab = await startLab({ port: 0 })
  try {
    const bad = await connect(lab, 'client', 'wrong')
    assert.equal(bad.readyState, WebSocket.CLOSED)
    const valid = await connect(lab, 'client')
    assert.equal(valid.readyState, WebSocket.OPEN)
  } finally { await lab.close() }
})
test('exchanges SDP but refuses business payload and relay candidates', async () => {
  const lab = await startLab({ port: 0 })
  try {
    const host = await connect(lab, 'host')
    const client = await connect(lab, 'client')
    const received = once(client, 'message')
    host.send(JSON.stringify({ type: 'offer', data: { type: 'offer', sdp: 'v=0\r\n' } }))
    assert.equal(JSON.parse((await received)[0].toString()).type, 'offer')
    const closed = once(client, 'close')
    client.send(JSON.stringify({ type: 'execute', data: { command: 'not-allowed' } }))
    assert.equal((await closed)[0], 1008)
    const next = await connect(lab, 'client')
    const relayClosed = once(next, 'close')
    next.send(JSON.stringify({ type: 'candidate', data: { candidate: 'candidate:1 1 udp 1 1.2.3.4 123 typ relay', sdpMid: '0', sdpMLineIndex: 0 } }))
    assert.equal((await relayClosed)[0], 1008)
  } finally { await lab.close() }
})
