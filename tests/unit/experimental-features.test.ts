import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EXPERIMENTAL_FEATURES,
  EXPERIMENTAL_CHANNELS,
  normalizeExperimentalFeatures,
} from '../../src/shared/ipc/experimental'

describe('experimental feature flags', () => {
  it('defaults all five entries to off (hidden by default)', () => {
    expect(DEFAULT_EXPERIMENTAL_FEATURES).toEqual({
      knowledge: false,
      roundtable: false,
      persona: false,
      remoteControl: false,
      teamCollab: false,
    })
  })

  it('exposes stable get/update channels', () => {
    expect(EXPERIMENTAL_CHANNELS.get).toBe('experimental:get')
    expect(EXPERIMENTAL_CHANNELS.update).toBe('experimental:update')
  })

  it('falls back to defaults for missing or malformed input', () => {
    expect(normalizeExperimentalFeatures(undefined)).toEqual(DEFAULT_EXPERIMENTAL_FEATURES)
    expect(normalizeExperimentalFeatures(null)).toEqual(DEFAULT_EXPERIMENTAL_FEATURES)
    expect(normalizeExperimentalFeatures('yes')).toEqual(DEFAULT_EXPERIMENTAL_FEATURES)
    expect(normalizeExperimentalFeatures({})).toEqual(DEFAULT_EXPERIMENTAL_FEATURES)
  })

  it('keeps each flag independent and coerces to strict boolean', () => {
    expect(normalizeExperimentalFeatures({ knowledge: true })).toEqual({
      knowledge: true,
      roundtable: false,
      persona: false,
      remoteControl: false,
      teamCollab: false,
    })
    expect(normalizeExperimentalFeatures({ roundtable: 1, persona: 'true' })).toEqual({
      knowledge: false,
      roundtable: false,
      persona: false,
      remoteControl: false,
      teamCollab: false,
    })
    expect(normalizeExperimentalFeatures({ remoteControl: true })).toEqual({
      knowledge: false,
      roundtable: false,
      persona: false,
      remoteControl: true,
      teamCollab: false,
    })
    expect(normalizeExperimentalFeatures({ remoteControl: 1 })).toEqual({
      knowledge: false,
      roundtable: false,
      persona: false,
      remoteControl: false,
      teamCollab: false,
    })
    expect(normalizeExperimentalFeatures({ teamCollab: true })).toEqual({
      knowledge: false,
      roundtable: false,
      persona: false,
      remoteControl: false,
      teamCollab: true,
    })
    expect(normalizeExperimentalFeatures({ teamCollab: 1 })).toEqual({
      knowledge: false,
      roundtable: false,
      persona: false,
      remoteControl: false,
      teamCollab: false,
    })
  })
})
