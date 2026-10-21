// Isolated hidden renderer: owns only WebRTC and signaling, never terminal privileges.
type Bridge = { send(message: unknown): void; onMessage(callback: (message: any) => void): void }
const bridge = (window as unknown as { remoteTransport: Bridge }).remoteTransport
let socket: WebSocket, peer: RTCPeerConnection | undefined, channel: RTCDataChannel | undefined
let config: { signalUrl: string; invite: string; secret: string; stun: string }
let pending: RTCIceCandidateInit[] = [], queue: string[] = [], queued = 0
let retry: ReturnType<typeof setTimeout> | undefined
let verified = false, incoming: string[] = []
const reportStatus = (text: string) => bridge.send({ type: 'status', text })
const signal = (type: string, data: unknown) => socket.send(JSON.stringify({ type, data }))
const udp = (c: string) => / udp /i.test(c) && !/ typ relay(?: |$)/i.test(c)
async function mac(type: string, sdp: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(config.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const result = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${config.invite}\n${type}\n${sdp}`))
  return [...new Uint8Array(result)].map(n => n.toString(16).padStart(2, '0')).join('')
}
function closePeer() {
  const old = peer; peer = undefined; channel = undefined; pending = []; queue = []; queued = 0
  verified = false; incoming = []
  if (old) { old.onconnectionstatechange = null; old.close(); bridge.send({ type: 'close' }) }
}
function drain() {
  const dc = channel
  if (dc?.readyState !== 'open') return
  while (queue.length && dc.bufferedAmount < 128 * 1024) {
    const data = queue.shift()!; queued -= data.length
    try { dc.send(data) } catch { closePeer(); return }
  }
}
async function offer() {
  closePeer()
  const pc = new RTCPeerConnection({ iceServers: config.stun ? [{ urls: config.stun }] : [], iceTransportPolicy: 'all' })
  peer = pc
  pc.onicecandidate = e => { if (peer === pc && e.candidate && udp(e.candidate.candidate)) signal('candidate', e.candidate.toJSON()) }
  pc.onconnectionstatechange = () => {
    if (peer !== pc) return
    reportStatus(`P2P ${pc.connectionState}`)
    if (['failed', 'closed'].includes(pc.connectionState)) closePeer()
  }
  const dc = pc.createDataChannel('janusx-terminal-v1', { ordered: true })
  channel = dc; dc.bufferedAmountLowThreshold = 64 * 1024
  dc.onbufferedamountlow = drain
  dc.onopen = async () => {
    if (peer !== pc) return
    const stats = await pc.getStats()
    let udpVerified = false
    stats.forEach(t => {
      if (t.type !== 'transport' || !t.selectedCandidatePairId) return
      const pair = stats.get(t.selectedCandidatePairId), local = stats.get(pair?.localCandidateId), remote = stats.get(pair?.remoteCandidateId)
      if (local?.protocol === 'udp' && remote?.protocol === 'udp' && local.candidateType !== 'relay' && remote.candidateType !== 'relay') udpVerified = true
    })
    if (peer !== pc) return
    if (!udpVerified) { reportStatus('未确认 UDP 直连，已拒绝'); closePeer(); return }
    bridge.send({ type: 'open' }); reportStatus('UDP 直连 · 无业务中继')
    verified = true
    for (const text of incoming) bridge.send({ type: 'message', text })
    incoming = []
  }
  dc.onclose = () => { if (peer === pc) closePeer() }
  dc.onmessage = event => {
    if (peer !== pc || typeof event.data !== 'string' || new TextEncoder().encode(event.data).length > 16384) return
    if (verified) bridge.send({ type: 'message', text: event.data })
    else if (incoming.length < 8) incoming.push(event.data)
    else { reportStatus('配对前消息过多，已断开'); closePeer() }
  }
  const description = await pc.createOffer()
  if (peer !== pc) return
  await pc.setLocalDescription(description)
  signal('offer', { type: 'offer', sdp: description.sdp, mac: await mac('offer', description.sdp!) })
  reportStatus('已发送协商邀请，等待手机应答')
}
function connectSignal() {
  socket = new WebSocket(config.signalUrl)
  const current = socket
  socket.onopen = () => current.send(JSON.stringify({ type: 'join', role: 'host', invite: config.invite }))
  let processing = Promise.resolve()
  socket.onmessage = event => {
    processing = processing.then(async () => {
      if (socket !== current) return
      const m = JSON.parse(event.data)
      if (m.type === 'joined') reportStatus('信令已就绪，等待手机连接')
      if (m.type === 'peer-ready') await offer()
      if (m.type === 'peer-left') closePeer()
      if (m.type === 'answer' && peer) {
        if (m.data.mac !== await mac('answer', m.data.sdp)) throw Error('手机协商签名无效')
        await peer.setRemoteDescription({ type: 'answer', sdp: m.data.sdp })
        reportStatus('手机签名已验证，正在建立 UDP 直连')
        for (const c of pending) await peer.addIceCandidate(c)
        pending = []
      }
      if (m.type === 'candidate' && peer && udp(m.data.candidate)) {
        if (peer.remoteDescription) await peer.addIceCandidate(m.data)
        else if (pending.length < 128) pending.push(m.data)
      }
    }).catch(error => { reportStatus(String(error)); closePeer() })
  }
  socket.onclose = () => { reportStatus('信令断开，正在重试'); retry = setTimeout(connectSignal, 3000) }
  socket.onerror = () => reportStatus('信令不可达，请检查地址和网络')
}
bridge.onMessage(m => {
  if (m.type === 'start') { config = m; clearTimeout(retry); connectSignal() }
  if (m.type === 'send' && channel?.readyState === 'open') {
    const text = JSON.stringify(m.data)
    if (queued + text.length > 2 * 1024 * 1024) { reportStatus('手机接收过慢，请重连恢复输出'); closePeer(); return }
    queue.push(text); queued += text.length; drain()
  }
})
