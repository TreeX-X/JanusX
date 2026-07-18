import { readFile } from 'fs/promises'
import { describe, expect, it } from 'vitest'

describe('Feishu control settings UI contract', () => {
  it('renders every control field, sanitized status refresh, and safety boundary copy', async () => {
    const source = await readFile('src/renderer/src/components/NotificationSettingsPanel.tsx', 'utf8')
    for (const field of [
      'inboundControlEnabled', 'allowedOpenIds', 'bindingTtlMinutes', 'actionTokenTtlMinutes',
      'auditRetentionDays', 'maxPromptLength', 'groupPromptPrefix',
    ]) expect(source).toContain(field)
    expect(source).toContain('getFeishuControlStatus')
    expect(source).toContain('RefreshIconButton')
    expect(source).toContain('Webhook 仅支持通知')
    expect(source).toContain('不会暴露任意 shell')
    expect(source).toContain('留空表示保留已保存的 secret')
  })

  it('documents platform setup, commands, audit, revocation, and exclusions', async () => {
    const guide = await readFile('docs/06-外部集成/飞书双向控制使用指南.md', 'utf8')
    for (const term of [
      'im:message:send_as_bot', 'im:message.p2p_msg:readonly',
      'im:message.group_at_msg:readonly', 'im.message.receive_v1', 'card.action.trigger',
      '/status', '/bind <terminal-id>', '/unbind', '/stop', '/p <text>',
      'audit.jsonl', '吊销', 'Janus Chat', '任意 shell', 'HTTP 公网回调', 'JanusX 必须保持运行',
    ]) expect(guide).toContain(term)
  })
})
