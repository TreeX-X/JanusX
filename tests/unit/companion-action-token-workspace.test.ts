import { describe, expect, it } from 'vitest'
import { CompanionActionTokens } from '../../src/main/companion/action-token'

describe('workspace action token scope', () => {
  it('binds create tokens to workspace and engine', () => {
    const now = 1_800_000_000_000
    const tokens = new CompanionActionTokens('x'.repeat(32), () => now)
    const token = tokens.issue({ provider: 'feishu', operatorOpenId: 'ou-1', chatId: 'oc-1', workspaceId: 'ws-1', engine: 'codex', action: 'create-terminal', exp: now + 60_000 })
    expect(tokens.verify(token, { provider: 'feishu', operatorOpenId: 'ou-1', chatId: 'oc-1', workspaceId: 'ws-1', engine: 'codex', action: 'create-terminal' })).toMatchObject({ ok: true })
    expect(tokens.verify(token, { provider: 'feishu', operatorOpenId: 'ou-1', chatId: 'oc-1', workspaceId: 'ws-1', engine: 'claude', action: 'create-terminal' })).toEqual({ ok: false, reason: 'token-scope-mismatch' })
  })
})
