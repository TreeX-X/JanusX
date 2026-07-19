import { afterEach, describe, expect, it } from 'vitest'
import { buildFeishuTerminalDiscoveryCard, configureFeishuCardActionTokenIssuer, configureFeishuWorkspaceActionTokenIssuer } from '../../src/main/remote-notifications/providers/feishu-provider'

const context = { provider: 'feishu' as const, operatorOpenId: 'ou-1', chatId: 'oc-1' }

describe('Feishu terminal discovery card', () => {
  afterEach(() => { configureFeishuCardActionTokenIssuer(); configureFeishuWorkspaceActionTokenIssuer() })

  it('shows New controls for a registered workspace with zero terminals', () => {
    configureFeishuWorkspaceActionTokenIssuer((_context, _workspace, engine) => `token-${engine}`)
    const card = buildFeishuTerminalDiscoveryCard([], context, [{ id: 'ws-1', name: 'Project', path: 'C:/work/project' }])
    expect(JSON.stringify(card)).toContain('New codex')
  })

  it('shows running status but no New controls for an unknown workspace', () => {
    configureFeishuCardActionTokenIssuer(() => 'bind-token')
    configureFeishuWorkspaceActionTokenIssuer(() => 'create-token')
    const card = buildFeishuTerminalDiscoveryCard([{ terminalId: 't-1', workspaceId: 'unknown', cwd: 'C:/work/unknown', engine: 'codex' }], context)
    const text = JSON.stringify(card)
    expect(text).toContain('Bind codex (running)')
    expect(text).not.toContain('New codex')
  })
})
