import { mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { request as httpsRequest } from 'https'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '' },
}))
vi.mock('../../src/main/terminal/manager', () => ({
  terminalManager: {
    getOutputReplay: vi.fn(() => null),
    listInstances: vi.fn(() => []),
    getInstance: vi.fn(() => ({ id: 'term-1' })),
    kill: vi.fn(),
    resize: vi.fn(),
  },
}))
vi.mock('../../src/main/ipc/terminal-handlers', () => ({
  submitCompanionTerminalLine: vi.fn(),
}))
import { CompanionActionTokens } from '../../src/main/companion/action-token'
import { CompanionAuditStore } from '../../src/main/companion/audit-store'
import { CompanionBindingStore } from '../../src/main/companion/binding-store'
import { CompanionDedupe } from '../../src/main/companion/dedupe'
import { CompanionGateway } from '../../src/main/companion/gateway'
import { LanPairingCodes } from '../../src/main/companion/lan-pairing'
import type { CompanionTerminalControl } from '../../src/main/companion/terminal-control'
import { loadOrCreatePeerCert } from '../../src/main/remote/cert'
import { RemoteHost, type RemoteTeamPort } from '../../src/main/remote/host'
import { terminalManager } from '../../src/main/terminal/manager'
import { RemotePeerServer } from '../../src/main/remote/peer-server'
import type { LocalViewPorts } from '../../src/main/remote/view-ports'
import { TeamError } from '../../src/main/team/service'
import type { TeamSession } from '../../src/shared/team/types'

const NOW = 1_800_000_000_000
const SECRET = '0123456789abcdef0123456789abcdef'
const TENANT = 'tenant-1'
const OTHER_TENANT = 'tenant-2'

function sessionFor(userId: string, deviceId: string, tenantId: string): TeamSession {
  return {
    userId,
    deviceId,
    activeTenantId: tenantId,
    issuedAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 3_600_000).toISOString(),
  }
}

interface FakeTeam extends RemoteTeamPort {
  sessions: Map<string, TeamSession>
}

async function makeServer(team: FakeTeam, directory: string, view?: LocalViewPorts) {
  const now = () => NOW
  const submitLine = vi.fn()
  const interrupt = vi.fn()
  const terminals: CompanionTerminalControl = {
    getTerminal: vi.fn((terminalId: string) => terminalId === 'term-1'
      ? { terminalId, engine: 'codex', workspaceId: 'ws-1', cwd: 'C:/repo' }
      : undefined),
    submitLine,
    interrupt,
    hasPendingApproval: vi.fn(() => false),
    respondToApproval: vi.fn(),
    clearPendingApproval: vi.fn(),
  }
  const bindings = new CompanionBindingStore(join(directory, 'bindings.json'), now)
  const hostRef: { current: RemoteHost | null } = { current: null }
  const gateway = new CompanionGateway({
    policy: () => ({ enabled: true, mode: 'app', allowedOpenIds: hostRef.current?.trustedDeviceIds() ?? [] }),
    bindings,
    tokens: new CompanionActionTokens(SECRET, now),
    dedupe: new CompanionDedupe(join(directory, 'dedupe.json'), 60_000, now),
    audit: new CompanionAuditStore(join(directory, 'audit.jsonl'), 60_000, now),
    terminals,
    bindingTtlMs: 10_000,
    now,
  })
  const host = new RemoteHost({
    team,
    gateway,
    bindings,
    pairing: new LanPairingCodes(now, 5 * 60 * 1000),
    now,
    tailProvider: (id) => (id === 'term-1' ? { data: 'hello-output', seq: 7 } : null),
    listTerminalsProvider: () => [{ terminalId: 'term-1', engine: 'codex', workspaceId: 'ws-1' }],
  })
  hostRef.current = host
  const cert = await loadOrCreatePeerCert({
    certFile: join(directory, 'peer-cert.pem'),
    keyFile: join(directory, 'peer-key.pem'),
  })
  const server = new RemotePeerServer({
    host,
    getIdentity: () => ({ deviceId: 'device-host', name: 'Host' }),
    cert,
    advertise: false,
    listenHost: '127.0.0.1',
    ...(view ? { view } : {}),
  })
  const info = await server.start()
  return { host, server, info, submitLine, interrupt }
}

interface ApiOptions {
  token?: string
  deviceId?: string
  body?: unknown
}

