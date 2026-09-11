import { mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
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
import { RemoteHost, type RemoteTeamPort } from '../../src/main/remote/host'
import { terminalManager } from '../../src/main/terminal/manager'
import { RemoteClient, createLoopbackConnector } from '../../src/main/remote/client'
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
  disabledTokens: Set<string>
}

function makeTeam(): FakeTeam {
  const sessions = new Map<string, TeamSession>()
  const disabledTokens = new Set<string>()
  return {
    sessions,
    disabledTokens,
    async resolveSession(token: string): Promise<TeamSession> {
      if (disabledTokens.has(token)) throw new TeamError('stale-session', 'stale')
      const found = sessions.get(token)
      if (!found) throw new TeamError('invalid-session', 'invalid')
      return found
    },
  }
}

async function makeHost(
  team: FakeTeam,
  opts: { now?: () => number; createTerminal?: (workspaceId: string, engine: 'claude' | 'codex' | 'opencode') => Promise<string> } = {},
) {
  const now = opts.now ?? (() => NOW)
  const directory = await mkdtemp(join(tmpdir(), 'janusx-remote-m3-'))
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
    ...(opts.createTerminal ? { createTerminal: opts.createTerminal } : {}),
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
  return { host, gateway, bindings, directory, submitLine, interrupt }
}

