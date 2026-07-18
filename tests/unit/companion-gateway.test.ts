import { mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CompanionActionTokens } from '../../src/main/companion/action-token'
import { CompanionAuditStore } from '../../src/main/companion/audit-store'
import { CompanionBindingStore } from '../../src/main/companion/binding-store'
import type { CompanionControlPolicy, CompanionRequest } from '../../src/main/companion/contracts'
import { CompanionDedupe } from '../../src/main/companion/dedupe'
import { CompanionGateway } from '../../src/main/companion/gateway'
import type { CompanionTerminalControl } from '../../src/main/companion/terminal-control'

const NOW = 1_800_000_000_000
const SECRET = '0123456789abcdef0123456789abcdef'

function context(overrides: Partial<CompanionRequest['context']> = {}): CompanionRequest['context'] {
  return {
    provider: 'feishu',
    eventId: 'event-1',
    operatorOpenId: 'operator-1',
    chatId: 'chat-1',
    timestamp: NOW,
    ...overrides,
  }
}

describe('CompanionGateway', () => {
  let directory: string
  let policy: CompanionControlPolicy
  let terminals: CompanionTerminalControl
  let submitLine: ReturnType<typeof vi.fn>
  let interrupt: ReturnType<typeof vi.fn>
  let respondToApproval: ReturnType<typeof vi.fn>
  let pendingApproval: boolean
  let gateway: CompanionGateway
  let tokens: CompanionActionTokens
  let dedupePath: string
  let audit: CompanionAuditStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'janusx-companion-'))
    policy = { enabled: true, mode: 'app', allowedOpenIds: ['operator-1'], maxPromptLength: 20 }
    submitLine = vi.fn()
    interrupt = vi.fn()
    respondToApproval = vi.fn(() => { pendingApproval = false })
    pendingApproval = false
    dedupePath = join(directory, 'dedupe.json')
    audit = new CompanionAuditStore(join(directory, 'audit.jsonl'), 60_000, () => NOW)
    terminals = {
      getTerminal: vi.fn((terminalId: string) => terminalId === 'term-1'
        ? { terminalId, engine: 'codex', workspaceId: 'ws-1', cwd: 'C:/repo' }
        : undefined),
      submitLine,
      interrupt,
      hasPendingApproval: vi.fn(() => pendingApproval),
      respondToApproval,
      clearPendingApproval: vi.fn(() => { pendingApproval = false }),
    }
    tokens = new CompanionActionTokens(SECRET, () => NOW)
    gateway = new CompanionGateway({
      policy: () => policy,
      bindings: new CompanionBindingStore(join(directory, 'bindings.json'), () => NOW),
      tokens,
      dedupe: new CompanionDedupe(dedupePath, 60_000, () => NOW),
      audit,
      terminals,
      bindingTtlMs: 10_000,
      now: () => NOW,
    })
  })

  async function execute(command: CompanionRequest['command'], overrides: Partial<CompanionRequest> = {}) {
    return gateway.execute({ context: context(), command, ...overrides })
  }

  async function bind(eventId = 'bind-event') {
    return gateway.execute({ context: context({ eventId }), command: { type: 'bind', terminalId: 'term-1' } })
  }

  it('denies disabled, webhook, malformed, stale, and unauthorized requests before terminal lookup', async () => {
    policy.enabled = false
    expect((await execute({ type: 'status' })).code).toBe('disabled')
    policy = { ...policy, enabled: true, mode: 'webhook' }
    expect((await execute({ type: 'status' }, { context: context({ eventId: 'event-2' }) })).code).toBe('disabled')
    policy = { ...policy, mode: 'app' }
    expect((await execute({ type: 'status' }, { context: context({ eventId: '' }) })).code).toBe('invalid-request')
    expect((await execute({ type: 'status' }, { context: context({ eventId: 'event-3', timestamp: 0 }) })).code).toBe('invalid-request')
    expect((await execute({ type: 'status' }, { context: context({ eventId: 'event-4', operatorOpenId: 'other' }) })).code).toBe('unauthorized')
    expect(terminals.getTerminal).not.toHaveBeenCalled()
  })

  it('requires an explicit live CLI target and persists an exact chat/thread binding', async () => {
    expect((await execute({ type: 'bind', terminalId: 'missing' })).code).toBe('invalid-target')
    expect((await bind()).ok).toBe(true)

    const reloaded = new CompanionBindingStore(join(directory, 'bindings.json'), () => NOW)
    await expect(reloaded.get(context({ threadId: 'thread-1' }))).resolves.toBeNull()
    await expect(reloaded.get(context())).resolves.toMatchObject({ terminalId: 'term-1', createdBy: 'operator-1' })
  })

  it('never routes without a binding and removes stale terminal bindings', async () => {
    expect((await execute({ type: 'follow-up', text: 'hello' })).code).toBe('unbound')
    expect(submitLine).not.toHaveBeenCalled()
    await bind()
    vi.mocked(terminals.getTerminal).mockReturnValue(undefined)
    expect((await execute({ type: 'status' }, { context: context({ eventId: 'status-2' }) })).code).toBe('terminal-unavailable')
    vi.mocked(terminals.getTerminal).mockReturnValue({ terminalId: 'term-1', engine: 'codex', workspaceId: 'ws', cwd: 'C:/repo' })
    expect((await execute({ type: 'status' }, { context: context({ eventId: 'status-3' }) })).data).toEqual({ bound: false })
  })

  it('rejects expired bindings deterministically', async () => {
    const expiredStore = new CompanionBindingStore(join(directory, 'expired.json'), () => NOW)
    await expiredStore.bind({ provider: 'feishu', chatId: 'chat-1', terminalId: 'term-1', createdBy: 'operator-1', createdAt: NOW - 20, expiresAt: NOW - 1 })
    gateway = new CompanionGateway({
      policy: () => policy, bindings: expiredStore, tokens,
      dedupe: new CompanionDedupe(join(directory, 'expired-dedupe.json'), 60_000, () => NOW),
      audit: new CompanionAuditStore(join(directory, 'expired-audit.jsonl'), 60_000, () => NOW), terminals, now: () => NOW,
    })
    expect((await execute({ type: 'stop' })).code).toBe('expired-binding')
    expect(interrupt).not.toHaveBeenCalled()
  })

  it('normalizes and submits exactly one valid line while rejecting unsafe prompts', async () => {
    await bind()
    expect((await execute({ type: 'follow-up', text: '  hello  ' }, { context: context({ eventId: 'follow-1' }) })).ok).toBe(true)
    expect(submitLine).toHaveBeenCalledOnce()
    expect(submitLine).toHaveBeenCalledWith('term-1', 'hello')
    for (const [eventId, text] of [['empty', '   '], ['control', 'a\nb'], ['large', 'x'.repeat(21)]]) {
      expect((await execute({ type: 'follow-up', text }, { context: context({ eventId }) })).code).toBe('invalid-prompt')
    }
    expect(submitLine).toHaveBeenCalledOnce()
  })

  it('interrupts only the bound terminal and guards approval/rejection with pending state', async () => {
    await bind()
    expect((await execute({ type: 'stop' }, { context: context({ eventId: 'stop-1' }) })).ok).toBe(true)
    expect(interrupt).toHaveBeenCalledWith('term-1')
    expect((await execute({ type: 'approve' }, { context: context({ eventId: 'approve-1' }) })).code).toBe('approval-not-pending')
    pendingApproval = true
    expect((await execute({ type: 'reject' }, { context: context({ eventId: 'reject-1' }) })).ok).toBe(true)
    expect(respondToApproval).toHaveBeenCalledWith('term-1', false)
  })

  it('authenticates action tokens and rejects tampering, expiry, scope mismatch, and replay', async () => {
    await bind()
    const token = gateway.issueActionToken(context(), 'term-1', 'stop', NOW + 10_000)
    expect((await execute({ type: 'stop' }, { context: context({ eventId: 'token-1' }), actionToken: `${token}x` })).code).toBe('invalid-token')
    const expired = gateway.issueActionToken(context(), 'term-1', 'stop', NOW)
    expect((await execute({ type: 'stop' }, { context: context({ eventId: 'token-2' }), actionToken: expired })).code).toBe('expired-token')
    const wrongScope = gateway.issueActionToken({ ...context(), chatId: 'other' }, 'term-1', 'stop', NOW + 10_000)
    expect((await execute({ type: 'stop' }, { context: context({ eventId: 'token-3' }), actionToken: wrongScope })).code).toBe('token-scope-mismatch')
    expect((await execute({ type: 'stop' }, { context: context({ eventId: 'token-4' }), actionToken: token })).ok).toBe(true)
    expect((await execute({ type: 'stop' }, { context: context({ eventId: 'token-5' }), actionToken: token })).code).toBe('token-replayed')
    expect(interrupt).toHaveBeenCalledOnce()
  })

  it('rejects cross-actor card tokens for bind, stop, approve, and reject', async () => {
    policy = { ...policy, allowedOpenIds: ['operator-1', 'operator-2'] }
    const otherActor = (eventId: string) => context({ eventId, operatorOpenId: 'operator-2' })

    const bindToken = gateway.issueActionToken(context(), 'term-1', 'bind', NOW + 10_000)
    expect((await gateway.execute({
      context: otherActor('actor-bind'),
      command: { type: 'bind', terminalId: 'term-1' },
      actionToken: bindToken,
    })).code).toBe('token-scope-mismatch')

    await bind('actor-owner-bind')
    for (const action of ['stop', 'approve', 'reject'] as const) {
      const token = gateway.issueActionToken(context(), 'term-1', action, NOW + 10_000)
      expect((await gateway.execute({
        context: otherActor(`actor-${action}`),
        command: { type: action },
        actionToken: token,
      })).code).toBe('token-scope-mismatch')
    }
    expect(interrupt).not.toHaveBeenCalled()
    expect(respondToApproval).not.toHaveBeenCalled()
  })

  it('does not let a tampered unbind action token remove a binding', async () => {
    await bind()
    const token = gateway.issueActionToken(context(), 'term-1', 'unbind', NOW + 10_000)
    expect((await execute({ type: 'unbind' }, { context: context({ eventId: 'unbind-1' }), actionToken: `${token}x` })).code).toBe('invalid-token')
    expect((await execute({ type: 'status' }, { context: context({ eventId: 'unbind-status' }) })).data).toMatchObject({ bound: true })
  })

  it('replays deterministic event receipts without repeating side effects', async () => {
    await bind()
    const request = { context: context({ eventId: 'same-event' }), command: { type: 'stop' } as const }
    expect((await gateway.execute(request)).replayed).toBeUndefined()
    expect((await gateway.execute(request)).replayed).toBe(true)
    expect(interrupt).toHaveBeenCalledOnce()
  })

  it('reloads event receipts after restart without repeating side effects', async () => {
    await bind()
    const request = { context: context({ eventId: 'restart-event' }), command: { type: 'stop' } as const }
    expect((await gateway.execute(request)).ok).toBe(true)

    gateway = new CompanionGateway({
      policy: () => policy,
      bindings: new CompanionBindingStore(join(directory, 'bindings.json'), () => NOW),
      tokens,
      dedupe: new CompanionDedupe(dedupePath, 60_000, () => NOW),
      audit: new CompanionAuditStore(join(directory, 'audit.jsonl'), 60_000, () => NOW),
      terminals,
      now: () => NOW,
    })

    expect(await gateway.execute(request)).toMatchObject({ ok: true, replayed: true })
    expect(interrupt).toHaveBeenCalledOnce()
  })

  it('reloads consumed action tokens after restart', async () => {
    await bind()
    const token = gateway.issueActionToken(context(), 'term-1', 'stop', NOW + 10_000)
    expect((await execute({ type: 'stop' }, {
      context: context({ eventId: 'token-before-restart' }),
      actionToken: token,
    })).ok).toBe(true)

    gateway = new CompanionGateway({
      policy: () => policy,
      bindings: new CompanionBindingStore(join(directory, 'bindings.json'), () => NOW),
      tokens,
      dedupe: new CompanionDedupe(dedupePath, 60_000, () => NOW),
      audit: new CompanionAuditStore(join(directory, 'audit.jsonl'), 60_000, () => NOW),
      terminals,
      now: () => NOW,
    })

    expect((await gateway.execute({
      context: context({ eventId: 'token-after-restart' }),
      command: { type: 'stop' },
      actionToken: token,
    })).code).toBe('token-replayed')
    expect(interrupt).toHaveBeenCalledOnce()
  })

  it('rejects an event id collision from a different command scope', async () => {
    await bind()
    const original = { context: context({ eventId: 'collision' }), command: { type: 'status' } as const }
    const collision = { context: context({ eventId: 'collision' }), command: { type: 'stop' } as const }
    const originalResult = await gateway.execute(original)
    expect(originalResult.ok).toBe(true)
    expect((await gateway.execute(collision)).code).toBe('invalid-request')
    expect(interrupt).not.toHaveBeenCalled()

    const records = (await readFile(join(directory, 'audit.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line))
    expect(records).toContainEqual(expect.objectContaining({
      phase: 'outcome', command: 'stop', decision: 'deny', outcome: 'invalid-request',
    }))
    expect(await gateway.execute(original)).toMatchObject({ ...originalResult, replayed: true })

    vi.spyOn(audit, 'record').mockRejectedValueOnce(new Error('disk unavailable'))
    expect((await gateway.execute(collision)).code).toBe('execution-failed')
    expect(await gateway.execute(original)).toMatchObject({ ...originalResult, replayed: true })
    expect(interrupt).not.toHaveBeenCalled()
  })

  it('rejects an event id collision with different same-command content', async () => {
    await bind()
    const first = { context: context({ eventId: 'prompt-collision' }), command: { type: 'follow-up', text: 'first' } as const }
    const collision = { context: context({ eventId: 'prompt-collision' }), command: { type: 'follow-up', text: 'second' } as const }
    expect((await gateway.execute(first)).ok).toBe(true)
    expect((await gateway.execute(collision)).code).toBe('invalid-request')
    expect(submitLine).toHaveBeenCalledOnce()

    const records = (await readFile(join(directory, 'audit.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line))
    expect(records).toContainEqual(expect.objectContaining({
      phase: 'outcome', command: 'follow-up', decision: 'deny', outcome: 'invalid-request',
      prompt: expect.objectContaining({ preview: 'second' }),
    }))
    expect(await gateway.execute(first)).toMatchObject({ ok: true, replayed: true })
    expect(submitLine).toHaveBeenCalledOnce()
  })

  it('coalesces concurrent duplicate deliveries into one side effect', async () => {
    await bind()
    const request = { context: context({ eventId: 'concurrent-event' }), command: { type: 'stop' } as const }
    const [first, duplicate] = await Promise.all([gateway.execute(request), gateway.execute(request)])
    expect(first.ok).toBe(true)
    expect(duplicate).toMatchObject({ ok: true, replayed: true })
    expect(interrupt).toHaveBeenCalledOnce()
  })

  it('writes redacted prompt audit records and prunes expired records', async () => {
    await writeFile(join(directory, 'audit.jsonl'), `${JSON.stringify({ timestamp: NOW - 60_001 })}\n`)
    await bind()
    const prompt = 'sensitive prompt value'
    await execute({ type: 'follow-up', text: prompt }, { context: context({ eventId: 'audit-follow' }) })
    const records = (await readFile(join(directory, 'audit.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line))
    expect(records.some((record) => record.timestamp === NOW - 60_001)).toBe(false)
    const follow = records.find((record) => record.command === 'follow-up')
    expect(follow.prompt).toMatchObject({ preview: prompt, length: prompt.length })
    expect(follow.prompt.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(follow)).not.toContain('actionToken')
  })

  it('serializes concurrent binding mutations without losing state', async () => {
    const filePath = join(directory, 'concurrent-bindings.json')
    const store = new CompanionBindingStore(filePath, () => NOW)
    const bindings = Array.from({ length: 20 }, (_, index) => ({
      provider: 'feishu' as const,
      chatId: `chat-${index}`,
      terminalId: 'term-1',
      createdBy: 'operator-1',
      createdAt: NOW,
      expiresAt: NOW + 10_000,
    }))

    await Promise.all(bindings.map((binding) => store.bind(binding)))
    const reloaded = new CompanionBindingStore(filePath, () => NOW)
    await Promise.all(bindings.map(async (binding) => {
      await expect(reloaded.get(binding)).resolves.toMatchObject(binding)
    }))
  })

  it('serializes retention compaction and concurrent audit appends', async () => {
    const filePath = join(directory, 'concurrent-audit.jsonl')
    await writeFile(filePath, `${JSON.stringify({ timestamp: NOW - 60_001 })}\n`)
    const store = new CompanionAuditStore(filePath, 60_000, () => NOW)
    const requests = Array.from({ length: 20 }, (_, index) => store.record(
      context({ eventId: `audit-${index}`, chatId: `chat-${index}` }),
      { type: 'status' },
      { ok: true, code: 'ok', message: 'ok' },
    ))

    await Promise.all(requests)
    const records = (await readFile(filePath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line))
    expect(records).toHaveLength(40)
    expect(new Set(records.map((record) => record.auditId))).toHaveLength(20)
    expect(records.some((record) => record.timestamp === NOW - 60_001)).toBe(false)
  })

  it('does not execute when audit intent fails and does not repeat after outcome failure', async () => {
    const audit = new CompanionAuditStore(join(directory, 'failure-audit.jsonl'), 60_000, () => NOW)
    gateway = new CompanionGateway({
      policy: () => policy,
      bindings: new CompanionBindingStore(join(directory, 'bindings.json'), () => NOW),
      tokens,
      dedupe: new CompanionDedupe(join(directory, 'failure-dedupe.json'), 60_000, () => NOW),
      audit,
      terminals,
      now: () => NOW,
    })
    await bind('failure-bind')

    vi.spyOn(audit, 'begin').mockRejectedValueOnce(new Error('disk unavailable'))
    expect((await execute({ type: 'stop' }, { context: context({ eventId: 'intent-failure' }) })).code).toBe('execution-failed')
    expect(interrupt).not.toHaveBeenCalled()

    vi.spyOn(audit, 'complete').mockRejectedValueOnce(new Error('disk unavailable'))
    const request = { context: context({ eventId: 'outcome-failure' }), command: { type: 'stop' } as const }
    expect((await gateway.execute(request)).code).toBe('execution-failed')
    expect((await gateway.execute(request))).toMatchObject({ code: 'execution-failed', replayed: true })
    expect(interrupt).toHaveBeenCalledOnce()
  })
})
