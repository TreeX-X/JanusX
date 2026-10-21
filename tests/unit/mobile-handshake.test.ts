import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'
import { webcrypto } from 'node:crypto'
import { MobileSession } from '../../src/main/remote/mobile-session'

describe('mobile pairing', () => {
  it('preserves Unicode at message boundaries and restores terminal ownership after reconnect', async () => {
    const replies: any[] = []
    const create = vi.fn(async () => ({ pid: 321 }))
    const alive = vi.fn(() => true)
    const session = new MobileSession('workspace', Date.now() + 60000, 'secret', {
      create, input: vi.fn(), keys: vi.fn(), resize: vi.fn(), alive,
      geometry: () => ({ cols: 132, rows: 38 }), replay: () => ({ data: 'history', seq: 5 }),
    }, vi.fn())
    session.connect(message => replies.push(message))
    await session.receive(JSON.stringify({ type: 'hello', secret: 'secret', deviceId: 'android-device-1234', name: 'Android' }))
    session.approve('android-device-1234')
    const token = replies.at(-1).token
    await session.receive(JSON.stringify({ id: 'create-1', method: 'create' }))
    const terminalId = replies.at(-1).value.terminalId
    await session.receive(JSON.stringify({ id: 'sub-1', method: 'subscribe', terminalId }))
    const output = 'a'.repeat(1999) + '😀中文' + '\x1b[2K'.repeat(2000)
    session.output(terminalId, output, 6)
    const packets = replies.filter(m => m.type === 'output')
    expect(packets.map(m => JSON.parse(JSON.stringify(m)).data).join('')).toBe(output)
    expect(packets.every(m => !/[\ud800-\udbff]$/.test(m.data))).toBe(true)
    expect(packets.every(m => Buffer.byteLength(JSON.stringify(m)) <= 16384)).toBe(true)
    expect(packets.at(-1)).toMatchObject({ seq: 6, final: true, cols: 132, rows: 38 })
    session.disconnect(); session.connect(message => replies.push(message))
    await session.receive(JSON.stringify({ type: 'hello', secret: 'secret', token, deviceId: 'android-device-1234', name: 'Android' }))
    expect(replies.at(-1)).toMatchObject({ type: 'approved', terminals: [{ id: terminalId, pid: 321, alive: true }] })
    expect(create).toHaveBeenCalledTimes(1)
    alive.mockReturnValue(false)
    await session.receive(JSON.stringify({ id: 'sub-exited', method: 'subscribe', terminalId }))
    expect(replies.findLast(m => m.type === 'replay-end')).toMatchObject({ alive: false })
  })
  it('rejects unapproved operations, then creates once and streams output after approval', async () => {
    const replies: any[] = []
    const create = vi.fn(async () => ({ pid: 123 }))
    const session = new MobileSession('workspace', Date.now() + 60000, 'secret', {
      create, input: vi.fn(), keys: vi.fn(), resize: vi.fn(), alive: () => true,
      replay: () => ({ data: 'real terminal replay', seq: 1 }),
    }, vi.fn())
    session.connect(message => replies.push(message))
    await session.receive(JSON.stringify({ type: 'hello', secret: 'secret', deviceId: 'android-device-1234', name: 'Android' }))
    expect(session.pending?.name).toBe('Android')
    await session.receive(JSON.stringify({ id: 'blocked', method: 'create' }))
    expect(create).not.toHaveBeenCalled()
    expect(replies.at(-1).type).toBe('error')
    session.approve('android-device-1234')
    expect(replies.at(-1).type).toBe('approved')
    const request = JSON.stringify({ id: 'create-1', method: 'create' })
    await session.receive(request)
    await session.receive(request)
    expect(create).toHaveBeenCalledTimes(1)
    const id = replies.at(-1).value.terminalId
    await session.receive(JSON.stringify({ id: 'sub-1', method: 'subscribe', terminalId: id }))
    session.output(id, 'streamed output', 2)
    expect(replies).toContainEqual({ type: 'replay-data', terminalId: id, data: 'real terminal replay' })
    expect(replies.at(-1)).toMatchObject({ type: 'output', data: 'streamed output', seq: 2 })
    session.revoke('android-device-1234')
    await session.receive(JSON.stringify({ id: 'revoked', method: 'create' }))
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('delivers early hello only after the desktop has verified the UDP path', async () => {
    const messages: any[] = []
    let bridgeCallback: (m: any) => void = () => {}
    let ws: any, pc: any, resolveStats: (value: any) => void = () => {}
    class Socket {
      onmessage: any
      send() {}
      constructor() { ws = this }
    }
    class Peer {
      connectionState = 'connected'
      dc: any = { bufferedAmount: 0 }
      constructor() { pc = this }
      createDataChannel() { return this.dc }
      async createOffer() { return { type: 'offer', sdp: 'test-sdp' } }
      async setLocalDescription() {}
      getStats() { return new Promise(resolve => { resolveStats = resolve }) }
      close() {}
    }
    const source = transformSync(readFileSync('src/renderer/src/remote-host.ts', 'utf8'), { loader: 'ts' }).code
    runInNewContext(source, {
      window: { remoteTransport: { send: (m: any) => messages.push(m), onMessage: (cb: any) => { bridgeCallback = cb } } },
      WebSocket: Socket, RTCPeerConnection: Peer, crypto: webcrypto, TextEncoder, setTimeout, clearTimeout,
    })
    bridgeCallback({ type: 'start', signalUrl: 'ws://localhost', invite: 'a'.repeat(48), secret: 'b'.repeat(64), stun: '' })
    ws.onmessage({ data: JSON.stringify({ type: 'peer-ready' }) })
    await vi.waitFor(() => expect(pc?.dc.onopen).toBeTypeOf('function'))
    const opening = pc.dc.onopen()
    pc.dc.onmessage({ data: '{"type":"hello"}' })
    expect(messages.some(m => m.type === 'message')).toBe(false)
    resolveStats(new Map([
      ['transport', { type: 'transport', selectedCandidatePairId: 'pair' }],
      ['pair', { localCandidateId: 'local', remoteCandidateId: 'remote' }],
      ['local', { protocol: 'udp', candidateType: 'host' }],
      ['remote', { protocol: 'udp', candidateType: 'prflx' }],
    ]))
    await opening
    const delivered = messages.filter(m => ['open', 'message'].includes(m.type))
    expect(delivered).toEqual([{ type: 'open' }, { type: 'message', text: '{"type":"hello"}' }])
  })
})
