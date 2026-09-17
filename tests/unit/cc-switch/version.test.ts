import { describe, expect, it } from 'vitest'
import { compareCliVersions, isCliUpdateAvailable } from '../../../src/shared/ipc/cc-switch'
import { fetchLatestVersion } from '../../../src/main/cc-switch/latest'
import { CC_SWITCH_TOOLS } from '../../../src/main/cc-switch/tool-registry'

describe('cli version compare', () => {
  it('orders numeric cores and treats release above prerelease', () => {
    expect(compareCliVersions('1.2.3', '1.2.3')).toBe(0)
    expect(compareCliVersions('1.2.4', '1.2.3')).toBeGreaterThan(0)
    expect(compareCliVersions('1.2.3', '1.10.0')).toBeLessThan(0)
    expect(compareCliVersions('2.0.0', '2.0.0-beta.1')).toBeGreaterThan(0)
  })

  it('only flags strictly-greater latest as an update', () => {
    expect(isCliUpdateAvailable('1.2.3', '1.2.4')).toBe(true)
    expect(isCliUpdateAvailable('1.2.4', '1.2.4')).toBe(false)
    expect(isCliUpdateAvailable('1.2.5', '1.2.4')).toBe(false)
    expect(isCliUpdateAvailable('1.2.3', undefined)).toBe(false)
    expect(isCliUpdateAvailable(undefined, '1.2.4')).toBe(false)
    expect(isCliUpdateAvailable('garbage', '1.2.4')).toBe(false)
  })
})

describe('fetchLatestVersion', () => {
  it('reads the dist-tags endpoint and tolerates failures as unknown', async () => {
    const ok = await fetchLatestVersion(CC_SWITCH_TOOLS.claude, (async () => ({
      ok: true,
      json: async () => ({ latest: '9.9.9' }),
    })) as never)
    expect(ok).toBe('9.9.9')

    const failed = await fetchLatestVersion(CC_SWITCH_TOOLS.claude, (async () => {
      throw new Error('offline')
    }) as never)
    expect(failed).toBeUndefined()

    const dirty = await fetchLatestVersion(CC_SWITCH_TOOLS.claude, (async () => ({
      ok: true,
      json: async () => ({ latest: 'not-a-version' }),
    })) as never)
    expect(dirty).toBeUndefined()
  })
})
