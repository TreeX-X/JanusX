import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyLlmConfig } from '../../../src/main/llm/config-document'
import { authTypeForProtocol, type LlmConfiguration } from '../../../src/shared/llm-configuration'
const fake = vi.hoisted(() => ({
  get: vi.fn(), setBinding: vi.fn(), save: vi.fn(), apply: vi.fn(), isCurrent: vi.fn(),
}))
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
vi.mock('../../../src/main/llm/ConfigStore', () => ({ llmConfigStore: fake }))
vi.mock('../../../src/main/llm/LlmService', () => ({ llmService: { saveSharedProvider: fake.save } }))
vi.mock('../../../src/main/llm/connection-projector', () => ({
  ConnectionProjector: class { apply = fake.apply; isCurrent = fake.isCurrent },
}))
const { configurationService } = await import('../../../src/main/llm/configuration-service')
let config: LlmConfiguration
beforeEach(() => {
  vi.clearAllMocks()
  config = emptyLlmConfig()
  config.providers.relay = { id: 'relay', name: 'Relay', authType: authTypeForProtocol('openai'), modelId: 'model-a' }
  fake.get.mockImplementation(async () => structuredClone(config))
  fake.setBinding.mockImplementation(async (consumer, binding) => { config.bindings[consumer as keyof typeof config.bindings] = binding })
  fake.apply.mockImplementation(async (_consumer, _provider, _model, commit) => commit())
  fake.isCurrent.mockResolvedValue(true)
})
describe('shared configuration application', () => {
  it('rejects protocol mismatches before writing files or changing selections', async () => {
    await expect(configurationService.apply('codex', { mode: 'provider', providerId: 'relay', modelId: 'model-a' })).rejects.toThrow('incompatible')
    expect(fake.apply).not.toHaveBeenCalled()
    expect(fake.setBinding).not.toHaveBeenCalled()
  })
  it('keeps the previous selection on a failed external write', async () => {
    fake.apply.mockRejectedValueOnce(new Error('write failed'))
    await expect(configurationService.apply('pi', { mode: 'provider', providerId: 'relay', modelId: 'model-b' })).rejects.toThrow('write failed')
    expect(config.bindings.pi).toEqual({ mode: 'native' })
    expect(fake.setBinding).not.toHaveBeenCalled()
  })
  it('marks edited channels and externally changed files as needing reapplication', async () => {
    await configurationService.apply('pi', { mode: 'provider', providerId: 'relay', modelId: 'model-b' })
    expect((await configurationService.get()).bindings.pi.needsApply).toBe(false)
    config.providers.relay!.apiKey = 'rotated-key'
    expect((await configurationService.get()).bindings.pi.needsApply).toBe(true)
    await configurationService.apply('pi', { mode: 'provider', providerId: 'relay', modelId: 'model-b' })
    fake.isCurrent.mockResolvedValue(false)
    expect((await configurationService.get()).bindings.pi.needsApply).toBe(true)
  })
  it('uses independent model choices and keeps Janus entirely internal', async () => {
    await configurationService.apply('janus', { mode: 'provider', providerId: 'relay', modelId: 'model-a' })
    expect(fake.apply).not.toHaveBeenCalled()
    await configurationService.apply('pi', { mode: 'provider', providerId: 'relay', modelId: 'model-b' })
    expect(config.bindings.janus.modelId).toBe('model-a')
    expect(config.bindings.pi.modelId).toBe('model-b')
    await configurationService.apply('pi', { mode: 'native' })
    expect(fake.apply).toHaveBeenLastCalledWith('pi', null, '', expect.any(Function))
  })
})
