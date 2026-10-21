import { describe, expect, it } from 'vitest'
import { once } from 'node:events'
import WebSocket from 'ws'
import { startSignaling } from '../../src/main/remote/signaling'

const invite = 'a'.repeat(48)
const candidate = { candidate: 'candidate:1 1 udp 123 2001:db8::1 5000 typ host', sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'phone2' }
async function join(port: number, role: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/signal`)
  await once(ws, 'open')
  const joined = once(ws, 'message')
  ws.send(JSON.stringify({ type: 'join', role, invite }))
  expect(JSON.parse(String((await joined)[0])).type).toBe('joined')
  return ws
}

describe('production SDP/ICE signaling', () => {
  it('forwards generation credentials and IPv6 UDP candidates without altering them', async () => {
    const server = await startSignaling(0)
    try {
      const host = await join(server.port, 'host')
      const ready = once(host, 'message')
      const client = await join(server.port, 'client')
      expect(JSON.parse(String((await ready)[0])).type).toBe('peer-ready')
      const received = once(host, 'message')
      client.send(JSON.stringify({ type: 'candidate', data: candidate }))
      expect(JSON.parse(String((await received)[0]))).toEqual({ type: 'candidate', data: candidate })
      const answer = { type: 'answer', sdp: 'v=0\r\na=ice-ufrag:phone2\r\n', mac: 'b'.repeat(64), offerUfrag: 'host2' }
      const answered = once(host, 'message')
      client.send(JSON.stringify({ type: 'answer', data: answer }))
      expect(JSON.parse(String((await answered)[0])).data).toEqual(answer)
    } finally { await server.close() }
  })

  it.each([
    { type: 'candidate', data: { ...candidate, candidate: candidate.candidate.replace(' udp ', ' tcp ') } },
    { type: 'candidate', data: { ...candidate, candidate: candidate.candidate.replace('typ host', 'typ relay') } },
    { type: 'candidate', data: { ...candidate, usernameFragment: 123 } },
    { type: 'answer', data: { type: 'answer', sdp: 'v=0', mac: 'b'.repeat(64), offerUfrag: 'x'.repeat(257) } },
    { type: 'input', data: { text: 'terminal content' } },
  ])('rejects forbidden paths, malformed generations or business messages: %#', async message => {
    const server = await startSignaling(0)
    try {
      const client = await join(server.port, 'client')
      const closed = once(client, 'close')
      client.send(JSON.stringify(message))
      expect((await closed)[0]).toBe(1008)
    } finally { await server.close() }
  })
})
