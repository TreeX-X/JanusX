// Synthetic host model for the relay test bed. It never executes a shell and never touches a real workspace.
// The Nostr signalling, invitation encoding and STUN/TURN validation that used to live here were removed with the
// WebRTC transport; the relay design reuses this membership, dedupe, bounded-replay and output-tracking core.

export const randomId = () => crypto.randomUUID()

// This model deliberately uses synthetic terminals. It never executes a shell.
export class LabHost {
  constructor({ bufferSize = 400, now = Date.now } = {}) {
    this.now = now; this.bufferSize = bufferSize; this.epoch = randomId(); this.members = new Map(); this.results = new Map(); this.frames = []; this.seq = 0; this.terminals = new Map(); this.effectCounts = { start: 0, input: 0, close: 0 }; this.onFrame = () => {}; this.onMember = () => {}
  }
  join(peer) {
    const previous = this.members.get(peer)
    if (previous?.status === 'revoked' || previous?.status === 'rejected') throw new Error('访问已撤销或申请已拒绝；需要新邀请')
    const member = previous ?? { peer, status: 'pending', role: 'member', identity: null, submittedAt: this.now() }
    this.members.set(peer, member); this.onMember(member); return this.view(member)
  }
  identify(peer, identity) {
    const member = this.members.get(peer)
    if (!member || member.status !== 'pending') throw new Error('当前申请不可认证')
    if (!identity || !['github', 'google', 'transport-test'].includes(identity.provider) || typeof identity.subject !== 'string' || !identity.subject) throw new Error('身份无效')
    member.identity = { provider: identity.provider, subject: identity.subject, name: identity.name ?? identity.subject, verifiedAt: this.now() }; this.onMember(member); return this.view(member)
  }
  approve(peer, allowTransportTest = false) {
    const member = this.members.get(peer)
    if (!member || member.status !== 'pending' || !member.identity) throw new Error('先完成登录或明确启用网络测试身份')
    if (member.identity.provider === 'transport-test' && !allowTransportTest) throw new Error('测试身份不能作为真实登录验收')
    member.status = 'active'; member.role = 'member'; this.onMember(member); return this.view(member)
  }
  revoke(peer, rejected = false) {
    const member = this.members.get(peer)
    if (!member) throw new Error('成员不存在')
    member.status = rejected ? 'rejected' : 'revoked'; this.onMember(member)
  }
  view(member) { return { status: member.status, role: member.role, identity: member.identity } }
  replay(after = 0, epoch = this.epoch) {
    const oldest = this.frames[0]?.seq ?? this.seq + 1
    const reset = epoch !== this.epoch || after < oldest - 1 || after > this.seq
    const frames = []; let bytes = 0
    for (const frame of this.frames) {
      if (!reset && frame.seq <= after) continue
      const size = new TextEncoder().encode(JSON.stringify(frame)).length
      if (frames.length && bytes + size > 48000) break
      frames.push(frame); bytes += size
    }
    const nextAfter = frames.at(-1)?.seq ?? this.seq
    return { epoch: this.epoch, reset, reason: reset ? (epoch !== this.epoch ? 'host-generation' : 'buffer-window') : null, latest: this.seq, nextAfter, more: nextAfter < this.seq, frames }
  }
  append(text, terminalId = 'sample') {
    const frame = { epoch: this.epoch, seq: ++this.seq, terminalId, text }
    this.frames.push(frame); if (this.frames.length > this.bufferSize) this.frames.shift()
    this.onFrame(frame); return frame
  }
  request(peer, request) {
    if (!request || typeof request.id !== 'string' || request.id.length > 100 || typeof request.method !== 'string') throw new Error('请求格式无效')
    const member = this.members.get(peer)
    if (request.method === 'join.status') { if (!member) throw new Error('申请不存在'); return this.view(member) }
    if (request.method === 'ping') return { sentAt: request.params?.sentAt, receivedAt: this.now() }
    if (!member || member.status !== 'active') throw new Error('需要拥有者批准；未授权或已撤销')
    if (!['start', 'input', 'close', 'replay', 'terminals'].includes(request.method)) throw new Error('未知操作')
    if (request.method === 'replay') return this.replay(request.params?.after ?? 0, request.params?.epoch ?? this.epoch)
    if (request.method === 'terminals') return [...this.terminals.values()].map(t => ({ ...t }))
    const key = peer + ':' + request.id, fingerprint = JSON.stringify([request.method, request.params ?? {}])
    const cached = this.results.get(key)
    if (cached) { if (cached.fingerprint !== fingerprint) throw new Error('相同请求 ID 的操作内容不同'); return cached.value }
    if (this.results.size >= 2000) throw new Error('本次实验去重记录已满，请结束测试；不会静默丢弃旧请求')
    let value
    if (request.method === 'start') {
      const terminalId = randomId(); this.terminals.set(terminalId, { terminalId, running: true }); this.effectCounts.start++; value = { terminalId, running: true }
    } else {
      const terminal = this.terminals.get(request.params?.terminalId)
      if (!terminal) throw new Error('测试终端不存在')
      if (request.method === 'input') {
        if (!terminal.running) throw new Error('测试终端已结束')
        if (typeof request.params?.text !== 'string' || request.params.text.length > 4000) throw new Error('输入需为不超过 4000 字的文本')
        this.effectCounts.input++; value = { frame: this.append('输入回显：' + request.params.text + '\n', terminal.terminalId) }
      } else { if (terminal.running) this.effectCounts.close++; terminal.running = false; value = { terminalId: terminal.terminalId, running: false } }
    }
    this.results.set(key, { fingerprint, value }); return value
  }
}

export class OutputTracker {
  constructor() { this.epoch = null; this.lastSeq = 0; this.count = 0; this.duplicates = 0; this.gaps = 0; this.resets = 0; this.text = '' }
  accept(frame) {
    if (this.epoch !== frame.epoch) { this.epoch = frame.epoch; this.lastSeq = 0; this.text = '' }
    if (frame.seq <= this.lastSeq) { this.duplicates++; return false }
    if (this.lastSeq && frame.seq > this.lastSeq + 1) { this.gaps++; return false }
    this.lastSeq = frame.seq; this.count++; this.text = (this.text + frame.text).slice(-60000); return true
  }
  applyReplay(value) {
    if (value.reset) { this.resets++; this.epoch = value.epoch; this.lastSeq = Math.max(0, (value.frames[0]?.seq ?? 1) - 1); this.text = '' }
    for (const frame of value.frames) this.accept(frame)
    if (!value.frames.length) { this.epoch = value.epoch; this.lastSeq = value.latest }
  }
}
