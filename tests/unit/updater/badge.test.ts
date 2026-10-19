import { describe, expect, it } from 'vitest'
import type { UpdaterState } from '../../../src/shared/ipc/updater'
import { applyUpdaterEvent, resolveUpdaterBadge } from '../../../src/renderer/src/lib/updater-badge'

const BASE: UpdaterState = {
  phase: 'idle',
  supported: true,
  unsupportedReason: null,
  currentVersion: '0.8.6',
  availableVersion: null,
  downloadPercent: null,
  releaseNotes: null,
  error: null,
}

describe('resolveUpdaterBadge', () => {
  it('无动作价值时不打扰', () => {
    expect(resolveUpdaterBadge(null)).toBeNull()
    for (const phase of ['idle', 'checking', 'up-to-date', 'error'] as const) {
      expect(resolveUpdaterBadge({ ...BASE, phase })).toBeNull()
    }
    expect(resolveUpdaterBadge({ ...BASE, phase: 'downloaded', supported: false })).toBeNull()
    expect(resolveUpdaterBadge({ ...BASE, phase: 'unsupported' })).toBeNull()
    expect(resolveUpdaterBadge({ ...BASE, phase: 'error', availableVersion: '0.8.7' })).toEqual({ kind: 'available', version: '0.8.7', percent: null })
  })

  it('有新版动作时出现并携带展示字段', () => {
    expect(resolveUpdaterBadge({ ...BASE, phase: 'available', availableVersion: '0.8.7' })).toEqual({
      kind: 'available',
      version: '0.8.7',
      percent: null,
    })
    expect(
      resolveUpdaterBadge({ ...BASE, phase: 'downloading', availableVersion: '0.8.7', downloadPercent: 42 }),
    ).toEqual({ kind: 'downloading', version: '0.8.7', percent: 42 })
    expect(resolveUpdaterBadge({ ...BASE, phase: 'downloaded', availableVersion: '0.8.7' })).toEqual({
      kind: 'downloaded',
      version: '0.8.7',
      percent: 100,
    })
  })
})

describe('applyUpdaterEvent', () => {
  it('首次事件包含完整的版本、进度和说明，不依赖旧快照', () => {
    const state = { ...BASE, phase: 'downloaded' as const, availableVersion: '0.8.7', downloadPercent: 100, releaseNotes: 'New release' }
    expect(applyUpdaterEvent(null, { type: 'state', state })).toEqual(state)
    expect(applyUpdaterEvent(BASE, { type: 'state', state })).toEqual(state)
  })

  it('无新版清掉残留版本与进度', () => {
    const next = applyUpdaterEvent(
      { ...BASE, phase: 'downloading', availableVersion: '0.8.7', downloadPercent: 42 },
      { type: 'state', state: { ...BASE, phase: 'up-to-date' } },
    )
    expect(next.phase).toBe('up-to-date')
    expect(next.availableVersion).toBeNull()
    expect(next.downloadPercent).toBeNull()
  })
})
