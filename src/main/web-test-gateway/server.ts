/**
 * @file 本地回环 Web 验证网关（ToB 联调测试工具，非产品功能）
 * @description 只绑 127.0.0.1 的 HTTP 服务：团队账号 API + 远控回环 API + 单页测试台。
 *              鉴权复用团队会话 JWT（Authorization: Bearer），设备身份走
 *              `x-janusx-device-id` 头或 body/query 的 deviceId；语义与
 *              `team-handlers` / `remote-handlers` 一致，不新增权限模型。
 *              Electron 依赖全部经端口注入，本模块可单测。
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { request as httpRequest } from 'http'
import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { URL } from 'url'
import type { CompanionCommand } from '../companion/contracts'
import type { TeamRole } from '../../shared/team/types'
import type { LocalViewPorts } from '../remote/view-ports'
import { TEST_PAGE } from './page'
import { createElectronShim } from './shim'

/** 网关只读视图端口（远控显示契约的生产/测试实现）。 */
export type WebViewPorts = LocalViewPorts

export const WEB_TEST_DEFAULT_PORT = 5789
const BODY_LIMIT = 64 * 1024
/** SSE 轮询间隔：回环测试够用，后续换 pty 事件直推再提速。 */
const STREAM_POLL_MS = 500
/** SSE 首帧回放裁剪：只下发尾部，避免 1MB buffer 压垮浏览器。 */
const STREAM_REPLAY_TAIL = 32 * 1024
/** 每 N 轮重验一次配对（禁用/登出后主动掐流，fail-closed）。 */
const STREAM_REVERIFY_EVERY = 6

/** 网关对团队服务的最小依赖面（生产接 teamService，测试注假）。 */
export interface WebTeamPort {
  register(input: {
    email: string
    password: string
    name?: string
    inviteCode?: string
    device: { deviceId: string; name: string }
  }): Promise<unknown>
  login(input: {
    email: string
    password: string
    device: { deviceId: string; name: string }
  }): Promise<unknown>
  logout(token: string): Promise<unknown>
  refresh(refreshToken: string): Promise<unknown>
  me(token: string): Promise<unknown>
  listTenants(token: string): Promise<unknown>
  createTenant(token: string, name: string): Promise<unknown>
  switchTenant(token: string, tenantId: string): Promise<unknown>
  inviteMember(token: string, tenantId: string, role?: TeamRole): Promise<unknown>
  acceptInvite(token: string, code: string): Promise<unknown>
  listMembers(token: string, tenantId: string): Promise<unknown>
  listProjects(token: string, tenantId: string): Promise<unknown>
  setRole(token: string, tenantId: string, userId: string, role: TeamRole): Promise<unknown>
  setMemberStatus(token: string, tenantId: string, userId: string, status: 'active' | 'disabled'): Promise<unknown>
}

/** 网关对远控被控端的最小依赖面（生产接 production RemoteHost）。 */
export interface WebRemotePort {
  issuePairingCode(hostToken: string): Promise<unknown>
  redeemPairingCode(input: {
    code: string
    clientDeviceId: string
    clientDeviceName?: string
    clientToken: string
  }): Promise<unknown>
  listTerminals(clientToken: string, clientDeviceId: string): Promise<unknown>
  getTail(clientToken: string, clientDeviceId: string, terminalId: string): Promise<unknown>
  execute(input: {
    clientToken: string
    clientDeviceId: string
    command: CompanionCommand
    actionToken?: string
    eventId?: string
  }): Promise<unknown>
  issueActionToken(input: {
    clientToken: string
    clientDeviceId: string
    terminalId: string
    action: CompanionCommand['type']
  }): Promise<unknown>
  listTrustedDevices(hostToken: string): Promise<unknown>
  revokeDevice(hostToken: string, deviceId: string): Promise<unknown>
  /** 受控建终端（验配对后签发工作区级单次 token 再创建）。 */
  createTerminal(input: {
    clientToken: string
    clientDeviceId: string
    workspaceId: string
    engine: 'claude' | 'codex' | 'opencode'
  }): Promise<unknown>
  /** 受控销毁终端（验配对后直杀 PTY，与桌面关闭一致）。 */
  killTerminal(input: {
    clientToken: string
    clientDeviceId: string
    terminalId: string
  }): Promise<unknown>
  /** 受控同步终端尺寸（验配对后调 PTY resize，前端 fit 回传）。 */
  resizeTerminal(input: {
    clientToken: string
    clientDeviceId: string
    terminalId: string
    cols: number
    rows: number
  }): Promise<unknown>
}

