// Isolated hidden renderer: owns only WebRTC and signaling, never terminal privileges.
type Bridge = { send(message: unknown): void; onMessage(callback: (message: any) => void): void }
const bridge = (window as unknown as { remoteTransport: Bridge }).remoteTransport
let socket: WebSocket, peer: RTCPeerConnection | undefined, channel: RTCDataChannel | undefined
let config: { signalUrl: string; invite: string; secret: string; stun: string }
let pending: RTCIceCandidateInit[] = [], queue: string[] = [], queued = 0
let retry: ReturnType<typeof setTimeout> | undefined
let verified = false, incoming: string[] = []
let deferredOffer = false
let deadline: ReturnType<typeof setTimeout> | undefined
const reportStatus = (text: string) => bridge.send({ type: 'status', text })
const signal = (type: string, data: unknown) => { if (socket.readyState === 1) socket.send(JSON.stringify({ type, data })) }
const udp = (c: string) => / udp /i.test(c) && !/ typ relay(?: |$)/i.test(c)
async function mac(type: string, sdp: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(config.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const result = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${config.invite}\n${type}\n${sdp}`))
  return [...new Uint8Array(result)].map(n => n.toString(16).padStart(2, '0')).join('')
}
function closePeer(reoffer = false) {
  clearTimeout(deadline)
  const restart = reoffer && deferredOffer && socket.readyState === 1
  deferredOffer = false
  const old = peer; peer = undefined; channel = undefined; pending = []; queue = []; queued = 0
  verified = false; incoming = []
  if (old) { old.onconnectionstatechange = null; old.close(); bridge.send({ type: 'close' }) }
  if (restart) void offer().catch(error => { closePeer(); reportStatus(String(error)) })
}
function drain() {
  const dc = channel
  if (dc?.readyState !== 'open') return
  while (queue.length && dc.bufferedAmount < 128 * 1024) {
    const data = queue.shift()!; queued -= data.length
    try { dc.send(data) } catch { closePeer(); return }
  }
}
async function offer(round = 1, previous = '') {
  if (verified && channel?.readyState === 'open') { deferredOffer = true; return }
  closePeer()
  const pc = new RTCPeerConnection({ iceServers: config.stun ? [{ urls: config.stun }] : [], iceTransportPolicy: 'all' })
  peer = pc
  let localCandidates = 0, mappedCandidates = 0, remoteCandidates = 0, rejectedCandidates = 0
  let descriptionSent = false, recovering = false
  const outgoing: RTCIceCandidateInit[] = []
  async function failAttempt(reason: string) {
    if (peer !== pc || recovering) return
    recovering = true
    let checks = ''
    try {
      const stats = await pc.getStats()
      let pairs = 0, requests = 0, responses = 0, succeeded = 0
      stats.forEach(s => {
        if (s.type !== 'candidate-pair') return
        pairs++; requests += s.requestsSent ?? 0; responses += s.responsesReceived ?? 0
        if (s.state === 'succeeded') succeeded++
      })
      checks = `；候选对 ${pairs} / 检查 ${requests} / 应答 ${responses} / 成功 ${succeeded}`
    } catch { checks = '；路径统计暂不可用' }
    if (peer !== pc || channel?.readyState === 'open') return
    const detail = `${reason}；本地 ${localCandidates} / STUN ${mappedCandidates} / 对端已应用 ${remoteCandidates} / 拒绝 ${rejectedCandidates}${checks}`
    closePeer()
    if (round < 3 && socket.readyState === 1) {
      try { await offer(round + 1, detail) }
      catch { closePeer(); reportStatus('UDP 重新协商失败，请重新连接') }
    } else reportStatus(`UDP 直连 ${round}/3 轮未成功：${detail}；请保留两端诊断，检查网络路径`)
  }
  async function addCandidate(c: RTCIceCandidateInit) {
    if (peer !== pc) return
    const remoteUfrag = pc.remoteDescription?.sdp.match(/a=ice-ufrag:([^\r\n]+)/)?.[1]
    if (c.usernameFragment && remoteUfrag && c.usernameFragment !== remoteUfrag) return
    const embedded = c.candidate?.match(/(?:^| )ufrag ([^ ]+)/)?.[1]
    if (embedded && remoteUfrag && embedded !== remoteUfrag) return
    try { await pc.addIceCandidate(c); if (peer === pc) remoteCandidates++ }
    catch { if (peer === pc) { rejectedCandidates++; reportStatus(`对端 UDP 候选应用失败 ${rejectedCandidates}；继续检查其他路径`) } }
  }
  // Scope candidate application to this peer, including asynchronous SDP callbacks.
  applyCandidate = addCandidate
  pc.onicecandidate = e => {
    if (peer !== pc) return
    if (e.candidate && udp(e.candidate.candidate)) {
      localCandidates++
      if (/ typ srflx(?: |$)/i.test(e.candidate.candidate)) mappedCandidates++
      const c = e.candidate.toJSON()
      c.usernameFragment ||= pc.localDescription?.sdp.match(/a=ice-ufrag:([^\r\n]+)/)?.[1]
      if (descriptionSent) signal('candidate', c)
      else if (outgoing.length < 128) outgoing.push(c)
    } else if (!e.candidate && !verified) reportStatus(`ICE 本地 UDP 候选 ${localCandidates}，STUN 映射 ${mappedCandidates}；等待双方路径检查`)
  }
  pc.onicecandidateerror = e => { if (peer === pc && !verified) reportStatus(`STUN 请求异常 (${e.errorCode})；检查 STUN 可达性，其他候选仍会尝试`) }
  pc.oniceconnectionstatechange = () => {
    if (peer !== pc || pc.iceConnectionState !== 'failed') return
    if (!verified) void failAttempt('ICE 路径检查失败')
    else { closePeer(true); reportStatus('UDP 连接已中断，请重连恢复终端') }
  }
  pc.onconnectionstatechange = () => {
    if (peer !== pc) return
    if (pc.connectionState === 'failed') {
      if (!verified) void failAttempt('WebRTC 连接失败')
      else { closePeer(true); reportStatus('UDP 连接已中断，请重连恢复终端') }
      return
    }
    reportStatus(`P2P ${pc.connectionState}`)
    if (pc.connectionState === 'closed') closePeer(true)
  }
  const dc = pc.createDataChannel('janusx-terminal-v1', { ordered: true })
  channel = dc; dc.bufferedAmountLowThreshold = 64 * 1024
  dc.onbufferedamountlow = drain
  dc.onopen = async () => {
    if (peer !== pc) return
    clearTimeout(deadline)
    let udpVerified = false
    // Chromium can publish the selected pair after DataChannel.onopen.
    // Keep early messages queued until path verification completes.
    try {
      for (let attempt = 0; attempt < 20 && peer === pc; attempt++) {
        const stats = await pc.getStats()
        stats.forEach(t => {
          if (t.type !== 'transport' || !t.selectedCandidatePairId) return
          const pair = stats.get(t.selectedCandidatePairId), local = stats.get(pair?.localCandidateId), remote = stats.get(pair?.remoteCandidateId)
          if (local?.protocol === 'udp' && remote?.protocol === 'udp' && local.candidateType !== 'relay' && remote.candidateType !== 'relay') udpVerified = true
        })
        if (udpVerified || peer !== pc) break
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    } catch { /* Fail closed below if stats cannot establish the permitted path. */ }
    if (peer !== pc) return
    if (!udpVerified) { closePeer(); reportStatus('未确认 UDP 直连，已拒绝；可重连重试'); return }
    bridge.send({ type: 'open' }); reportStatus('UDP 直连 · 无业务中继')
    verified = true
    for (const text of incoming) bridge.send({ type: 'message', text })
    incoming = []
  }
  dc.onclose = () => {
    if (peer !== pc) return
    if (!verified) void failAttempt('数据通道建连中断')
    else closePeer(true)
  }
  dc.onmessage = event => {
    if (peer !== pc || typeof event.data !== 'string' || new TextEncoder().encode(event.data).length > 16384) return
    if (verified) bridge.send({ type: 'message', text: event.data })
    else if (incoming.length < 8) incoming.push(event.data)
    else { reportStatus('配对前消息过多，已断开'); closePeer() }
  }
  const description = await pc.createOffer()
  if (peer !== pc) return
  await pc.setLocalDescription(description)
  const signature = await mac('offer', description.sdp!)
  if (peer !== pc) return
  signal('offer', { type: 'offer', sdp: description.sdp, mac: signature })
  descriptionSent = true
  for (const c of outgoing) signal('candidate', c)
  outgoing.length = 0
  reportStatus(`UDP 直连第 ${round}/3 轮，已发送协商邀请，等待手机应答${previous ? `（上轮：${previous}）` : ''}`)
  deadline = setTimeout(() => { if (!verified) void failAttempt('本轮等待超时') }, 20000)
}
let applyCandidate: (c: RTCIceCandidateInit) => Promise<void>
function connectSignal() {
  socket = new WebSocket(config.signalUrl)
  const current = socket
  socket.onopen = () => current.send(JSON.stringify({ type: 'join', role: 'host', invite: config.invite }))
  let processing = Promise.resolve()
  socket.onmessage = event => {
    processing = processing.then(async () => {
      if (socket !== current) return
      const m = JSON.parse(event.data)
      if (m.type === 'joined' && !verified) reportStatus('信令已就绪，等待手机连接')
      if (m.type === 'peer-ready') await offer()
      if (m.type === 'peer-left') {
        closePeer(); reportStatus('手机已离开信令，请在手机重新连接')
      }
      if (m.type === 'answer' && peer) {
        const pc = peer
        if (m.data.mac !== await mac('answer', m.data.sdp)) throw Error('手机协商签名无效')
        if (peer !== pc) return
        const localUfrag = pc.localDescription?.sdp.match(/a=ice-ufrag:([^\r\n]+)/)?.[1]
        if (m.data.offerUfrag && m.data.offerUfrag !== localUfrag) return
        try { await pc.setRemoteDescription({ type: 'answer', sdp: m.data.sdp }) }
        catch (error) { if (peer !== pc) return; throw error }
        if (peer !== pc) return
        reportStatus('手机签名已验证，正在建立 UDP 直连')
        const candidates = pending; pending = []
        const apply = applyCandidate
        for (const c of candidates) await apply(c)
      }
      if (m.type === 'candidate' && peer && udp(m.data.candidate)) {
        if (peer.remoteDescription) await applyCandidate(m.data)
        else if (pending.length < 128) pending.push(m.data)
      }
    }).catch(error => { closePeer(); reportStatus(String(error)) })
  }
  socket.onclose = () => {
    if (socket !== current) return
    if (!verified) reportStatus('信令断开，正在重试；异网需使用双方可访问的公网 wss:// 地址')
    retry = setTimeout(connectSignal, 3000)
  }
  socket.onerror = () => { if (socket === current && !verified) reportStatus('信令不可达；请检查公网地址、DNS、TLS 和网络（局域网地址无法供蜂窝网络访问）') }
}
bridge.onMessage(m => {
  if (m.type === 'start') { config = m; clearTimeout(retry); connectSignal() }
  if (m.type === 'send' && channel?.readyState === 'open') {
    const text = JSON.stringify(m.data)
    if (queued + text.length > 2 * 1024 * 1024) { reportStatus('手机接收过慢，请重连恢复输出'); closePeer(); return }
    queue.push(text); queued += text.length; drain()
  }
})
