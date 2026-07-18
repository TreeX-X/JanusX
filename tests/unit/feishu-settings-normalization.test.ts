import { describe, expect, it } from 'vitest'
import {
  FEISHU_CONTROL_DEFAULTS,
  FEISHU_CONTROL_LIMITS,
  isValidFeishuGroupPrefix,
  normalizeRemoteNotificationSettings,
  validateFeishuControlConfig,
} from '../../src/shared/notifications'

describe('Feishu control settings normalization', () => {
  it('migrates old outbound-only settings with control disabled and safe defaults', () => {
    const normalized = normalizeRemoteNotificationSettings({
      enabled: true,
      providers: { feishu: {
        enabled: true, mode: 'webhook', webhookUrl: 'https://example.test/hook',
      } as never },
    })
    expect(normalized.providers.feishu).toMatchObject({
      enabled: true,
      mode: 'webhook',
      webhookUrl: 'https://example.test/hook',
      inboundControlEnabled: false,
      allowedOpenIds: [],
      ...FEISHU_CONTROL_DEFAULTS,
    })
  })

  it('deduplicates valid open_ids and clamps every security limit', () => {
    const feishu = normalizeRemoteNotificationSettings({
      providers: { feishu: {
        allowedOpenIds: [' ', 'bad', ' ou_owner ', 'ou_owner', 'ou_second'],
        bindingTtlMinutes: -1,
        actionTokenTtlMinutes: 999,
        auditRetentionDays: 0,
        maxPromptLength: 99_999,
        groupPromptPrefix: '/prompt',
      } as never },
    }).providers.feishu
    expect(feishu.allowedOpenIds).toEqual(['ou_owner', 'ou_second'])
    expect(feishu.bindingTtlMinutes).toBe(FEISHU_CONTROL_LIMITS.bindingTtlMinutes.min)
    expect(feishu.actionTokenTtlMinutes).toBe(FEISHU_CONTROL_LIMITS.actionTokenTtlMinutes.max)
    expect(feishu.auditRetentionDays).toBe(FEISHU_CONTROL_LIMITS.auditRetentionDays.min)
    expect(feishu.maxPromptLength).toBe(FEISHU_CONTROL_LIMITS.maxPromptLength.max)
    expect(feishu.groupPromptPrefix).toBe('/prompt')
  })

  it('rejects unsafe enablement and reserved prefixes', () => {
    const config = normalizeRemoteNotificationSettings().providers.feishu
    config.inboundControlEnabled = true
    expect(validateFeishuControlConfig(config)).toBe('Feishu inbound control requires App mode')
    expect(isValidFeishuGroupPrefix('/status')).toBe(false)
    expect(isValidFeishuGroupPrefix('/Prompt')).toBe(false)
    expect(isValidFeishuGroupPrefix('/prompt')).toBe(true)
  })
})
