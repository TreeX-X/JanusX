import { afterEach, describe, expect, it, vi } from 'vitest'
import { FeishuInboundRouter } from '../../src/main/remote-notifications/feishu-inbound/router'
import { configureFeishuCardActionTokenIssuer, configureFeishuWorkspaceActionTokenIssuer } from '../../src/main/remote-notifications/providers/feishu-provider'
import type { FeishuInboundCardAction, FeishuInboundMessage } from '../../src/main/remote-notifications/feishu-inbound/types'
import { mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { CompanionActionTokens } from '../../src/main/companion/action-token'
import { CompanionAuditStore } from '../../src/main/companion/audit-store'
import { CompanionBindingStore } from '../../src/main/companion/binding-store'
import { CompanionDedupe } from '../../src/main/companion/dedupe'
import { CompanionGateway } from '../../src/main/companion/gateway'
import { normalizeFeishuCardAction } from '../../src/main/remote-notifications/feishu-inbound/normalize'

const context = { provider: 'feishu' as const, eventId: 'm-1', operatorOpenId: 'ou-1', chatId: 'oc-1', timestamp: 1_800_000_000_000 }
const discovery: FeishuInboundMessage = { kind: 'message', context, messageId: 'm-1', chatType: 'p2p', mentionedBot: false, mentionKeys: [], text: '/terminals' }
const create: FeishuInboundCardAction = { kind: 'card-action', context: { ...context, eventId: 'card-1' }, messageId: 'card-1', command: { type: 'create-terminal', workspaceId: 'ws-1', engine: 'codex' }, actionToken: 'create-token' }
const workspace = { id: 'ws-1', name: 'Project', path: 'C:/work/project' }

describe('Feishu discovery create refresh flow', () => {
  afterEach(() => { configureFeishuCardActionTokenIssuer(); configureFeishuWorkspaceActionTokenIssuer() })

  it('discovers, creates, and refreshes with a Bind action for the new terminal', async () => {
    configureFeishuCardActionTokenIssuer(() => 'bind-token')
    configureFeishuWorkspaceActionTokenIssuer(() => 'create-token')
    let created = false
    const execute = vi.fn(async (request: { command: { type: string } }) => {
      if (request.command.type === 'create-terminal') { created = true; return { ok: true, code: 'ok', message: 'Terminal created' } }
      return { ok: true, code: 'ok', message: 'listed', data: { workspaces: [workspace], terminals: created ? [{ terminalId: 'term-new', workspaceId: 'ws-1', cwd: workspace.path, engine: 'codex' }] : [] } }
    })
    const sendCard = vi.fn().mockResolvedValue(undefined)
    const router = new FeishuInboundRouter({ execute } as never, { send: vi.fn(), sendCard })
    await router.handle(discovery)
    await router.handle(create)
    expect(sendCard).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(sendCard.mock.calls[1][2])).toContain('term-new')
    expect(JSON.stringify(sendCard.mock.calls[1][2])).toContain('Bind codex (running)')
  })

  it('sends a bounded receipt when refresh listing fails', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const execute = vi.fn().mockResolvedValueOnce({ ok: true, code: 'ok', message: 'created' }).mockResolvedValueOnce({ ok: false, code: 'execution-failed', message: 'failed' })
    await new FeishuInboundRouter({ execute } as never, { send, sendCard: vi.fn() }).handle(create)
    expect(send).toHaveBeenCalledWith('oc-1', 'card-1', expect.stringContaining('discovery refresh failed'))
  })

  it('sends a bounded receipt when initial discovery card delivery fails', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const execute = vi.fn().mockResolvedValue({ ok: true, code: 'ok', message: 'listed', data: { workspaces: [workspace], terminals: [] } })
    await new FeishuInboundRouter({ execute } as never, { send, sendCard: vi.fn().mockRejectedValue(new Error('network')) }).handle(discovery)
    expect(send).toHaveBeenCalledWith('oc-1', 'm-1', expect.stringContaining('discovery card could not be sent'))
  })

  it('binds the created terminal through a real gateway and binding store', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'janusx-flow-'))
    const now = Date.now()
    const tokens = new CompanionActionTokens('z'.repeat(32), () => now)
    const state: any[] = []
    const terminals: any = {
      getTerminal: (id: string) => state.find((item) => item.terminalId === id),
      listTerminals: () => state,
      createTerminal: async () => { state.push({ terminalId: 'term-new', workspaceId: 'ws-1', cwd: workspace.path, engine: 'codex' }); return 'term-new' },
      submitLine: vi.fn(), interrupt: vi.fn(), hasPendingApproval: () => false, respondToApproval: vi.fn(), clearPendingApproval: vi.fn(),
    }
    const bindings = new CompanionBindingStore(join(dir, 'bindings.json'), () => now)
    const gateway = new CompanionGateway({
      policy: () => ({ enabled: true, mode: 'app', allowedOpenIds: ['ou-1'] }), bindings, tokens,
      dedupe: new CompanionDedupe(join(dir, 'dedupe.json'), 60_000, () => now),
      audit: new CompanionAuditStore(join(dir, 'audit.jsonl'), 60_000, () => now), terminals,
      createTerminal: terminals.createTerminal,
      listWorkspaces: async () => [workspace], now: () => now,
    })
    const cards: any[] = []
    const router = new FeishuInboundRouter(gateway, { send: vi.fn().mockResolvedValue(undefined), sendCard: async (_chat, _message, card) => { cards.push(card) } })
    configureFeishuCardActionTokenIssuer((ctx, id, action, exp) => gateway.issueActionToken(ctx, id, action, exp))
    configureFeishuWorkspaceActionTokenIssuer((ctx, id, engine, exp) => gateway.issueWorkspaceActionToken(ctx, id, engine, exp))
    await router.handle({ ...discovery, context: { ...discovery.context, timestamp: now } })
    const createValue = ((cards[0].elements.find((item: any) => item.tag === 'action').actions[0]).value)
    await router.handle(normalizeFeishuCardAction({ messageId: 'create-card', chatId: 'oc-1', operator: { openId: 'ou-1' }, action: { value: createValue } }, () => now)!)
    await router.handle(normalizeFeishuCardAction({ messageId: 'create-card-replay', chatId: 'oc-1', operator: { openId: 'ou-1' }, action: { value: createValue } }, () => now)!)
    expect(state).toHaveLength(1)
    const bindValue = cards[1].elements.flatMap((item: any) => item.actions ?? []).find((item: any) => item.value?.action === 'bind').value
    await router.handle(normalizeFeishuCardAction({ messageId: 'bind-card', chatId: 'oc-1', operator: { openId: 'ou-1' }, action: { value: bindValue } }, () => now)!)
    await expect(bindings.get({ provider: 'feishu', chatId: 'oc-1' })).resolves.toMatchObject({ terminalId: 'term-new' })
  })

  it('sends a bounded receipt when refreshed card delivery fails', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const execute = vi.fn().mockResolvedValueOnce({ ok: true, code: 'ok', message: 'created' }).mockResolvedValueOnce({ ok: true, code: 'ok', message: 'listed', data: { workspaces: [workspace], terminals: [] } })
    await new FeishuInboundRouter({ execute } as never, { send, sendCard: vi.fn().mockRejectedValue(new Error('network')) }).handle(create)
    expect(send).toHaveBeenCalledWith('oc-1', 'card-1', expect.stringContaining('refreshed card could not be sent'))
  })
})
