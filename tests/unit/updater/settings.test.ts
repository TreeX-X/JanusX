import { describe, expect, it } from 'vitest'
import { DEFAULT_UPDATER_SETTINGS, normalizeUpdaterSettings } from '../../../src/shared/ipc/updater'

describe('normalizeUpdaterSettings', () => {
  it('缺席与非法输入一律回默认（自动检查开）', () => {
    for (const input of [undefined, null, 0, 'yes', [], true]) {
      expect(normalizeUpdaterSettings(input)).toEqual({ autoCheck: true })
    }
    expect(normalizeUpdaterSettings({})).toEqual({ autoCheck: true })
  })

  it('只有显式 false 关闭，宽容未知字段', () => {
    expect(normalizeUpdaterSettings({ autoCheck: false })).toEqual({ autoCheck: false })
    expect(normalizeUpdaterSettings({ autoCheck: true })).toEqual({ autoCheck: true })
    expect(normalizeUpdaterSettings({ autoCheck: 0 })).toEqual({ autoCheck: false })
    expect(normalizeUpdaterSettings({ autoCheck: false, channel: 'beta' })).toEqual({ autoCheck: false })
  })

  it('不污染默认对象', () => {
    normalizeUpdaterSettings({ autoCheck: false })
    expect(DEFAULT_UPDATER_SETTINGS).toEqual({ autoCheck: true })
  })
})