/** 双机远控桥（控制端 mDNS 发现/配对/执行走主进程，原语见 peer-runtime）。 */
export interface WebPeerPort {
  hostStatus(): Promise<unknown>
  startHost(token: string, deviceName: string): Promise<unknown>
  stopHost(): Promise<unknown>
  discover(timeoutMs?: number): Promise<unknown>
  pair(input: {
    token: string
    deviceName: string
    baseUrl: string
    fingerprint: string
    code: string
    expectedDeviceId?: string
  }): Promise<unknown>
  listPeers(): Promise<unknown>
  listTerminals(token: string, hostDeviceId: string): Promise<unknown>
  tail(token: string, hostDeviceId: string, terminalId: string): Promise<unknown>
  execute(
    token: string,
    hostDeviceId: string,
    command: CompanionCommand,
    opts?: { actionToken?: string; eventId?: string },
  ): Promise<unknown>
  disconnect(hostDeviceId?: string): Promise<unknown>
  forget(hostDeviceId: string): Promise<unknown>
  /** 已配对被控的三视图（远控显示契约）：浏览器远控主界面骨架的数据源。 */
  viewWorkspaces(token: string, hostDeviceId: string): Promise<unknown>
  viewFiles(token: string, hostDeviceId: string, workspaceId: string, dir: string): Promise<unknown>
  viewTerminals(token: string, hostDeviceId: string): Promise<unknown>
  /** 已配对被控上建终端（工作区级单次 token 由被控端签发）。 */
  createTerminal(token: string, hostDeviceId: string, workspaceId: string, engine: string): Promise<unknown>
  /** 已配对被控上销毁终端（直杀 PTY）。 */
  killTerminal(token: string, hostDeviceId: string, terminalId: string): Promise<unknown>
  /** 已配对被控上同步终端尺寸。 */
  resizeTerminal(token: string, hostDeviceId: string, terminalId: string, cols: number, rows: number): Promise<unknown>
}

export interface WebTestGatewayOptions {
  team: WebTeamPort
  remote: WebRemotePort
  view: WebViewPorts
  peer: WebPeerPort
  /** renderer 开发服务地址（默认 http://127.0.0.1:5799），`/app` 代理到它。 */
  rendererDevUrl?: string
  /** 宿主平台（垫片 window.electron.platform 用），默认 win32。 */
  platform?: string
}

function errorStatus(code: string): number {
  switch (code) {
    case 'invalid-session':
    case 'stale-session':
      return 401
    case 'forbidden':
    case 'account-disabled':
    case 'member-disabled':
      return 403
    case 'not-found':
      return 404
    case 'invite-used':
    case 'email-taken':
      return 409
    case 'invite-expired':
      return 410
    case 'rate-limited':
      return 429
    case 'renderer-unavailable':
      return 502
    default:
      return 400
  }
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code
  return typeof code === 'string' && code ? code : 'internal'
}

type CompanionEngineName = 'claude' | 'codex' | 'opencode'

/** 建终端引擎白名单（与 companion 契约一致，非法直接拒绝）。 */
function assertEngine(value: unknown): CompanionEngineName {
  if (value === 'claude' || value === 'codex' || value === 'opencode') return value
  throw Object.assign(new Error('引擎须为 claude/codex/opencode 之一'), { code: 'invalid-request' })
}

/**
 * 浏览器真终端用的 xterm 产物（仓库 node_modules 固定映射，无目录遍历面）。
 * 仅开发态验证台使用，打包后缺失则返回 404 提示，页面自动降级为文本流。
 */
const XTERM_ASSETS: Record<string, { pkg: string; file: string; contentType: string }> = {
  '/__janusx/xterm.js': { pkg: '@xterm/xterm', file: 'lib/xterm.js', contentType: 'text/javascript; charset=utf-8' },
  '/__janusx/xterm.css': { pkg: '@xterm/xterm', file: 'css/xterm.css', contentType: 'text/css; charset=utf-8' },
  '/__janusx/addon-fit.js': { pkg: '@xterm/addon-fit', file: 'lib/addon-fit.js', contentType: 'text/javascript; charset=utf-8' },
}

