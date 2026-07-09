import { describe, expect, it } from 'vitest'
import {
  getAllAiModels,
  matchAiModel,
  openRouterRecordToRegistryEntry,
  registryEntryToModelInfo
} from '../src/registry/model-registry'

describe('model registry', () => {
  it('converts OpenRouter records into registry entries', () => {
    const entry = openRouterRecordToRegistryEntry({
      id: 'openai/gpt-4.1-mini',
      name: 'GPT-4.1 Mini',
      created: 1744560000,
      context_length: 128000,
      top_provider: {
        context_length: 1047576,
        max_completion_tokens: 32768
      },
      architecture: {
        input_modalities: ['text', 'image'],
        output_modalities: ['text'],
        tokenizer: 'o200k_base'
      },
      supported_parameters: ['tools', 'tool_choice'],
      pricing: {
        prompt: '0.0000004',
        completion: '0.0000016'
      }
    })

    expect(entry).toBeDefined()
    expect(entry?.providerAuthor).toBe('openai')
    expect(entry?.contextLength).toBe(128000)
    expect(entry?.providerContextLength).toBe(1047576)
    expect(entry?.effectiveContextWindow).toBe(1047576)
    expect(entry?.maxOutputTokens).toBe(32768)
    expect(entry?.aliases).toContain('gpt-4.1-mini')
    expect(entry?.normalizedKeys).toContain('gpt 4 1 mini')
  })

  it('matches model aliases without provider prefixes or free suffixes', () => {
    const model = openRouterRecordToRegistryEntry({
      id: 'deepseek/deepseek-chat-v3-0324:free',
      name: 'DeepSeek Chat v3 0324',
      created: 1742774400,
      context_length: 163840
    })

    expect(model).toBeDefined()
    const result = matchAiModel('deepseek-chat-v3-0324', model ? [model] : [])

    expect(result.match?.id).toBe('deepseek/deepseek-chat-v3-0324:free')
    expect(result.confidence).toBe('high')
  })

  it('keeps low confidence fuzzy matches from being applied automatically', () => {
    const sonnet = openRouterRecordToRegistryEntry({
      id: 'anthropic/claude-sonnet-4',
      name: 'Claude Sonnet 4',
      created: 1747872000,
      context_length: 200000
    })
    const haiku = openRouterRecordToRegistryEntry({
      id: 'anthropic/claude-3.5-haiku',
      name: 'Claude 3.5 Haiku',
      created: 1730332800,
      context_length: 200000
    })

    const result = matchAiModel('claude', [sonnet, haiku].filter(Boolean) as NonNullable<typeof sonnet>[])

    expect(result.match).toBeNull()
    expect(result.confidence).toBe('low')
    expect(result.candidates.length).toBeGreaterThan(0)
  })

  it('exports generated OpenRouter models as ModelInfo records', () => {
    const registryModels = getAllAiModels()
    expect(registryModels.length).toBeGreaterThan(0)

    const modelInfo = registryEntryToModelInfo(registryModels[0]!, 'openai-compatible')
    expect(modelInfo.providerId).toBe('openai-compatible')
    expect(modelInfo.contextWindow).toBeGreaterThan(0)
  })
})
