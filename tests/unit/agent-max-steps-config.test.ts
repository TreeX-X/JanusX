import { mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

let userData = '.'
vi.mock('electron', () => ({ app: { getPath: () => userData } }))

describe('agent max steps config (P6)', () => {
  beforeAll(async () => {
    userData = await mkdtemp(join(tmpdir(), 'janusx-max-steps-'))
  })

  it('defaults to 40 and clamps updates to 1..100', async () => {
    const { ConfigService, normalizeAgentMaxSteps, DEFAULT_AGENT_MAX_STEPS } = await import('../../src/main/config/service')
    expect(DEFAULT_AGENT_MAX_STEPS).toBe(40)
    expect(normalizeAgentMaxSteps(undefined)).toBe(40)
    expect(normalizeAgentMaxSteps('nope')).toBe(40)
    expect(normalizeAgentMaxSteps(0)).toBe(1)
    expect(normalizeAgentMaxSteps(1000)).toBe(100)
    expect(normalizeAgentMaxSteps(25.7)).toBe(25)
    const service = new ConfigService()
    expect(await service.getAgentMaxSteps()).toBe(40)
    expect(await service.updateAgentMaxSteps(60)).toBe(60)
    expect(await service.getAgentMaxSteps()).toBe(60)
    expect(await service.updateAgentMaxSteps('nope')).toBe(40)
  })

  it('R2: safe compile auto-allow defaults to true and only accepts an explicit true', async () => {
    const { ConfigService, normalizeSafeCompileAutoAllow, DEFAULT_SAFE_COMPILE_AUTO_ALLOW } = await import('../../src/main/config/service')
    expect(DEFAULT_SAFE_COMPILE_AUTO_ALLOW).toBe(true)
    expect(normalizeSafeCompileAutoAllow(undefined)).toBe(true)
    expect(normalizeSafeCompileAutoAllow(true)).toBe(true)
    expect(normalizeSafeCompileAutoAllow(false)).toBe(false)
    expect(normalizeSafeCompileAutoAllow('yes')).toBe(false)
    const service = new ConfigService()
    expect(await service.getSafeCompileAutoAllow()).toBe(true)
    expect(await service.updateSafeCompileAutoAllow(false)).toBe(false)
    expect(await service.getSafeCompileAutoAllow()).toBe(false)
    expect(await service.updateSafeCompileAutoAllow(undefined)).toBe(true)
  })
})