async function serveXtermAsset(res: ServerResponse, path: string): Promise<boolean> {
  const asset = XTERM_ASSETS[path]
  if (!asset) return false
  try {
    const require = createRequire(`${process.cwd()}/package.json`)
    const pkgJson = require.resolve(`${asset.pkg}/package.json`)
    const data = await readFile(join(dirname(pkgJson), asset.file))
    res.writeHead(200, { 'content-type': asset.contentType, 'cache-control': 'public, max-age=3600' })
    res.end(data)
    return true
  } catch {
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ code: 'not-found', message: 'xterm 资源缺失（需在仓库开发态运行）' }))
    return true
  }
}

export class WebTestGateway {
  private server: Server | null = null

  constructor(private readonly options: WebTestGatewayOptions) {}

  get running(): boolean {
    return this.server !== null
  }

  async start(port = WEB_TEST_DEFAULT_PORT): Promise<{ port: number }> {
    if (this.server) return { port }
    const { team, remote, view, peer } = this.options
    this.server = createServer((req, res) => {
      void this.route(req, res, team, remote, view, peer).catch(() => {
        if (!res.headersSent) this.json(res, 500, { code: 'internal', message: '网关异常' })
      })
    })
    const actual = await new Promise<number>((resolve, reject) => {
      this.server!.once('error', reject)
      // 只绑回环：浏览器只能在本机测，LAN 侧不可见。
      this.server!.listen(port, '127.0.0.1', () => {
        const address = this.server!.address()
        if (address && typeof address === 'object') resolve(address.port)
        else reject(new Error('无法获取监听端口'))
      })
    })
    return { port: actual }
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = null
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(payload)
  }

