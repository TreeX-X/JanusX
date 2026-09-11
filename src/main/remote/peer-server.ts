/**
 * @file 被控端 HTTPS 服务（ToB 双机 LAN 远控）
 * @description 把同一进程的 `RemoteHost` 包装成局域网 HTTPS 接口 + mDNS 广播：
 *              配对/鉴权/网关语义全部复用 host（无账号不连、逐调用重验会话），
 *              本模块只做传输（TLS 终止、JSON 路由、mDNS `_janusx-remote._tcp`）。
 *              默认关闭，由用户显式开启；公网 Relay（M5）只换传输，不动路由语义。
 */

import { createServer, type Server } from 'https'
import type { IncomingMessage, ServerResponse } from 'http'
import { networkInterfaces } from 'os'
import { Bonjour, type Service } from 'bonjour-service'
import type { CompanionCommand } from '../companion/contracts'
import { TeamError } from '../team/service'
import { loadOrCreatePeerCert, type PeerCert } from './cert'
import type { RemoteHost } from './host'
import type { LocalViewPorts } from './view-ports'

export const PEER_SERVICE_TYPE = 'janusx-remote'
export const PEER_PROTOCOL_VERSION = 1
/** JSON 请求体上限：远控命令均为小包（follow-up ≤4000 字），大包直接拒绝。 */
const BODY_LIMIT = 64 * 1024

function teamErrorStatus(code: string): number {
  switch (code) {
    case 'invalid-session':
    case 'stale-session':
      return 401
    case 'forbidden':
      return 403
    case 'invite-invalid':
      return 400
    case 'invite-used':
      return 409
    case 'invite-expired':
      return 410
    case 'not-found':
      return 404
    default:
      return 400
  }
}

export interface PeerIdentity {
  deviceId: string
  name: string
}

export interface PeerServerOptions {
  host: RemoteHost
  /** 被控本机的设备身份（mDNS 广播名 + 配对归属），由调用方从团队会话提供。 */
  getIdentity: () => PeerIdentity
  cert?: PeerCert
  /** 测试注入：false 则不广播 mDNS，只起 HTTPS。 */
  advertise?: boolean
  listenHost?: string
  createBonjour?: () => Bonjour
  /** 三视图数据源（远控显示契约）：缺省则关闭 /v1/view/*。 */
  view?: LocalViewPorts
}

export interface PeerServerInfo {
  port: number
  fingerprint: string
  /** 局域网 IPv4，供手动输入兜底（mDNS 不可用时）。 */
  addresses: string[]
}

export function lanIPv4Addresses(): string[] {
  const result: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family === 'IPv4' && !item.internal) result.push(item.address)
    }
  }
  return result
}

export class RemotePeerServer {
  private server: Server | null = null
  private bonjour: Bonjour | null = null
  private published: Service | null = null
  private info: PeerServerInfo | null = null

  constructor(private readonly options: PeerServerOptions) {}

  get running(): boolean {
    return this.server !== null
  }

  get currentInfo(): PeerServerInfo | null {
    return this.info
  }

