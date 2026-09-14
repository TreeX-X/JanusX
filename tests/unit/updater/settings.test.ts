import { describe, expect, it } from 'vitest'
import { DEFAULT_UPDATER_SETTINGS, formatReleaseNotes, normalizeUpdaterSettings } from '../../../src/shared/ipc/updater'

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

describe('formatReleaseNotes', () => {
  it('空输入返回 null', () => {
    expect(formatReleaseNotes(null)).toBeNull()
    expect(formatReleaseNotes(undefined)).toBeNull()
    expect(formatReleaseNotes('')).toBeNull()
    expect(formatReleaseNotes('No content.')).toBe('No content.')
    expect(formatReleaseNotes([])).toBeNull()
    expect(formatReleaseNotes(42)).toBeNull()
  })

  it('HTML 字符串去标签解实体', () => {
    expect(formatReleaseNotes('<h2>0.8.7</h2><ul><li>修复 &amp; 优化</li></ul>')).toBe('0.8.7 修复 & 优化')
  })

  it('分版本数组按行合并，跳过空正文', () => {
    expect(
      formatReleaseNotes([
        { version: '0.8.7', note: '<p>新功能</p>' },
        { version: '0.8.6', note: '' },
        { version: '0.8.5' },
      ]),
    ).toBe('v0.8.7 新功能')
  })

  it('超长截断并保留省略号', () => {
    const long = 'x'.repeat(700)
    const result = formatReleaseNotes(long)
    expect(result?.length).toBe(601)
    expect(result?.endsWith('…')).toBe(true)
  })
})