function api(port: number, method: string, path: string, opts: ApiOptions = {}): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = opts.body === undefined ? null : Buffer.from(JSON.stringify(opts.body), 'utf8')
    const req = httpsRequest({
      host: '127.0.0.1',
      port,
      method,
      path,
      rejectUnauthorized: false,
      headers: {
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.deviceId ? { 'x-janusx-device-id': opts.deviceId } : {}),
        ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}),
      },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) })
        } catch (error) {
          reject(error)
        }
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

function makeTeam(): FakeTeam {
  const sessions = new Map<string, TeamSession>()
  return {
    sessions,
    async resolveSession(token: string): Promise<TeamSession> {
      const found = sessions.get(token)
      if (!found) throw new TeamError('invalid-session', 'invalid')
      return found
    },
  }
}

describe('双机 HTTPS 被控端', () => {
  it('info 免鉴权、未登录请求 401、错码 400', async () => {
    const team = makeTeam()
    team.sessions.set('host-token', sessionFor('user-1', 'device-host', TENANT))
    team.sessions.set('client-token', sessionFor('user-1', 'device-client', TENANT))
    const directory = await mkdtemp(join(tmpdir(), 'janusx-peer-'))
    const { host, server, info } = await makeServer(team, directory)
    try {
      expect(info.fingerprint).toMatch(/^[0-9a-f]{64}$/)
      const probe = await api(info.port, 'GET', '/v1/info')
      expect(probe.status).toBe(200)
      expect(probe.body).toMatchObject({ v: 1 })

      const denied = await api(info.port, 'GET', '/v1/terminals')
      expect(denied.status).toBe(401)

      const { code } = await host.issuePairingCode('host-token')
      const bad = await api(info.port, 'POST', '/v1/redeem', {
        body: { code: 'XXXXX', clientDeviceId: 'device-client', clientToken: 'client-token' },
      })
      expect(bad.status).toBe(400)
      expect(bad.body).toMatchObject({ code: 'invite-invalid' })

      const ok = await api(info.port, 'POST', '/v1/redeem', {
        body: { code, clientDeviceId: 'device-client', clientDeviceName: 'Laptop', clientToken: 'client-token' },
      })
      expect(ok.status).toBe(200)
      expect(ok.body).toMatchObject({ tenantId: TENANT })
    } finally {
      await server.stop()
    }
  })

  it('配对后经 HTTPS 看终端 tail、提交一行、中断', async () => {
    const team = makeTeam()
    team.sessions.set('host-token', sessionFor('user-1', 'device-host', TENANT))
    team.sessions.set('client-token', sessionFor('user-1', 'device-client', TENANT))
    const directory = await mkdtemp(join(tmpdir(), 'janusx-peer-'))
    const { host, server, info, submitLine, interrupt } = await makeServer(team, directory)
    try {
      const { code } = await host.issuePairingCode('host-token')
      await api(info.port, 'POST', '/v1/redeem', {
        body: { code, clientDeviceId: 'device-client', clientDeviceName: 'Laptop', clientToken: 'client-token' },
      })
      const auth = { token: 'client-token', deviceId: 'device-client' }
      const terminals = await api(info.port, 'GET', '/v1/terminals', auth)
      expect(terminals.status).toBe(200)
      expect(terminals.body).toEqual([{ terminalId: 'term-1', engine: 'codex', workspaceId: 'ws-1' }])

      const tail = await api(info.port, 'GET', '/v1/terminals/term-1/tail?sinceSeq=0', auth)
      expect(tail.body).toEqual({ data: 'hello-output', seq: 7 })

      const bind = await api(info.port, 'POST', '/v1/execute', { ...auth, body: { command: { type: 'bind', terminalId: 'term-1' } } })
      expect(bind.body).toMatchObject({ ok: true })
      const follow = await api(info.port, 'POST', '/v1/execute', { ...auth, body: { command: { type: 'follow-up', text: 'echo hi' } } })
      expect(follow.body).toMatchObject({ ok: true })
      expect(submitLine).toHaveBeenCalledWith('term-1', 'echo hi')
      const stop = await api(info.port, 'POST', '/v1/execute', { ...auth, body: { command: { type: 'stop' } } })
      expect(stop.body).toMatchObject({ ok: true })
      expect(interrupt).toHaveBeenCalledWith('term-1')
    } finally {
      await server.stop()
    }
  })

  it('跨组织配对经 HTTPS 被拒绝', async () => {
    const team = makeTeam()
    team.sessions.set('host-token', sessionFor('owner', 'device-host', TENANT))
    team.sessions.set('outsider-token', sessionFor('outsider', 'device-out', OTHER_TENANT))
    const directory = await mkdtemp(join(tmpdir(), 'janusx-peer-'))
    const { host, server, info } = await makeServer(team, directory)
    try {
      const { code } = await host.issuePairingCode('host-token')
      const result = await api(info.port, 'POST', '/v1/redeem', {
        body: { code, clientDeviceId: 'device-out', clientToken: 'outsider-token' },
      })
      expect(result.status).toBe(403)
      expect(result.body).toMatchObject({ code: 'forbidden' })
    } finally {
      await server.stop()
    }
  })

  it('三视图需配对：未鉴权 401、未配对 403、配对后同显示契约', async () => {
    const team = makeTeam()
    team.sessions.set('host-token', sessionFor('user-1', 'device-host', TENANT))
    team.sessions.set('client-token', sessionFor('user-1', 'device-client', TENANT))
    team.sessions.set('stranger-token', sessionFor('user-1', 'device-stranger', TENANT))
    const view: LocalViewPorts = {
      listWorkspaceViews: vi.fn(async () => [{ id: 'w1', name: 'demo', terminalCount: 1 }]),
      listFileNodes: vi.fn(async () => [{ name: 'a.txt', relPath: 'a.txt', type: 'file' as const, hasChildren: false }]),
      listTerminalViews: vi.fn(async () => [{ terminalId: 'term-1', workspaceId: 'w1', status: 'running' as const, seq: 7 }]),
      getTerminalReplay: vi.fn(async () => null),
    }
    const directory = await mkdtemp(join(tmpdir(), 'janusx-peer-'))
    const { host, server, info } = await makeServer(team, directory, view)
    try {
      expect(await api(info.port, 'GET', '/v1/view/workspaces')).toMatchObject({ status: 401 })
      expect(await api(info.port, 'GET', '/v1/view/workspaces', { token: 'stranger-token', deviceId: 'device-stranger' }))
        .toMatchObject({ status: 403 })

      const { code } = await host.issuePairingCode('host-token')
      await api(info.port, 'POST', '/v1/redeem', {
        body: { code, clientDeviceId: 'device-client', clientDeviceName: 'Laptop', clientToken: 'client-token' },
      })
      const auth = { token: 'client-token', deviceId: 'device-client' }
      const workspaces = await api(info.port, 'GET', '/v1/view/workspaces', auth)
      expect(workspaces.status).toBe(200)
      expect(workspaces.body).toEqual([{ id: 'w1', name: 'demo', terminalCount: 1 }])
      const files = await api(info.port, 'GET', '/v1/view/files?workspaceId=w1&dir=', auth)
      expect(files.status).toBe(200)
      expect(files.body).toEqual([{ name: 'a.txt', relPath: 'a.txt', type: 'file', hasChildren: false }])
      const terminals = await api(info.port, 'GET', '/v1/view/terminals', auth)
      expect(terminals.status).toBe(200)
      expect(terminals.body).toEqual([{ terminalId: 'term-1', workspaceId: 'w1', status: 'running', seq: 7 }])
    } finally {
      await server.stop()
    }
  })

  it('建终端路由：未鉴权 401、非法引擎 400、配对后转网关（无创建器则明确失败）', async () => {
    const team = makeTeam()
    team.sessions.set('host-token', sessionFor('user-1', 'device-host', TENANT))
    team.sessions.set('client-token', sessionFor('user-1', 'device-client', TENANT))
    const directory = await mkdtemp(join(tmpdir(), 'janusx-peer-'))
    const { host, server, info } = await makeServer(team, directory)
    try {
      expect(await api(info.port, 'POST', '/v1/create-terminal', { body: { workspaceId: 'w1', engine: 'codex' } }))
        .toMatchObject({ status: 401 })
      const { code } = await host.issuePairingCode('host-token')
      await api(info.port, 'POST', '/v1/redeem', {
        body: { code, clientDeviceId: 'device-client', clientDeviceName: 'Laptop', clientToken: 'client-token' },
      })
      const auth = { token: 'client-token', deviceId: 'device-client' }
      const badEngine = await api(info.port, 'POST', '/v1/create-terminal', { ...auth, body: { workspaceId: 'w1', engine: 'shell' } })
      expect(badEngine.status).toBe(400)
      // 测试网关未装创建器：路由通，网关明确报不可用（生产单例装有真实创建器）。
      const created = await api(info.port, 'POST', '/v1/create-terminal', { ...auth, body: { workspaceId: 'w1', engine: 'codex' } })
      expect(created.status).toBe(200)
      expect(created.body).toMatchObject({ ok: false, code: 'execution-failed' })
    } finally {
      await server.stop()
    }
  })

  it('销毁终端路由：未鉴权 401、缺标识 400、配对后真杀', async () => {
    const team = makeTeam()
    team.sessions.set('host-token', sessionFor('user-1', 'device-host', TENANT))
    team.sessions.set('client-token', sessionFor('user-1', 'device-client', TENANT))
    const directory = await mkdtemp(join(tmpdir(), 'janusx-peer-'))
    const { host, server, info } = await makeServer(team, directory)
    try {
      expect(await api(info.port, 'POST', '/v1/kill-terminal', { body: { terminalId: 'term-1' } }))
        .toMatchObject({ status: 401 })
      const { code } = await host.issuePairingCode('host-token')
      await api(info.port, 'POST', '/v1/redeem', {
        body: { code, clientDeviceId: 'device-client', clientDeviceName: 'Laptop', clientToken: 'client-token' },
      })
      const auth = { token: 'client-token', deviceId: 'device-client' }
      expect(await api(info.port, 'POST', '/v1/kill-terminal', { ...auth, body: {} }))
        .toMatchObject({ status: 400 })
      const kill = terminalManager.kill as ReturnType<typeof vi.fn>
      kill.mockClear()
      const done = await api(info.port, 'POST', '/v1/kill-terminal', { ...auth, body: { terminalId: 'term-1' } })
      expect(done.status).toBe(200)
      expect(done.body).toMatchObject({ success: true, terminalId: 'term-1' })
      expect(kill).toHaveBeenCalledWith('term-1')
    } finally {
      await server.stop()
    }
  })

  it('同步尺寸路由：未鉴权 401、缺参 400、配对后透传 resize', async () => {
    const team = makeTeam()
    team.sessions.set('host-token', sessionFor('user-1', 'device-host', TENANT))
    team.sessions.set('client-token', sessionFor('user-1', 'device-client', TENANT))
    const directory = await mkdtemp(join(tmpdir(), 'janusx-peer-'))
    const { host, server, info } = await makeServer(team, directory)
    try {
      expect(await api(info.port, 'POST', '/v1/resize-terminal', { body: { terminalId: 'term-1', cols: 100, rows: 30 } }))
        .toMatchObject({ status: 401 })
      const { code } = await host.issuePairingCode('host-token')
      await api(info.port, 'POST', '/v1/redeem', {
        body: { code, clientDeviceId: 'device-client', clientDeviceName: 'Laptop', clientToken: 'client-token' },
      })
      const auth = { token: 'client-token', deviceId: 'device-client' }
      expect(await api(info.port, 'POST', '/v1/resize-terminal', { ...auth, body: { terminalId: 'term-1' } }))
        .toMatchObject({ status: 400 })
      const { terminalManager: tm } = await import('../../src/main/terminal/manager')
      const resize = tm.resize as ReturnType<typeof vi.fn>
      resize.mockClear()
      const done = await api(info.port, 'POST', '/v1/resize-terminal', { ...auth, body: { terminalId: 'term-1', cols: 187, rows: 55 } })
      expect(done.status).toBe(200)
      expect(done.body).toMatchObject({ success: true, terminalId: 'term-1', cols: 187, rows: 55 })
      expect(resize).toHaveBeenCalledWith('term-1', 187, 55)
    } finally {
      await server.stop()
    }
  })

  it('证书落盘复用、指纹稳定', async () => {    const directory = await mkdtemp(join(tmpdir(), 'janusx-peer-'))
    const first = await loadOrCreatePeerCert({
      certFile: join(directory, 'peer-cert.pem'),
      keyFile: join(directory, 'peer-key.pem'),
    })
    const second = await loadOrCreatePeerCert({
      certFile: join(directory, 'peer-cert.pem'),
      keyFile: join(directory, 'peer-key.pem'),
    })
    expect(second.cert).toBe(first.cert)
    expect(second.fingerprint).toBe(first.fingerprint)
  })
})