  async start(): Promise<PeerServerInfo> {
    if (this.server && this.info) return this.info
    const cert = this.options.cert ?? (await loadOrCreatePeerCert())
    const { host, getIdentity } = this.options
    this.server = createServer({ key: cert.key, cert: cert.cert }, (req, res) => {
      void this.route(req, res, host).catch(() => {
        if (!res.headersSent) this.json(res, 500, { code: 'internal', message: '被控服务异常' })
      })
    })
    const listenHost = this.options.listenHost ?? '0.0.0.0'
    const port = await new Promise<number>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(0, listenHost, () => {
        const address = this.server!.address()
        if (address && typeof address === 'object') resolve(address.port)
        else reject(new Error('无法获取监听端口'))
      })
    })
    this.info = { port, fingerprint: cert.fingerprint, addresses: lanIPv4Addresses() }
    if (this.options.advertise !== false) {
      const identity = getIdentity()
      this.bonjour = this.options.createBonjour?.() ?? new Bonjour()
      this.published = this.bonjour.publish({
        name: `JanusX-${identity.deviceId.slice(0, 8)}`,
        type: PEER_SERVICE_TYPE,
        port,
        txt: { device: identity.deviceId, fp: cert.fingerprint, v: String(PEER_PROTOCOL_VERSION) },
      })
    }
    return this.info
  }

  async stop(): Promise<void> {
    this.published?.stop()
    this.published = null
    this.bonjour?.destroy()
    this.bonjour = null
    const server = this.server
    this.server = null
    this.info = null
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }

  private viewOr404(): LocalViewPorts {
    const view = this.options.view
    if (!view) throw new TeamError('not-found', '被控端未开启三视图')
    return view
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body)
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(payload)
  }

  private readBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let size = 0
      req.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > BODY_LIMIT) {
          reject(new TeamError('invalid-request', '请求体过大'))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        if (chunks.length === 0) {
          resolve(undefined)
          return
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch {
          reject(new TeamError('invalid-request', '请求体不是合法 JSON'))
        }
      })
      req.on('error', reject)
    })
  }

  private authed(req: IncomingMessage): { token: string; deviceId: string } {
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    const deviceId = String(req.headers['x-janusx-device-id'] ?? '').trim()
    if (!token || !deviceId) throw new TeamError('invalid-session', '缺少登录会话，请重新登录后重试')
    return { token, deviceId }
  }

  private async route(req: IncomingMessage, res: ServerResponse, host: RemoteHost): Promise<void> {
    const url = new URL(req.url ?? '/', 'https://peer')
    const parts = url.pathname.split('/').filter(Boolean)
    try {
      // 无需鉴权的版本探针（控制端连通性/版本检查用）。
      if (req.method === 'GET' && parts.join('/') === 'v1/info') {
        this.json(res, 200, { v: PEER_PROTOCOL_VERSION })
        return
      }
      // 配对：配对码 + 控制端有效会话即完成设备绑定（host 内做同账号/同组织校验）。
      if (req.method === 'POST' && parts.join('/') === 'v1/redeem') {
        const body = (await this.readBody(req)) as {
          code?: string
          clientDeviceId?: string
          clientDeviceName?: string
          clientToken?: string
        }
        if (!body?.code || !body.clientDeviceId || !body.clientToken) {
          throw new TeamError('invalid-request', '配对参数缺失')
        }
        const result = await host.redeemPairingCode({
          code: body.code,
          clientDeviceId: body.clientDeviceId,
          clientDeviceName: body.clientDeviceName,
          clientToken: body.clientToken,
        })
        this.json(res, 200, result)
        return
      }
      const { token, deviceId } = this.authed(req)
      if (req.method === 'GET' && parts.join('/') === 'v1/view/workspaces') {
        await host.verifyAccess(token, deviceId)
        this.json(res, 200, await this.viewOr404().listWorkspaceViews())
        return
      }
      if (req.method === 'GET' && parts.join('/') === 'v1/view/files') {
        await host.verifyAccess(token, deviceId)
        const query = new URL(req.url ?? '/', 'https://peer').searchParams
        this.json(res, 200, await this.viewOr404().listFileNodes(
          query.get('workspaceId') ?? '',
          query.get('dir') ?? '',
        ))
        return
      }
      if (req.method === 'GET' && parts.join('/') === 'v1/view/terminals') {
        await host.verifyAccess(token, deviceId)
        this.json(res, 200, await this.viewOr404().listTerminalViews())
        return
      }
      if (req.method === 'GET' && parts.join('/') === 'v1/terminals') {
        this.json(res, 200, await host.listTerminals(token, deviceId))
        return
      }
      // 全量输出查看：`GET /v1/terminals/:id/tail?sinceSeq=`（sinceSeq 预留增量续流，本版回全量回放）。
      if (req.method === 'GET' && parts.length === 4 && parts[0] === 'v1' && parts[1] === 'terminals' && parts[3] === 'tail') {
        const terminalId = decodeURIComponent(parts[2]!)
        if (!terminalId || terminalId.includes('/')) throw new TeamError('invalid-request', '终端标识非法')
        this.json(res, 200, await host.getTail(token, deviceId, terminalId))
        return
      }
      if (req.method === 'POST' && parts.join('/') === 'v1/execute') {
        const body = (await this.readBody(req)) as {
          command?: CompanionCommand
          actionToken?: string
          eventId?: string
        }
        if (!body?.command || typeof body.command.type !== 'string') {
          throw new TeamError('invalid-request', '缺少受控命令')
        }
        this.json(res, 200, await host.execute({
          clientToken: token,
          clientDeviceId: deviceId,
          command: body.command,
          actionToken: body.actionToken,
          eventId: body.eventId,
        }))
        return
      }
      if (req.method === 'POST' && parts.join('/') === 'v1/action-token') {
        const body = (await this.readBody(req)) as { terminalId?: string; action?: CompanionCommand['type'] }
        if (!body?.terminalId || !body.action) throw new TeamError('invalid-request', '缺少签发参数')
        this.json(res, 200, await host.issueActionToken({
          clientToken: token,
          clientDeviceId: deviceId,
          terminalId: body.terminalId,
          action: body.action,
        }))
        return
      }
      if (req.method === 'POST' && parts.join('/') === 'v1/create-terminal') {
        const body = (await this.readBody(req)) as { workspaceId?: string; engine?: string }
        if (!body?.workspaceId) throw new TeamError('invalid-request', '缺少工作区')
        if (body.engine !== 'claude' && body.engine !== 'codex' && body.engine !== 'opencode') {
          throw new TeamError('invalid-request', '引擎须为 claude/codex/opencode 之一')
        }
        this.json(res, 200, await host.createTerminal({
          clientToken: token,
          clientDeviceId: deviceId,
          workspaceId: body.workspaceId,
          engine: body.engine,
        }))
        return
      }
      if (req.method === 'POST' && parts.join('/') === 'v1/kill-terminal') {
        const body = (await this.readBody(req)) as { terminalId?: string }
        if (!body?.terminalId) throw new TeamError('invalid-request', '缺少终端标识')
        this.json(res, 200, await host.killTerminal({
          clientToken: token,
          clientDeviceId: deviceId,
          terminalId: body.terminalId,
        }))
        return
      }
      if (req.method === 'POST' && parts.join('/') === 'v1/resize-terminal') {
        const body = (await this.readBody(req)) as { terminalId?: string; cols?: number; rows?: number }
        if (!body?.terminalId) throw new TeamError('invalid-request', '缺少终端标识')
        if (typeof body.cols !== 'number' || typeof body.rows !== 'number') {
          throw new TeamError('invalid-request', '缺少终端尺寸')
        }
        this.json(res, 200, await host.resizeTerminal({
          clientToken: token,
          clientDeviceId: deviceId,
          terminalId: body.terminalId,
          cols: body.cols,
          rows: body.rows,
        }))
        return
      }
      this.json(res, 404, { code: 'not-found', message: '未知接口' })
    } catch (error) {
      if (error instanceof TeamError) {
        this.json(res, teamErrorStatus(error.code), { code: error.code, message: error.message })
        return
      }
      throw error
    }
  }
}
