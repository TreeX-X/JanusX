import http from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'

/** SDP/ICE only. No pairing secret, credential or terminal traffic. */
export async function startSignaling(port = 43821, listen = '127.0.0.1') {
  const rooms = new Map<string, Map<string, WebSocket>>()
  const server = http.createServer((_req, res) => res.writeHead(200, { 'content-type': 'text/plain' }).end('JanusX signaling\n'))
  const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 })
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/signal' || wss.clients.size >= 256) { socket.destroy(); return }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws))
  })
  wss.on('connection', ws => {
    let room: string | undefined, role: string | undefined, bytes = 0, count = 0
    const timeout = setTimeout(() => ws.close(1008, 'join timeout'), 5000)
    ws.on('error', () => {})
    ws.on('message', (raw, binary) => {
      try {
        if (binary || (bytes += Buffer.byteLength(raw.toString())) > 2 * 1024 * 1024 || ++count > 300) throw Error('budget')
        const m = JSON.parse(raw.toString())
        if (!room) {
          if (m.type !== 'join' || !/^[a-f0-9]{48}$/.test(m.invite) || !['host', 'client'].includes(m.role)) throw Error('join')
          const slots = rooms.get(m.invite) ?? new Map<string, WebSocket>()
          if (slots.has(m.role)) throw Error('occupied')
          room = m.invite; role = m.role
          slots.set(role!, ws); rooms.set(room!, slots); clearTimeout(timeout)
          ws.send(JSON.stringify({ type: 'joined' }))
          if (slots.size === 2) slots.get('host')!.send(JSON.stringify({ type: 'peer-ready' }))
          return
        }
        const d = m.data
        if (m.type === 'candidate') {
          if (typeof d?.candidate !== 'string' || d.candidate.length > 4096 || !/ udp /i.test(d.candidate)
            || / typ relay(?: |$)/i.test(d.candidate) || !Number.isInteger(d.sdpMLineIndex) || typeof d.sdpMid !== 'string') throw Error('candidate')
        } else if (m.type === (role === 'host' ? 'offer' : 'answer')) {
          if (d?.type !== m.type || typeof d.sdp !== 'string' || d.sdp.length > 100000 || !/^[a-f0-9]{64}$/.test(d.mac)) throw Error('sdp')
        } else throw Error('only SDP/ICE allowed')
        const other = rooms.get(room)?.get(role === 'host' ? 'client' : 'host')
        if (other?.readyState === WebSocket.OPEN) other.send(JSON.stringify({ type: m.type, data: d }))
      } catch { ws.close(1008, 'invalid signaling') }
    })
    ws.on('close', () => {
      clearTimeout(timeout)
      const slots = room ? rooms.get(room) : undefined
      if (slots?.get(role!) !== ws) return
      slots.delete(role!)
      for (const other of slots.values()) other.send(JSON.stringify({ type: 'peer-left' }))
      if (!slots.size) rooms.delete(room!)
    })
  })
  const alive = new WeakSet<WebSocket>()
  wss.on('connection', ws => { alive.add(ws); ws.on('pong', () => alive.add(ws)) })
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) { if (!alive.has(ws)) ws.terminate(); else { alive.delete(ws); ws.ping() } }
  }, 15000)
  heartbeat.unref()
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, listen, resolve) })
  return {
    port: (server.address() as { port: number }).port,
    async close() {
      clearInterval(heartbeat)
      for (const ws of wss.clients) ws.terminate()
      await new Promise<void>(r => wss.close(() => r()))
      await new Promise<void>(r => server.close(() => r()))
    },
  }
}
