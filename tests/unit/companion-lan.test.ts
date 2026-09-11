import { mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CompanionActionTokens } from '../../src/main/companion/action-token'
import { CompanionAuditStore } from '../../src/main/companion/audit-store'
import { CompanionBindingStore } from '../../src/main/companion/binding-store'
import type { CompanionControlPolicy, CompanionRequest } from '../../src/main/companion/contracts'
import { CompanionDedupe } from '../../src/main/companion/dedupe'
import { CompanionGateway } from '../../src/main/companion/gateway'
import { LanPairingCodes } from '../../src/main/companion/lan-pairing'
import type { CompanionTerminalControl } from '../../src/main/companion/terminal-control'

const NOW = 1_800_000_000_000
const SECRET = '0123456789abcdef0123456789abcdef'
const DEVICE = '11111111-2222-4333-8444-555555555555'

describe('LanPairingCodes', () => {
  it('issues unambiguous 5-char codes that redeem exactly once', () => {
    let now = NOW
    const pairing = new LanPairingCodes(() => now)
    const first = pairing.issue('host-1', 'Desktop')
    const second = pairing.issue('host-1', 'Desktop')
    expect(first.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/)
    expect(second.code).not.toBe(first.code)
    expect(pairing.pending()).toBe(2)

    const redeemed = pairing.redeem(`  ${first.code.toLowerCase()} `, 'client-9')
    expect(redeemed.ok).toBe(true)
    if (redeemed.ok) {
      expect(redeemed.pairing.hostDeviceId).toBe('host-1')
      expect(redeemed.pairing.redeemedByDeviceId).toBe('client-9')
    }
    expect(pairing.pending()).toBe(1)
    expect(pairing.redeem(first.code, 'client-10')).toEqual({ ok: false, reason: 'redeemed-code' })
  })

  it('rejects unknown and expired codes', () => {
    let now = NOW
    const pairing = new LanPairingCodes(() => now, 60_000)
    expect(pairing.redeem('ZZZZZ', 'client-1')).toEqual({ ok: false, reason: 'unknown-code' })

    const { code } = pairing.issue('host-1', 'Desktop')
    now += 60_001
    expect(pairing.redeem(code, 'client-1')).toEqual({ ok: false, reason: 'expired-code' })
    expect(pairing.pending()).toBe(0)
  })
})

describe('CompanionGateway lan provider', () => {
  let directory: string
  let policy: CompanionControlPolicy
  let gateway: CompanionGateway

  function lanContext(overrides: Partial<CompanionRequest['context']> = {}): CompanionRequest['context'] {
    return {
      provider: 'lan',
      eventId: 'lan-event-1',
      operatorOpenId: DEVICE,
      deviceId: DEVICE,
      chatId: `lan:${DEVICE}`,
      timestamp: NOW,
      ...overrides,
    }
  }

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'janusx-companion-lan-'))
    policy = { enabled: true, mode: 'app', allowedOpenIds: [DEVICE] }
    const terminals: CompanionTerminalControl = {
      getTerminal: vi.fn((terminalId: string) => terminalId === 'term-1'
        ? { terminalId, engine: 'codex', workspaceId: 'ws-1', cwd: 'C:/repo' }
        : undefined),
      submitLine: vi.fn(),
      interrupt: vi.fn(),
      hasPendingApproval: vi.fn(() => false),
      respondToApproval: vi.fn(),
      clearPendingApproval: vi.fn(),
    }
    gateway = new CompanionGateway({
      policy: () => policy,
      bindings: new CompanionBindingStore(join(directory, 'bindings.json'), () => NOW),
      tokens: new CompanionActionTokens(SECRET, () => NOW),
      dedupe: new CompanionDedupe(join(directory, 'dedupe.json'), 60_000, () => NOW),
      audit: new CompanionAuditStore(join(directory, 'audit.jsonl'), 60_000, () => NOW),
      terminals,
      bindingTtlMs: 10_000,
      now: () => NOW,
    })
  })

  it('serves paired devices through the allowlist and keeps feishu rules intact', async () => {
    const status = await gateway.execute({ context: lanContext(), command: { type: 'status' } })
    expect(status.code).toBe('ok')

    const bind = await gateway.execute({
      context: lanContext({ eventId: 'lan-event-2' }),
      command: { type: 'bind', terminalId: 'term-1' },
    })
    expect(bind.ok).toBe(true)
    const bound = await gateway.execute({
      context: lanContext({ eventId: 'lan-event-3' }),
      command: { type: 'status' },
    })
    expect(bound.data).toMatchObject({ bound: true })

    const foreign = await gateway.execute({
      context: lanContext({ eventId: 'lan-event-4', operatorOpenId: 'stranger', deviceId: 'stranger' }),
      command: { type: 'status' },
    })
    expect(foreign.code).toBe('unauthorized')

    const missingIdentity = await gateway.execute({
      context: lanContext({ eventId: 'lan-event-5', deviceId: undefined }),
      command: { type: 'status' },
    })
    expect(missingIdentity.code).toBe('invalid-request')

    const mismatchedIdentity = await gateway.execute({
      context: lanContext({ eventId: 'lan-event-6', deviceId: 'other-device' }),
      command: { type: 'status' },
    })
    expect(mismatchedIdentity.code).toBe('invalid-request')
  })
})
