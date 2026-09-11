import { mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '' },
}))
vi.mock('../../src/main/terminal/manager', () => ({
  terminalManager: { getOutputReplay: vi.fn(() => null), listInstances: vi.fn(() => []) },
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
import { createHttpConnector, normalizePeerBaseUrl, probePeer } from '../../src/main/remote/peer-client'
import { discoverPeers } from '../../src/main/remote/peer-discovery'
import { RemotePeerServer } from '../../src/main/remote/peer-server'
import { PeerKnownHosts } from '../../src/main/remote/known-hosts'
import { TeamError } from '../../src/main/team/service'
import type { TeamSession } from '../../src/shared/team/types'

const NOW = 1_800_000_000_000
const SECRET = '0123456789abcdef0123456789abcdef'
const TENANT = 'tenant-1'

function sessionFor(userId: string, deviceId: string, tenantId: string): TeamSession {
  return {
    userId,
    deviceId,
    activeTenantId: tenantId,
    issuedAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 3_600_000).toISOString(),
  }
}

async function makeServer() {
  const team: RemoteTeamPort & { sessions: Map<string, TeamSession> } = {
    sessions: new Map(),
    async resolveSession(token: string): Promise<TeamSession> {
      const found = this.sessions.get(token)
      if (!found) throw new TeamError('invalid-session', 'invalid')
      return found
    },
  }
  team.sessions.set('host-token', sessionFor('user-1', 'device-host', TENANT))
  team.sessions.set('client-token', sessionFor('user-1', 'device-client', TENANT))
  const now = () => NOW
  const directory = await mkdtemp(join(tmpdir(), 'janusx-peer-client-'))
  const submitLine = vi.fn()
  const terminals: CompanionTerminalControl = {
    getTerminal: vi.fn((terminalId: string) => terminalId === 'term-1'
      ? { terminalId, engine: 'codex', workspaceId: 'ws-1', cwd: 'C:/repo' }
      : undefined),
    submitLine,
    interrupt: vi.fn(),
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
    tailProvider: (id) => (id === 'term-1' ? { data: 'full-output', seq: 3 } : null),
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
  })
  const info = await server.start()
  return { host, server, baseUrl: `https://127.0.0.1:${info.port}`, fingerprint: info.fingerprint, submitLine }
}

describe('控制端 HTTPS 连接器', () => {
  it('经真实 HTTPS 完成配对→看输出→输入输出', async () => {
    const { host, server, baseUrl, fingerprint, submitLine } = await makeServer()
    try {
      const connector = createHttpConnector({ baseUrl, fingerprint })
      await expect(probePeer({ baseUrl, fingerprint })).resolves.toMatchObject({ v: 1 })
      const { code } = await host.issuePairingCode('host-token')
      const redeemed = await connector.redeem(code, { deviceId: 'device-client', deviceName: 'Laptop', token: 'client-token' })
      expect(redeemed).toMatchObject({ tenantId: TENANT })
      const client = { deviceId: 'device-client', token: 'client-token' }
      await expect(connector.listTerminals(client)).resolves.toEqual([
        { terminalId: 'term-1', engine: 'codex', workspaceId: 'ws-1' },
      ])
      await expect(connector.tail(client, 'term-1')).resolves.toEqual({ data: 'full-output', seq: 3 })
      await expect(connector.execute(client, { type: 'bind', terminalId: 'term-1' })).resolves.toMatchObject({ ok: true })
      await expect(connector.execute(client, { type: 'follow-up', text: 'dir' })).resolves.toMatchObject({ ok: true })
      expect(submitLine).toHaveBeenCalledWith('term-1', 'dir')
    } finally {
      await server.stop()
    }
  })

  it('指纹不对直接硬失败', async () => {
    const { server, baseUrl } = await makeServer()
    try {
      const connector = createHttpConnector({ baseUrl, fingerprint: '0'.repeat(64) })
      await expect(connector.listTerminals({ deviceId: 'device-client', token: 'client-token' }))
        .rejects.toMatchObject({ code: 'fingerprint-mismatch' })
    } finally {
      await server.stop()
    }
  })

  it('连不上给轮椅文案', async () => {
    const connector = createHttpConnector({ baseUrl: 'https://127.0.0.1:1', fingerprint: '0'.repeat(64) })
    await expect(connector.listTerminals({ deviceId: 'd', token: 't' }))
      .rejects.toMatchObject({ code: 'peer-unreachable' })
  })

  it('地址归一化', () => {
    expect(normalizePeerBaseUrl('192.168.1.10:43717')).toBe('https://192.168.1.10:43717')
    expect(normalizePeerBaseUrl('  https://192.168.1.10:43717/ ')).toBe('https://192.168.1.10:43717')
    expect(() => normalizePeerBaseUrl('http://192.168.1.10:43717')).toThrowError('必须为 HTTPS')
    expect(() => normalizePeerBaseUrl('   ')).toThrowError('不能为空')
    expect(() => normalizePeerBaseUrl('not a url !!!')).toThrowError('格式不正确')
  })
})

describe('已知指纹 TOFU', () => {
  it('首次记忆、一致通过、变化拒绝、遗忘后可重认', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'janusx-known-'))
    const store = new PeerKnownHosts(join(directory, 'known.json'))
    await expect(store.checkOrRemember('dev-1', 'a'.repeat(64))).resolves.toBe('remembered')
    await expect(store.checkOrRemember('dev-1', 'a'.repeat(64))).resolves.toBe('matched')
    await expect(store.checkOrRemember('dev-1', 'b'.repeat(64))).rejects.toMatchObject({ code: 'fingerprint-mismatch' })
    await store.forget('dev-1')
    await expect(store.checkOrRemember('dev-1', 'b'.repeat(64))).resolves.toBe('remembered')
  })
})

describe('mDNS 发现过滤', () => {
  it('只收同协议带指纹条目并去重', async () => {
    const services = [
      { name: 'JanusX-aaa', port: 1111, txt: { device: 'dev-a', fp: 'f'.repeat(64), v: '1' }, addresses: ['192.168.1.11'] },
      { name: 'JanusX-old', port: 2222, txt: { device: 'dev-old', fp: 'e'.repeat(64), v: '0' }, addresses: ['192.168.1.12'] },
      { name: 'JanusX-nofp', port: 3333, txt: { device: 'dev-x', v: '1' }, addresses: ['192.168.1.13'] },
    ]
    const peers = await discoverPeers(5, {
      now: () => NOW,
      createBrowser: () => ({
        find: (_query: unknown, onUp: (service: (typeof services)[number]) => void) => {
          for (const service of services) onUp(service)
          // 同设备重复广播只留一条
          onUp(services[0]!)
          return { stop: () => undefined }
        },
        destroy: () => undefined,
      }),
    })
    expect(peers).toEqual([{
      deviceId: 'dev-a',
      name: 'JanusX-aaa',
      host: '192.168.1.11',
      port: 1111,
      fingerprint: 'f'.repeat(64),
      lastSeenAt: NOW,
    }])
  })
})
