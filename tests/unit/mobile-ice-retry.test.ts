import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'
import { createHmac, webcrypto } from 'node:crypto'

const invite = 'a'.repeat(48), secret = 'b'.repeat(64)
const candidate = (ufrag: string) => ({ candidate: `candidate:1 1 udp 123 192.0.2.1 5000 typ host ufrag ${ufrag}`, sdpMid: '0', sdpMLineIndex: 0, usernameFragment: ufrag })
function harness() {
  const sent: any[] = [], reports: any[] = [], peers: any[] = []
  const timers = new Map<number, () => void>()
  let nextTimer = 0, callback: (m: any) => void, socket: any
  class Socket {
    readyState = 1
    onmessage: any
    constructor() { socket = this }
    send(text: string) { sent.push(JSON.parse(text)) }
  }
  class Peer {
    dc: any = { readyState: 'connecting', bufferedAmount: 0 }
    localDescription: any
    remoteDescription: any
    iceConnectionState = 'checking'
    connectionState = 'connecting'
    onicecandidate: any
    oniceconnectionstatechange: any
    applied: any[] = []
    closed = false
    id = peers.length + 1
    constructor() { peers.push(this) }
    createDataChannel() { return this.dc }
    async createOffer() { return { type: 'offer', sdp: `v=0\r\na=ice-ufrag:host${this.id}\r\n` } }
    async setLocalDescription(sdp: any) {
      this.localDescription = sdp
      this.onicecandidate({ candidate: { candidate: candidate(`host${this.id}`).candidate, toJSON: () => candidate(`host${this.id}`) } })
    }
    async setRemoteDescription(sdp: any) { this.remoteDescription = sdp }
    async addIceCandidate(c: any) {
      if (c.candidate.includes('invalid')) throw Error('candidate rejected')
      this.applied.push(c)
    }
    async getStats() { return new Map([['pair', { type: 'candidate-pair', requestsSent: 5, responsesReceived: 0, state: 'in-progress' }]]) }
    close() { this.closed = true }
  }
  runInNewContext(transformSync(readFileSync('src/renderer/src/remote-host.ts', 'utf8'), { loader: 'ts' }).code, {
    window: { remoteTransport: { send: (m: any) => reports.push(m), onMessage: (cb: any) => { callback = cb } } },
    WebSocket: Socket, RTCPeerConnection: Peer, crypto: webcrypto, TextEncoder,
    setTimeout: (cb: () => void, ms: number) => {
      if (ms < 12000) return setTimeout(cb, 1)
      timers.set(++nextTimer, cb); return nextTimer
    },
    clearTimeout: (timer: any) => typeof timer === 'number' ? timers.delete(timer) : clearTimeout(timer),
  })
  const receive = (type: string, data?: any) => socket.onmessage({ data: JSON.stringify({ type, data }) })
  callback!({ type: 'start', signalUrl: 'ws://localhost', invite, secret, stun: '' })
  const answer = (generation: number) => {
    const sdp = `v=0\r\na=ice-ufrag:phone${generation}\r\n`
    return { type: 'answer', sdp, offerUfrag: `host${generation}`, mac: createHmac('sha256', secret).update(`${invite}\nanswer\n${sdp}`).digest('hex') }
  }
  const waitRound = async (n: number) => vi.waitFor(() => expect(sent.filter(m => m.type === 'offer')).toHaveLength(n))
  return { sent, reports, peers, timers, receive, answer, waitRound }
}

describe('UDP direct negotiation recovery', () => {
  it('sends SDP before candidates, retries failed ICE, and ignores stale callbacks/credentials', async () => {
    const h = harness()
    h.receive('peer-ready'); await h.waitRound(1)
    expect(h.sent.map(m => m.type)).toEqual(['offer', 'candidate'])
    const old = h.peers[0]
    old.iceConnectionState = 'failed'; old.oniceconnectionstatechange()
    old.dc.onclose() // Native state callbacks can race the asynchronous stats read.
    await h.waitRound(2)
    expect(old.closed).toBe(true)
    expect(h.reports.some(m => m.text?.includes('检查 5 / 应答 0'))).toBe(true)
    old.onicecandidate({ candidate: { candidate: candidate('host1').candidate, toJSON: () => candidate('host1') } })
    old.oniceconnectionstatechange()
    h.receive('answer', h.answer(1))
    h.receive('answer', h.answer(2))
    await vi.waitFor(() => expect(h.peers[1].remoteDescription?.sdp).toContain('phone2'))
    h.receive('candidate', candidate('phone1'))
    h.receive('candidate', { ...candidate('phone2'), candidate: 'invalid udp candidate' })
    h.receive('candidate', candidate('phone2'))
    await vi.waitFor(() => expect(h.peers[1].applied).toHaveLength(1))
    expect(h.peers).toHaveLength(2)
    expect(h.peers[1].closed).toBe(false)
    expect(h.sent.filter(m => m.type === 'candidate').map(m => m.data.usernameFragment)).toEqual(['host1', 'host2'])
    expect(h.reports.some(m => m.text?.includes('候选应用失败 1'))).toBe(true)
    h.receive('peer-left')
    await vi.waitFor(() => expect(h.timers.size).toBe(0))
  })

  it('retries stalled negotiation at most three times and cancels deadlines on departure', async () => {
    const h = harness()
    h.receive('peer-ready'); await h.waitRound(1)
    for (const round of [2, 3]) {
      expect(h.timers.size).toBe(1)
      h.timers.values().next().value!()
      await h.waitRound(round)
    }
    h.timers.values().next().value!()
    await vi.waitFor(() => expect(h.reports.at(-1)?.text).toContain('3/3 轮未成功'))
    expect(h.peers).toHaveLength(3)
    expect(h.peers.every(p => p.closed)).toBe(true)
    expect(h.timers.size).toBe(0)
    h.receive('peer-ready'); await h.waitRound(4)
    h.receive('peer-left')
    await vi.waitFor(() => expect(h.timers.size).toBe(0))
  })

  it('does not close the replacement peer when an old SDP operation rejects late', async () => {
    const h = harness()
    h.receive('peer-ready'); await h.waitRound(1)
    const old = h.peers[0]
    let rejectOld: (error: Error) => void
    old.setRemoteDescription = () => new Promise((_resolve, reject) => { rejectOld = reject })
    h.receive('answer', h.answer(1))
    await vi.waitFor(() => expect(rejectOld).toBeTypeOf('function'))
    old.iceConnectionState = 'failed'; old.oniceconnectionstatechange()
    await h.waitRound(2)
    rejectOld!(Error('old peer closed during remote SDP'))
    h.receive('answer', h.answer(2))
    await vi.waitFor(() => expect(h.peers[1].remoteDescription?.sdp).toContain('phone2'))
    expect(h.peers[1].closed).toBe(false)
    h.receive('peer-left')
    await vi.waitFor(() => expect(h.timers.size).toBe(0))
  })
})