describe('M3 issue / redeem', () => {
  it('同用户两设备配对成功并可执行 status', async () => {
    const team = makeTeam()
    team.sessions.set('host-token', sessionFor('user-1', 'device-host', TENANT))
    team.sessions.set('client-token', sessionFor('user-1', 'device-client', TENANT))
    const { host } = await makeHost(team)

    const { code } = await host.issuePairingCode('host-token')
    const redeemed = await host.redeemPairingCode({
      code,
      clientDeviceId: 'device-client',
      clientDeviceName: 'Laptop',
      clientToken: 'client-token',
    })
    expect(redeemed.tenantId).toBe(TENANT)

    const status = await host.execute({ clientToken: 'client-token', clientDeviceId: 'device-client', command: { type: 'status' } })
    expect(status.ok).toBe(true)
  })

  it('同组织不同用户可配对（团队版），跨组织拒绝', async () => {
    const team = makeTeam()
    team.sessions.set('host-token', sessionFor('owner', 'device-host', TENANT))
    team.sessions.set('member-token', sessionFor('member', 'device-member', TENANT))
    team.sessions.set('outsider-token', sessionFor('outsider', 'device-out', OTHER_TENANT))
    const { host } = await makeHost(team)

    const { code: teamCode } = await host.issuePairingCode('host-token')
    await expect(host.redeemPairingCode({
      code: teamCode, clientDeviceId: 'device-member', clientToken: 'member-token',
    })).resolves.toMatchObject({ tenantId: TENANT })

    const { code: otherCode } = await host.issuePairingCode('host-token')
    await expect(host.redeemPairingCode({
      code: otherCode, clientDeviceId: 'device-out', clientToken: 'outsider-token',
    })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('错码/过期/复用分别拒绝', async () => {
    let now = NOW
    const team = makeTeam()
    team.sessions.set('host-token', sessionFor('user-1', 'device-host', TENANT))
    team.sessions.set('client-token', sessionFor('user-1', 'device-client', TENANT))
    const { host } = await makeHost(team, { now: () => now })

    await expect(host.redeemPairingCode({
      code: 'XXXXX', clientDeviceId: 'device-client', clientToken: 'client-token',
    })).rejects.toMatchObject({ code: 'invite-invalid' })

    const { code } = await host.issuePairingCode('host-token')
    now += 5 * 60 * 1000 + 1
    await expect(host.redeemPairingCode({
      code, clientDeviceId: 'device-client', clientToken: 'client-token',
    })).rejects.toMatchObject({ code: 'invite-expired' })

    now = NOW
    const fresh = await host.issuePairingCode('host-token')
    await host.redeemPairingCode({
      code: fresh.code, clientDeviceId: 'device-client', clientToken: 'client-token',
    })
    const second = await host.issuePairingCode('host-token')
    // 同一码复用（配对码已被 redeem）→ invite-used
    await host.redeemPairingCode({
      code: second.code, clientDeviceId: 'device-client', clientToken: 'client-token',
    })
    await expect(host.redeemPairingCode({
      code: second.code, clientDeviceId: 'device-client', clientToken: 'client-token',
    })).rejects.toMatchObject({ code: 'invite-used' })
  })

  it('受控建终端：一调完成签 token + 创建 + 留痕', async () => {
    const team = makeTeam()
    team.sessions.set('host-token', sessionFor('user-1', 'device-host', TENANT))
    team.sessions.set('client-token', sessionFor('user-1', 'device-client', TENANT))
    const created = vi.fn(async () => 'term-new')
    const { host } = await makeHost(team, { createTerminal: created })
    const { code } = await host.issuePairingCode('host-token')
    await host.redeemPairingCode({ code, clientDeviceId: 'device-client', clientToken: 'client-token' })

    const result = await host.createTerminal({
      clientToken: 'client-token',
      clientDeviceId: 'device-client',
      workspaceId: 'ws-1',
      engine: 'codex',
    })
    expect(result).toMatchObject({ ok: true, targetTerminalId: 'term-new' })
    expect(created).toHaveBeenCalledWith('ws-1', 'codex')

    // 未配对设备建终端一律拒绝
    await expect(host.createTerminal({
      clientToken: 'client-token',
      clientDeviceId: 'device-stranger',
      workspaceId: 'ws-1',
      engine: 'codex',
    })).rejects.toMatchObject({ code: 'forbidden' })
  })
})

describe('M3 execute / tail / revoke', () => {
  async function paired() {
    const team = makeTeam()
    team.sessions.set('host-token', sessionFor('user-1', 'device-host', TENANT))
    team.sessions.set('client-token', sessionFor('user-1', 'device-client', TENANT))
    const made = await makeHost(team)
    const { code } = await made.host.issuePairingCode('host-token')
    await made.host.redeemPairingCode({
      code, clientDeviceId: 'device-client', clientDeviceName: 'Laptop', clientToken: 'client-token',
    })
    return { team, ...made }
  }

  it('看 tail、提交一行、中断均生效', async () => {
    const { host, submitLine, interrupt } = await paired()
    await expect(host.getTail('client-token', 'device-client', 'term-1')).resolves.toEqual({ data: 'hello-output', seq: 7 })
    await expect(host.getTail('client-token', 'device-client', 'missing')).rejects.toMatchObject({ code: 'not-found' })

    const bind = await host.execute({
      clientToken: 'client-token', clientDeviceId: 'device-client', command: { type: 'bind', terminalId: 'term-1' },
    })
    expect(bind.ok).toBe(true)

    const follow = await host.execute({
      clientToken: 'client-token', clientDeviceId: 'device-client', command: { type: 'follow-up', text: 'echo hi' },
    })
    expect(follow.ok).toBe(true)
    expect(submitLine).toHaveBeenCalledWith('term-1', 'echo hi')

    const stop = await host.execute({
      clientToken: 'client-token', clientDeviceId: 'device-client', command: { type: 'stop' },
    })
    expect(stop.ok).toBe(true)
    expect(interrupt).toHaveBeenCalledWith('term-1')
  })

  it('未配对设备一律拒绝；设备间绑定隔离', async () => {
    const { host, team } = await paired()
    team.sessions.set('other-token', sessionFor('user-1', 'device-other', TENANT))
    await expect(host.execute({
      clientToken: 'other-token', clientDeviceId: 'device-other', command: { type: 'status' },
    })).rejects.toMatchObject({ code: 'forbidden' })

    // 配对设备 A 绑定后，设备 B（另行配对）看不到 A 的绑定
    team.sessions.set('host-token2', sessionFor('user-1', 'device-host', TENANT))
    const { code } = await host.issuePairingCode('host-token2')
    await host.redeemPairingCode({ code, clientDeviceId: 'device-other', clientToken: 'other-token' })
    await host.execute({
      clientToken: 'client-token', clientDeviceId: 'device-client', command: { type: 'bind', terminalId: 'term-1' },
    })
    const otherFollow = await host.execute({
      clientToken: 'other-token', clientDeviceId: 'device-other', command: { type: 'follow-up', text: 'hi' },
    })
    expect(otherFollow.code).toBe('unbound')
  })

  it('禁用/登出后即时失效', async () => {
    const { host, team } = await paired()
    team.disabledTokens.add('client-token')
    await expect(host.execute({
      clientToken: 'client-token', clientDeviceId: 'device-client', command: { type: 'status' },
    })).rejects.toMatchObject({ code: 'stale-session' })
    await expect(host.getTail('client-token', 'device-client', 'term-1')).rejects.toMatchObject({ code: 'stale-session' })
  })

  it('被控端吊销后立即拒绝', async () => {
    const { host } = await paired()
    await host.revokeDevice('host-token', 'device-client')
    await expect(host.execute({
      clientToken: 'client-token', clientDeviceId: 'device-client', command: { type: 'status' },
    })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('受控销毁终端：配对可杀、未配对拒绝、 missing 报 not-found', async () => {
    const { host, team } = await paired()
    const kill = terminalManager.kill as ReturnType<typeof vi.fn>
    kill.mockClear()
    await expect(host.killTerminal({
      clientToken: 'client-token', clientDeviceId: 'device-client', terminalId: 'term-1',
    })).resolves.toMatchObject({ success: true, terminalId: 'term-1' })
    expect(kill).toHaveBeenCalledWith('term-1')

    team.sessions.set('other-token', sessionFor('user-1', 'device-other', TENANT))
    await expect(host.killTerminal({
      clientToken: 'other-token', clientDeviceId: 'device-other', terminalId: 'term-1',
    })).rejects.toMatchObject({ code: 'forbidden' })

    const getInstance = terminalManager.getInstance as ReturnType<typeof vi.fn>
    getInstance.mockReturnValueOnce(undefined)
    await expect(host.killTerminal({
      clientToken: 'client-token', clientDeviceId: 'device-client', terminalId: 'gone',
    })).rejects.toMatchObject({ code: 'not-found' })

    await expect(host.killTerminal({
      clientToken: 'client-token', clientDeviceId: 'device-client', terminalId: '',
    })).rejects.toMatchObject({ code: 'invalid-request' })
  })

  it('受控同步尺寸：配对可调、未配对拒绝、非法尺寸拒绝', async () => {
    const { host, team } = await paired()
    const { terminalManager: tm } = await import('../../src/main/terminal/manager')
    const resize = tm.resize as ReturnType<typeof vi.fn>
    resize.mockClear()
    await expect(host.resizeTerminal({
      clientToken: 'client-token', clientDeviceId: 'device-client', terminalId: 'term-1', cols: 187, rows: 55,
    })).resolves.toMatchObject({ success: true, terminalId: 'term-1', cols: 187, rows: 55 })
    expect(resize).toHaveBeenCalledWith('term-1', 187, 55)

    team.sessions.set('other-token', sessionFor('user-1', 'device-other', TENANT))
    await expect(host.resizeTerminal({
      clientToken: 'other-token', clientDeviceId: 'device-other', terminalId: 'term-1', cols: 80, rows: 24,
    })).rejects.toMatchObject({ code: 'forbidden' })

    await expect(host.resizeTerminal({
      clientToken: 'client-token', clientDeviceId: 'device-client', terminalId: 'term-1', cols: NaN, rows: 24,
    })).rejects.toMatchObject({ code: 'invalid-request' })

    const getInstance = tm.getInstance as ReturnType<typeof vi.fn>
    getInstance.mockReturnValueOnce(undefined)
    await expect(host.resizeTerminal({
      clientToken: 'client-token', clientDeviceId: 'device-client', terminalId: 'gone', cols: 80, rows: 24,
    })).rejects.toMatchObject({ code: 'not-found' })
  })

  it('回环 RemoteClient 走通配对→tail→发命令', async () => {
    const team = makeTeam()
    team.sessions.set('host-token', sessionFor('user-1', 'device-host', TENANT))
    team.sessions.set('client-token', sessionFor('user-1', 'device-client', TENANT))
    const { host } = await makeHost(team)
    const { code } = await host.issuePairingCode('host-token')

    const client = new RemoteClient({
      connector: createLoopbackConnector(host),
      deviceId: 'device-client',
      deviceName: 'Laptop',
      getToken: async () => 'client-token',
    })
    await client.pair(code)
    expect(client.connectionState).toBe('connected')
    await expect(client.tail('term-1')).resolves.toEqual({ data: 'hello-output', seq: 7 })
    const bind = await client.send({ type: 'bind', terminalId: 'term-1' })
    expect(bind.ok).toBe(true)
  })
})
