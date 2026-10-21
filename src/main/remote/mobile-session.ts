import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
export interface MobileTerminalPorts {
  create(id: string, workspaceId: string): Promise<{ pid: number }>
  input(id: string, text: string): void
  keys(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  replay(id: string): { data: string; seq: number } | null
  alive(id: string): boolean
}
type Device = { id: string; name: string; token: string }
type Request = { id: string; method: string; terminalId?: string; text?: string; key?: string; cols?: number; rows?: number }
const equal = (a: string, b: string) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/** One desktop activation. Authorization and dedupe survive network disconnects. */
export class MobileSession {
  readonly devices = new Map<string, Device>()
  pending?: { id: string; name: string }
  private device?: Device
  private send: (message: unknown) => void = () => {}
  private readonly terminals = new Map<string, { owner: string; pid: number }>()
  private readonly requests = new Map<string, { body: string; result: Promise<unknown> }>()
  private subscribed?: string
  constructor(readonly workspaceId: string, readonly expiresAt: number, private pairingSecret: string, private ports: MobileTerminalPorts, private changed: () => void) {}
  connect(send: (message: unknown) => void): void { this.disconnect(); this.send = send }
  disconnect(): void { this.device = undefined; this.pending = undefined; this.subscribed = undefined; this.send = () => {}; this.changed() }
  approve(id: string): void {
    if (this.pending?.id !== id || Date.now() > this.expiresAt) throw Error('配对申请已过期，请重新开启远程')
    const device = { ...this.pending, token: randomBytes(32).toString('hex') }
    this.devices.set(id, device); this.device = device; this.pending = undefined
    this.welcome(); this.changed()
  }
  reject(): void { this.pending = undefined; this.send({ type: 'rejected', message: '电脑拒绝了配对' }); this.changed() }
  revoke(id: string): void {
    this.devices.delete(id)
    if (this.device?.id === id) { this.send({ type: 'revoked' }); this.device = undefined; this.subscribed = undefined }
    if (this.pending?.id === id) this.pending = undefined
    this.changed()
  }
  private welcome(): void {
    this.send({ type: 'approved', token: this.device!.token, workspaceId: this.workspaceId,
      terminals: [...this.terminals].filter(([, t]) => t.owner === this.device!.id).map(([id, t]) => ({ id, pid: t.pid, alive: this.ports.alive(id) })) })
  }
  async receive(raw: string): Promise<void> {
    try {
      if (Buffer.byteLength(raw) > 16384) throw Error('消息过大')
      const m = JSON.parse(raw)
      if (m.type === 'hello') {
        if (this.device || this.pending) throw Error('已经申请配对')
        if (typeof m.secret !== 'string' || !equal(m.secret, this.pairingSecret) || typeof m.deviceId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(m.deviceId) || typeof m.name !== 'string') throw Error('配对密钥无效')
        const known = this.devices.get(m.deviceId)
        if (known) {
          if (typeof m.token !== 'string' || !equal(m.token, known.token)) throw Error('设备凭据无效')
          this.device = known; this.welcome(); this.changed(); return
        }
        if (Date.now() > this.expiresAt || this.devices.size >= 8) throw Error('二维码已过期或设备数已满，请电脑重新开启远程')
        this.pending = { id: m.deviceId, name: m.name.slice(0, 80) }
        this.send({ type: 'pending' }); this.changed(); return
      }
      if (!this.device) throw Error('尚未获得电脑授权')
      if (typeof m.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(m.id)) throw Error('请求 ID 无效')
      const owner = this.device.id, key = `${owner}:${m.id}`, body = JSON.stringify(m)
      let entry = this.requests.get(key)
      if (entry && entry.body !== body) throw Error('请求 ID 已用于其他操作')
      if (!entry) {
        if (this.requests.size >= 10000) throw Error('本次远程操作数已达上限，请重新开启')
        const result = Promise.resolve().then(() => {
          if (!this.devices.has(owner)) throw Error('设备授权已撤销')
          return this.execute(m, owner)
        }).then(value => ({ type: 'result', id: m.id, ok: true, value }), error => ({ type: 'result', id: m.id, ok: false, error: error instanceof Error ? error.message : String(error) }))
        entry = { body, result }; this.requests.set(key, entry)
      }
      const reply = await entry.result
      if (this.device?.id === owner) this.send(reply)
    } catch (error) { this.send({ type: 'error', message: error instanceof Error ? error.message : String(error) }) }
  }
  private async execute(m: Request, owner: string): Promise<unknown> {
    if (m.method === 'create') {
      if ([...this.terminals.values()].filter(t => t.owner === owner).length >= 8) throw Error('最多创建 8 个远程终端')
      const id = randomUUID()
      this.terminals.set(id, { owner, pid: 0 })
      try {
        const { pid } = await this.ports.create(id, this.workspaceId)
        this.terminals.set(id, { owner, pid }); return { terminalId: id, pid }
      } catch (error) { this.terminals.delete(id); throw error }
    }
    const id = m.terminalId
    if (!id || this.terminals.get(id)?.owner !== owner) throw Error('终端不属于此设备')
    if (!this.ports.alive(id)) throw Error('终端进程已退出')
    if (m.method === 'subscribe') {
      this.subscribed = id
      const replay = this.ports.replay(id)
      if (!replay) throw Error('终端已不可用')
      this.send({ type: 'replay-start', terminalId: id, seq: replay.seq, truncated: replay.data.length >= 1000000 })
      for (let i = 0; i < replay.data.length; i += 4000) this.send({ type: 'replay-data', terminalId: id, data: replay.data.slice(i, i + 4000) })
      this.send({ type: 'replay-end', terminalId: id, seq: replay.seq })
      return { terminalId: id, seq: replay.seq }
    }
    if (m.method === 'input') {
      if (typeof m.text !== 'string' || !m.text.trim() || m.text.length > 4000 || /[\x00-\x08\x0b-\x1f\x7f]/.test(m.text)) throw Error('请输入最多 4000 字的文本')
      this.ports.input(id, m.text); return { accepted: true }
    }
    if (m.method === 'key') {
      const keys: Record<string, string> = { enter: '\r', interrupt: '\x03', escape: '\x1b', tab: '\t', up: '\x1b[A', down: '\x1b[B' }
      if (!m.key || !keys[m.key]) throw Error('不支持的按键')
      this.ports.keys(id, keys[m.key]); return { accepted: true }
    }
    if (m.method === 'resize') {
      if (!Number.isInteger(m.cols) || !Number.isInteger(m.rows) || m.cols! < 20 || m.cols! > 300 || m.rows! < 5 || m.rows! > 150) throw Error('终端尺寸无效')
      this.ports.resize(id, m.cols!, m.rows!); return { accepted: true }
    }
    throw Error('未知操作')
  }
  output(id: string, data: string, seq: number): void {
    if (this.subscribed !== id || !this.device) return
    for (let i = 0; i < data.length; i += 4000) this.send({ type: 'output', terminalId: id, data: data.slice(i, i + 4000), seq, final: i + 4000 >= data.length })
  }
  exited(id: string, exitCode: number): void {
    if (this.subscribed === id && this.device) this.send({ type: 'exit', terminalId: id, exitCode })
  }
}