  private readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let size = 0
      req.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > BODY_LIMIT) {
          reject(Object.assign(new Error('请求体过大'), { code: 'invalid-request' }))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        if (chunks.length === 0) {
          resolve({})
          return
        }
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
          resolve((parsed ?? {}) as Record<string, unknown>)
        } catch {
          reject(Object.assign(new Error('请求体不是合法 JSON'), { code: 'invalid-request' }))
        }
      })
      req.on('error', reject)
    })
  }

  private bearer(req: IncomingMessage): string {
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!token) throw Object.assign(new Error('缺少登录会话，请先登录'), { code: 'invalid-session' })
    return token
  }

  private deviceId(req: IncomingMessage, url: URL, body: Record<string, unknown>): string {
    const fromHeader = String(req.headers['x-janusx-device-id'] ?? '').trim()
    const fromBody = String(body.deviceId ?? '').trim()
    const fromQuery = String(url.searchParams.get('deviceId') ?? '').trim()
    const deviceId = fromHeader || fromBody || fromQuery
    if (!deviceId) throw Object.assign(new Error('缺少设备标识'), { code: 'invalid-device' })
    return deviceId
  }

  private async route(
    req: IncomingMessage,
    res: ServerResponse,
    team: WebTeamPort,
    remote: WebRemotePort,
    view: WebViewPorts,
    peer: WebPeerPort,
  ): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://loopback')
    const path = url.pathname
    try {
      if (req.method === 'GET' && path === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        res.end(TEST_PAGE)
        return
      }
      if (req.method === 'GET' && path === '/health') {
        this.json(res, 200, { ok: true, scope: 'loopback', time: new Date().toISOString() })
        return
      }
      if (req.method === 'GET' && path === '/__janusx/shim.js') {
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
        res.end(createElectronShim(this.options.platform ?? 'win32'))
        return
      }
      if (req.method === 'GET' && (await serveXtermAsset(res, path))) return
      if (path.startsWith('/api/team/')) {
        await this.routeTeam(req, res, url, team)
        return
      }
      if (path.startsWith('/api/remote/')) {
        await this.routeRemote(req, res, url, remote)
        return
      }
      if (path.startsWith('/api/peer/')) {
        await this.routePeer(req, res, url, peer)
        return
      }
      if (path.startsWith('/api/view/')) {
        await this.routeView(req, res, url, remote, view)
        return
      }
      // 其余全部代理到 renderer 开发服务：`/app/` 为真 JanusX 界面入口，
      // vite 绝对路径资源（/@vite、/assets、/src …）同样直通。
      if (this.isRendererPath(path)) {
        await this.proxyRenderer(req, res, path === '/app' || path === '/app/' ? '/' : path.replace(/^\/app(?=\/)/, ''))
        return
      }
      this.json(res, 404, { code: 'not-found', message: '未知接口' })
    } catch (error) {
      const code = errorCode(error)
      const message = error instanceof Error ? error.message : '未知错误'
      this.json(res, code === 'internal' ? 500 : errorStatus(code), { code, message })
    }
  }

  /** 网关自有路径之外的全部交给 renderer（入口与 vite 绝对资源）。 */
  private isRendererPath(path: string): boolean {
    if (path === '/app' || path.startsWith('/app/')) return true
    if (path.startsWith('/api/') || path === '/health' || path.startsWith('/__janusx/')) return false
    return true
  }

  private async routeTeam(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    team: WebTeamPort,
  ): Promise<void> {
    const path = url.pathname
    if (req.method === 'POST' && path === '/api/team/register') {
      const body = await this.readBody(req)
      const device = body.device as { deviceId?: string; name?: string } | undefined
      this.json(res, 200, await team.register({
        email: String(body.email ?? ''),
        password: String(body.password ?? ''),
        name: body.name === undefined ? undefined : String(body.name),
        inviteCode: body.inviteCode === undefined ? undefined : String(body.inviteCode),
        device: { deviceId: String(device?.deviceId ?? ''), name: String(device?.name ?? 'WebTest') },
      }))
      return
    }
    if (req.method === 'POST' && path === '/api/team/login') {
      const body = await this.readBody(req)
      const device = body.device as { deviceId?: string; name?: string } | undefined
      this.json(res, 200, await team.login({
        email: String(body.email ?? ''),
        password: String(body.password ?? ''),
        device: { deviceId: String(device?.deviceId ?? ''), name: String(device?.name ?? 'WebTest') },
      }))
      return
    }
    if (req.method === 'POST' && path === '/api/team/logout') {
      this.json(res, 200, await team.logout(this.bearer(req)))
      return
    }
    if (req.method === 'POST' && path === '/api/team/refresh') {
      const body = await this.readBody(req)
      this.json(res, 200, await team.refresh(String(body.refreshToken ?? '')))
      return
    }
    if (req.method === 'GET' && path === '/api/team/me') {
      this.json(res, 200, await team.me(this.bearer(req)))
      return
    }
    if (req.method === 'GET' && path === '/api/team/tenants') {
      this.json(res, 200, await team.listTenants(this.bearer(req)))
      return
    }
    if (req.method === 'POST' && path === '/api/team/tenants') {
      const body = await this.readBody(req)
      this.json(res, 200, await team.createTenant(this.bearer(req), String(body.name ?? '')))
      return
    }
    if (req.method === 'POST' && path === '/api/team/switch') {
      const body = await this.readBody(req)
      this.json(res, 200, await team.switchTenant(this.bearer(req), String(body.tenantId ?? '')))
      return
    }
    if (req.method === 'POST' && path === '/api/team/invite') {
      const body = await this.readBody(req)
      const role = body.role === undefined ? undefined : (String(body.role) as TeamRole)
      this.json(res, 200, await team.inviteMember(this.bearer(req), String(body.tenantId ?? ''), role))
      return
    }
    if (req.method === 'POST' && path === '/api/team/accept') {
      const body = await this.readBody(req)
      this.json(res, 200, await team.acceptInvite(this.bearer(req), String(body.code ?? '')))
      return
    }
    if (req.method === 'GET' && path === '/api/team/members') {
      const tenantId = url.searchParams.get('tenantId') ?? ''
      this.json(res, 200, await team.listMembers(this.bearer(req), tenantId))
      return
    }
    if (req.method === 'GET' && path === '/api/team/projects') {
      const tenantId = url.searchParams.get('tenantId') ?? ''
      this.json(res, 200, await team.listProjects(this.bearer(req), tenantId))
      return
    }
    if (req.method === 'POST' && path === '/api/team/role') {
      const body = await this.readBody(req)
      this.json(res, 200, await team.setRole(
        this.bearer(req),
        String(body.tenantId ?? ''),
        String(body.userId ?? ''),
        String(body.role ?? 'viewer') as TeamRole,
      ))
      return
    }
    if (req.method === 'POST' && path === '/api/team/member-status') {
      const body = await this.readBody(req)
      this.json(res, 200, await team.setMemberStatus(
        this.bearer(req),
        String(body.tenantId ?? ''),
        String(body.userId ?? ''),
        String(body.status ?? 'active') as 'active' | 'disabled',
      ))
      return
    }
    this.json(res, 404, { code: 'not-found', message: '未知接口' })
  }

  /** 双机 peer 桥：发现/配对/执行走主进程（mDNS 与 TLS 钉死留在 Node 侧）。 */
  private async routePeer(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    peer: WebPeerPort,
  ): Promise<void> {
    const path = url.pathname
    if (req.method === 'GET' && path === '/api/peer/host-status') {
      this.json(res, 200, await peer.hostStatus())
      return
    }
    if (req.method === 'POST' && path === '/api/peer/start-host') {
      const body = await this.readBody(req)
      this.json(res, 200, await peer.startHost(this.bearer(req), String(body.deviceName ?? 'WebTest')))
      return
    }
    if (req.method === 'POST' && path === '/api/peer/stop-host') {
      this.json(res, 200, await peer.stopHost())
      return
    }
    if (req.method === 'GET' && path === '/api/peer/discover') {
      const timeoutMs = Number(url.searchParams.get('timeoutMs') ?? 3000)
      this.json(res, 200, await peer.discover(Number.isFinite(timeoutMs) ? timeoutMs : 3000))
      return
    }
    if (req.method === 'POST' && path === '/api/peer/pair') {
      const body = await this.readBody(req)
      this.json(res, 200, await peer.pair({
        token: this.bearer(req),
        deviceName: String(body.deviceName ?? 'WebTest'),
        baseUrl: String(body.baseUrl ?? ''),
        fingerprint: String(body.fingerprint ?? ''),
        code: String(body.code ?? ''),
        expectedDeviceId: body.expectedDeviceId === undefined ? undefined : String(body.expectedDeviceId),
      }))
      return
    }
    if (req.method === 'GET' && path === '/api/peer/peers') {
      this.json(res, 200, await peer.listPeers())
      return
    }
    if (req.method === 'GET' && path === '/api/peer/terminals') {
      const hostDeviceId = url.searchParams.get('hostDeviceId') ?? ''
      this.json(res, 200, await peer.listTerminals(this.bearer(req), hostDeviceId))
      return
    }
    if (req.method === 'GET' && path === '/api/peer/tail') {
      const hostDeviceId = url.searchParams.get('hostDeviceId') ?? ''
      const terminalId = url.searchParams.get('terminalId') ?? ''
      this.json(res, 200, await peer.tail(this.bearer(req), hostDeviceId, terminalId))
      return
    }
    if (req.method === 'POST' && path === '/api/peer/execute') {
      const body = await this.readBody(req)
      const command = body.command as CompanionCommand | undefined
      if (!command || typeof command.type !== 'string') {
        throw Object.assign(new Error('缺少受控命令'), { code: 'invalid-request' })
      }
      this.json(res, 200, await peer.execute(
        this.bearer(req),
        String(body.hostDeviceId ?? ''),
        command,
        body.actionToken === undefined && body.eventId === undefined
          ? undefined
          : {
            ...(body.actionToken === undefined ? {} : { actionToken: String(body.actionToken) }),
            ...(body.eventId === undefined ? {} : { eventId: String(body.eventId) }),
          },
      ))
      return
    }
    if (req.method === 'POST' && path === '/api/peer/disconnect') {
      const body = await this.readBody(req)
      this.json(res, 200, await peer.disconnect(
        body.hostDeviceId === undefined ? undefined : String(body.hostDeviceId),
      ))
      return
    }
    if (req.method === 'POST' && path === '/api/peer/forget') {
      const body = await this.readBody(req)
      this.json(res, 200, await peer.forget(String(body.hostDeviceId ?? '')))
      return
    }
    if (req.method === 'POST' && path === '/api/peer/create-terminal') {
      const body = await this.readBody(req)
      this.json(res, 200, await peer.createTerminal(
        this.bearer(req),
        String(body.hostDeviceId ?? ''),
        String(body.workspaceId ?? ''),
        String(body.engine ?? ''),
      ))
      return
    }
    if (req.method === 'POST' && path === '/api/peer/kill-terminal') {
      const body = await this.readBody(req)
      this.json(res, 200, await peer.killTerminal(
        this.bearer(req),
        String(body.hostDeviceId ?? ''),
        String(body.terminalId ?? ''),
      ))
      return
    }
    if (req.method === 'POST' && path === '/api/peer/resize-terminal') {
      const body = await this.readBody(req)
      const cols = Number(body.cols)
      const rows = Number(body.rows)
      if (!body.terminalId || !Number.isFinite(cols) || !Number.isFinite(rows)) {
        throw Object.assign(new Error('缺少终端标识或尺寸'), { code: 'invalid-request' })
      }
      this.json(res, 200, await peer.resizeTerminal(
        this.bearer(req),
        String(body.hostDeviceId ?? ''),
        String(body.terminalId),
        Math.floor(cols),
        Math.floor(rows),
      ))
      return
    }
    if (req.method === 'GET' && path === '/api/peer/view/workspaces') {
      const hostDeviceId = url.searchParams.get('hostDeviceId') ?? ''
      this.json(res, 200, await peer.viewWorkspaces(this.bearer(req), hostDeviceId))
      return
    }
    if (req.method === 'GET' && path === '/api/peer/view/files') {
      const hostDeviceId = url.searchParams.get('hostDeviceId') ?? ''
      const workspaceId = url.searchParams.get('workspaceId') ?? ''
      const dir = url.searchParams.get('dir') ?? ''
      this.json(res, 200, await peer.viewFiles(this.bearer(req), hostDeviceId, workspaceId, dir))
      return
    }
    if (req.method === 'GET' && path === '/api/peer/view/terminals') {
      const hostDeviceId = url.searchParams.get('hostDeviceId') ?? ''
      this.json(res, 200, await peer.viewTerminals(this.bearer(req), hostDeviceId))
      return
    }
    this.json(res, 404, { code: 'not-found', message: '未知接口' })
  }

  /**
   * renderer 代理：`/app/` 即真 JanusX 界面（vite 开发服务直通）。
   * 入口 HTML 注入垫片脚本，使 `main.tsx` 的 fallback 让路、
   * 渲染层拿到的 `window.electron` 为网关桥接版。
   */
  private async proxyRenderer(req: IncomingMessage, res: ServerResponse, targetPath: string): Promise<void> {
    const base = new URL(this.options.rendererDevUrl ?? 'http://127.0.0.1:5799')
    const url = new URL(req.url ?? '/', 'http://loopback')
    const target = new URL(targetPath + url.search, base)
    const isEntry = target.pathname === '/'
    const body = await new Promise<Buffer>((resolve, reject) => {
      const proxy = httpRequest({
        host: base.hostname,
        port: Number(base.port || 80),
        method: req.method,
        path: target.pathname + target.search,
        headers: { ...req.headers, host: base.host },
      }, (proxyRes) => {
        if (!isEntry) {
          res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers as Record<string, string>)
          proxyRes.on('data', (chunk: Buffer) => {
            if (!res.writableEnded) res.write(chunk)
          })
          proxyRes.on('end', () => {
            if (!res.writableEnded) res.end()
          })
          proxyRes.on('error', reject)
          return
        }
        const chunks: Buffer[] = []
        proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk))
        proxyRes.on('end', () => resolve(Buffer.concat(chunks)))
        proxyRes.on('error', reject)
      })
      proxy.on('error', (error: unknown) => {
        const err = error as { code?: string }
        if (err?.code === 'ECONNREFUSED') {
          reject(Object.assign(new Error('renderer 开发服务未启动，请先跑 npm run dev'), { code: 'renderer-unavailable' }))
        } else reject(error)
      })
      if (req.method === 'GET' || req.method === 'HEAD') proxy.end()
      else req.pipe(proxy)
    }).catch((error: unknown) => {
      const code = errorCode(error)
      this.json(res, code === 'internal' ? 500 : errorStatus(code), {
        code,
        message: error instanceof Error ? error.message : '未知错误',
      })
      return null
    })
    if (body === null || !isEntry || res.writableEnded) return
    const html = body.toString('utf8')
    const injected = html.includes('</head>')
      ? html.replace('</head>', '  <script src="/__janusx/shim.js"></script>\n</head>')
      : `<script src="/__janusx/shim.js"></script>\n${html}`
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(injected)
  }

  private async routeRemote(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    remote: WebRemotePort,
  ): Promise<void> {
    const path = url.pathname
    if (req.method === 'POST' && path === '/api/remote/issue-code') {
      this.json(res, 200, await remote.issuePairingCode(this.bearer(req)))
      return
    }
    if (req.method === 'POST' && path === '/api/remote/redeem') {
      const body = await this.readBody(req)
      this.json(res, 200, await remote.redeemPairingCode({
        code: String(body.code ?? ''),
        clientDeviceId: this.deviceId(req, url, body),
        clientDeviceName: String(body.deviceName ?? 'WebTest'),
        clientToken: this.bearer(req),
      }))
      return
    }
    if (req.method === 'GET' && path === '/api/remote/terminals') {
      const token = this.bearer(req)
      this.json(res, 200, await remote.listTerminals(token, this.deviceId(req, url, {})))
      return
    }
    if (req.method === 'GET' && path === '/api/remote/tail') {
      const token = this.bearer(req)
      const terminalId = url.searchParams.get('terminalId') ?? ''
      this.json(res, 200, await remote.getTail(token, this.deviceId(req, url, {}), terminalId))
      return
    }
    if (req.method === 'POST' && path === '/api/remote/execute') {
      const body = await this.readBody(req)
      const command = body.command as CompanionCommand | undefined
      if (!command || typeof command.type !== 'string') {
        throw Object.assign(new Error('缺少受控命令'), { code: 'invalid-request' })
      }
      this.json(res, 200, await remote.execute({
        clientToken: this.bearer(req),
        clientDeviceId: this.deviceId(req, url, body),
        command,
        actionToken: body.actionToken === undefined ? undefined : String(body.actionToken),
        eventId: body.eventId === undefined ? undefined : String(body.eventId),
      }))
      return
    }
    if (req.method === 'POST' && path === '/api/remote/action-token') {
      const body = await this.readBody(req)
      this.json(res, 200, await remote.issueActionToken({
        clientToken: this.bearer(req),
        clientDeviceId: this.deviceId(req, url, body),
        terminalId: String(body.terminalId ?? ''),
        action: String(body.action ?? 'follow-up') as CompanionCommand['type'],
      }))
      return
    }
    if (req.method === 'GET' && path === '/api/remote/trusted') {
      this.json(res, 200, await remote.listTrustedDevices(this.bearer(req)))
      return
    }
    if (req.method === 'POST' && path === '/api/remote/revoke') {
      const body = await this.readBody(req)
      this.json(res, 200, await remote.revokeDevice(this.bearer(req), String(body.deviceId ?? '')))
      return
    }
    if (req.method === 'POST' && path === '/api/remote/create-terminal') {
      const body = await this.readBody(req)
      this.json(res, 200, await remote.createTerminal({
        clientToken: this.bearer(req),
        clientDeviceId: this.deviceId(req, url, body),
        workspaceId: String(body.workspaceId ?? ''),
        engine: assertEngine(body.engine),
      }))
      return
    }
    if (req.method === 'POST' && path === '/api/remote/kill-terminal') {
      const body = await this.readBody(req)
      const terminalId = String(body.terminalId ?? '').trim()
      if (!terminalId) throw Object.assign(new Error('缺少终端标识'), { code: 'invalid-request' })
      this.json(res, 200, await remote.killTerminal({
        clientToken: this.bearer(req),
        clientDeviceId: this.deviceId(req, url, body),
        terminalId,
      }))
      return
    }
    if (req.method === 'POST' && path === '/api/remote/resize-terminal') {
      const body = await this.readBody(req)
      const terminalId = String(body.terminalId ?? '').trim()
      const cols = Number(body.cols)
      const rows = Number(body.rows)
      if (!terminalId || !Number.isFinite(cols) || !Number.isFinite(rows)) {
        throw Object.assign(new Error('缺少终端标识或尺寸'), { code: 'invalid-request' })
      }
      this.json(res, 200, await remote.resizeTerminal({
        clientToken: this.bearer(req),
        clientDeviceId: this.deviceId(req, url, body),
        terminalId,
        cols: Math.floor(cols),
        rows: Math.floor(rows),
      }))
      return
    }
    this.json(res, 404, { code: 'not-found', message: '未知接口' })
  }

  /**
   * 只读三视图（远控显示契约）：工作区/文件树/终端状态。
   * 读视图只需有效会话；写操作仍走 `/api/remote/*` 的配对校验。
   */
  private async routeView(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    remote: WebRemotePort,
    view: WebViewPorts,
  ): Promise<void> {
    const path = url.pathname
    if (req.method === 'GET' && path === '/api/view/workspaces') {
      this.bearer(req)
      this.json(res, 200, await view.listWorkspaceViews())
      return
    }
    if (req.method === 'GET' && path === '/api/view/files') {
      this.bearer(req)
      const workspaceId = url.searchParams.get('workspaceId') ?? ''
      const dir = url.searchParams.get('dir') ?? ''
      this.json(res, 200, await view.listFileNodes(workspaceId, dir))
      return
    }
    if (req.method === 'GET' && path === '/api/view/terminals') {
      this.bearer(req)
      this.json(res, 200, await view.listTerminalViews())
      return
    }
    if (req.method === 'GET' && path === '/api/view/stream') {
      await this.streamTerminal(req, res, url, remote, view)
      return
    }
    this.json(res, 404, { code: 'not-found', message: '未知接口' })
  }

  /**
   * 终端实时流（SSE）：首帧回放尾部，之后按 seq 增量推送。
   * EventSource 发不出 Authorization 头，token 允许放 query（仅回环有效）。
   */
  private async streamTerminal(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    remote: WebRemotePort,
    view: WebViewPorts,
  ): Promise<void> {
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ')
      ? header.slice(7).trim()
      : String(url.searchParams.get('token') ?? '').trim()
    if (!token) throw Object.assign(new Error('缺少登录会话，请先登录'), { code: 'invalid-session' })
    const deviceId = String(req.headers['x-janusx-device-id'] ?? url.searchParams.get('deviceId') ?? '').trim()
    if (!deviceId) throw Object.assign(new Error('缺少设备标识'), { code: 'invalid-device' })
    const terminalId = url.searchParams.get('terminalId') ?? ''
    if (!terminalId) throw Object.assign(new Error('缺少终端标识'), { code: 'invalid-request' })

    // 首验：走受控入口，错码/未配对/禁用在此直接拒绝，不建流。
    const first = (await remote.getTail(token, deviceId, terminalId)) as { data: string; seq: number }
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    })
    const send = (frame: unknown) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(frame)}\n\n`)
    }
    const tail = first.data.length > STREAM_REPLAY_TAIL ? first.data.slice(-STREAM_REPLAY_TAIL) : first.data
    let lastSeq = first.seq
    let lastData = first.data
    send({ terminalId, chunk: tail, seq: first.seq, status: 'running', reset: true })

    let polls = 0
    let closed = false
    const timer = setInterval(() => {
      void (async () => {
        if (closed) return
        polls += 1
        try {
          // 周期重验配对，会话失效/禁用后掐流。
          if (polls % STREAM_REVERIFY_EVERY === 0) {
            await remote.getTail(token, deviceId, terminalId)
          }
          const replay = await view.getTerminalReplay(terminalId)
          if (!replay) {
            send({ terminalId, chunk: '', seq: lastSeq, status: 'exited' })
            close()
            return
          }
          if (replay.seq === lastSeq) return
          // seq 回退（如终端重建）即視为重置：客户端先清屏再写，避免旧流残留。
          if (replay.seq < lastSeq) {
            lastSeq = replay.seq
            lastData = replay.data
            const resetChunk = replay.data.length > STREAM_REPLAY_TAIL ? replay.data.slice(-STREAM_REPLAY_TAIL) : replay.data
            send({ terminalId, chunk: resetChunk, seq: replay.seq, status: 'running', reset: true })
            return
          }
          {
            // 输出为追加写（满后截头）：新串以旧串开头即只发新增段，否则下发裁剪全量并带 reset。
            const incremental = replay.data.startsWith(lastData)
            const chunk = incremental
              ? replay.data.slice(lastData.length)
              : replay.data.slice(-STREAM_REPLAY_TAIL)
            lastSeq = replay.seq
            lastData = replay.data
            if (!chunk) return
            send({ terminalId, chunk, seq: replay.seq, status: 'running', ...(incremental ? {} : { reset: true }) })
          }
        } catch (error) {
          send({ terminalId, chunk: '', seq: lastSeq, status: 'running', error: errorCode(error) })
          close()
        }
      })()
    }, STREAM_POLL_MS)
    const heartbeat = setInterval(() => {
      if (!closed && !res.writableEnded) res.write(': ping\n\n')
    }, 15_000)
    const close = () => {
      if (closed) return
      closed = true
      clearInterval(timer)
      clearInterval(heartbeat)
      try {
        res.end()
      } catch {
        /* 连接已断 */
      }
    }
    req.on('close', close)
  }
}
