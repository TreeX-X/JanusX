import { app } from 'electron'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { ProviderSettings } from '@janusx/llm-core'
import { LLM_CONSUMERS, channelModel, supportsChannel, type AgentModelBinding, type LlmConfiguration, type LlmConsumer } from '../../shared/llm-configuration'
import { llmConfigStore } from './ConfigStore'
import { llmService } from './LlmService'
import { ConnectionProjector } from './connection-projector'
import { SerialQueue } from '../lib/atomic-file'

function fingerprint(provider: ProviderSettings, model: string): string {
  return createHash('sha256').update(JSON.stringify({ provider, model })).digest('hex')
}
class ConfigurationService {
  private queue = new SerialQueue()
  private projector: ConnectionProjector | null = null
  private connections(): ConnectionProjector {
    return this.projector ??= new ConnectionProjector(join(app.getPath('userData'), 'janusx'))
  }
  async get(): Promise<LlmConfiguration> {
    const config = await llmConfigStore.get()
    for (const consumer of LLM_CONSUMERS) {
      const binding = config.bindings[consumer]
      const provider = binding.providerId ? config.providers[binding.providerId] : undefined
      if (binding.mode !== 'provider' || !provider || consumer === 'janus') continue
      binding.needsApply = binding.appliedFingerprint !== fingerprint(provider, binding.modelId || channelModel(provider))
        || !(await this.connections().isCurrent(consumer))
    }
    return config
  }
  async save(provider: ProviderSettings) {
    return this.queue.run(() => llmService.saveSharedProvider(provider))
  }
  async apply(consumer: LlmConsumer, input: AgentModelBinding): Promise<void> {
    return this.queue.run(async () => {
      if (!LLM_CONSUMERS.includes(consumer)) throw new Error('Unknown Agent')
      if (!input || !['provider', 'native', 'unconfigured'].includes(input.mode)) throw new Error('Invalid selection')
      if (input.mode === 'native' && consumer === 'janus') throw new Error('Janus requires an API channel')
      if (input.mode === 'unconfigured' && consumer !== 'janus') throw new Error('Use native configuration for external Agents')
      const config = await llmConfigStore.get()
      const provider = input.mode === 'provider' && input.providerId ? config.providers[input.providerId] : null
      let binding: AgentModelBinding = { mode: input.mode }
      if (input.mode === 'provider') {
        if (!provider || !supportsChannel(consumer, provider)) throw new Error('Channel protocol is incompatible with this Agent')
        const model = (input.modelId || channelModel(provider)).trim()
        if (!model || model.length > 256 || /[\r\n\0]/.test(model)) throw new Error('A valid model ID is required')
        binding = { mode: 'provider', providerId: provider.id, modelId: model, appliedFingerprint: fingerprint(provider, model) }
      }
      const commit = () => llmConfigStore.setBinding(consumer, binding)
      if (consumer === 'janus') await commit()
      else await this.connections().apply(consumer, provider, binding.modelId || '', commit)
    })
  }
}
export const configurationService = new ConfigurationService()
