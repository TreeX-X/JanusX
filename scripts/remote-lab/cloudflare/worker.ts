import { DurableObject } from 'cloudflare:workers'
import { parseSignalJoin, parseSignalMessage } from '../../../src/main/remote/signaling-protocol'

type Session = {
  deadline: number
  bytes: number
  count: number
  invite?: string
  role?: 'host' | 'client'
  released?: boolean
}

export default {
  async fetch(request: Request, env: { SIGNAL: DurableObjectNamespace }) {
    const url = new URL(request.url)
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return new Response('JanusX signaling\n', { headers: { 'content-type': 'text/plain' } })
    }
    if (url.pathname !== '/signal' || url.search) return new Response('Not found', { status: 404 })
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }
    // Existing clients join in the first frame, not the URL. A single bounded
    // coordinator preserves that protocol without a second forwarding socket.
    return env.SIGNAL.getByName('janusx-signal-v1').fetch(request)
  },
}

export class Signaling extends DurableObject {
  private joinTimers = new Map<WebSocket, ReturnType<typeof setTimeout>>()

  async fetch() {
    if (this.ctx.getWebSockets().length >= 256) return new Response('Capacity reached', { status: 503 })
    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ deadline: Date.now() + 5000, bytes: 0, count: 0 } satisfies Session)
    // Only pending joins keep the object awake, for at most five seconds.
    // Joined connections have no timers and can hibernate.
    this.joinTimers.set(server, setTimeout(() => {
      this.release(server)
      server.send(JSON.stringify({ type: 'error', message: 'join timeout' }))
      server.close(1008, 'join timeout')
    }, 5000))
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const session = ws.deserializeAttachment() as Session
    if (session.released) return
    try {
      if (typeof raw !== 'string') throw Error('binary')
      const size = new TextEncoder().encode(raw).byteLength
      session.bytes += size
      session.count++
      if (size > 128 * 1024 || session.bytes > 2 * 1024 * 1024 || session.count > 300) throw Error('budget')
      const message = JSON.parse(raw)
      if (!session.invite) {
        if (Date.now() >= session.deadline) throw Error('join timeout')
        const joined = parseSignalJoin(message)
        if (this.members(joined.invite).some(peer => peer.deserializeAttachment().role === joined.role)) throw Error('occupied')
        Object.assign(session, joined)
        ws.serializeAttachment(session)
        this.clearJoinTimer(ws)
        ws.send(JSON.stringify({ type: 'joined' }))
        const members = this.members(joined.invite)
        if (members.length === 2) {
          members.find(peer => peer.deserializeAttachment().role === 'host')!.send(JSON.stringify({ type: 'peer-ready' }))
        }
        return
      }
      const forwarded = parseSignalMessage(message, session.role!)
      ws.serializeAttachment(session)
      for (const other of this.members(session.invite)) {
        if (other !== ws) other.send(JSON.stringify(forwarded))
      }
    } catch {
      this.release(ws)
      ws.close(1008, 'invalid signaling')
    }
  }

  webSocketClose(ws: WebSocket) {
    this.release(ws)
    ws.close(1000, 'Closed')
  }

  webSocketError(ws: WebSocket) {
    this.release(ws)
    ws.close(1011, 'WebSocket error')
  }

  private clearJoinTimer(ws: WebSocket) {
    const timer = this.joinTimers.get(ws)
    if (timer !== undefined) clearTimeout(timer)
    this.joinTimers.delete(ws)
  }

  private members(invite: string): WebSocket[] {
    return this.ctx.getWebSockets().filter(ws => {
      const session = ws.deserializeAttachment() as Session
      return !session.released && session.invite === invite && ws.readyState === WebSocket.OPEN
    })
  }

  private release(ws: WebSocket) {
    this.clearJoinTimer(ws)
    const session = ws.deserializeAttachment() as Session
    if (session.released) return
    session.released = true
    ws.serializeAttachment(session)
    if (session.invite) {
      for (const other of this.members(session.invite)) {
        try { other.send(JSON.stringify({ type: 'peer-left' })) } catch { /* closing peer */ }
      }
    }
  }
}
