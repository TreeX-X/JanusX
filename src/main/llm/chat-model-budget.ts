import { matchAiModel, type AiModelRegistryEntry } from '@janusx/llm-core'
import { validChatModelLimits, type ChatModelBudget } from '../../shared/chat-model-limits'
export type { ChatModelBudget } from '../../shared/chat-model-limits'
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1024 && value <= 10_000_000

// Note: automatic limits precede manual fallback — see .agents/notes/agent/model-registry.md
export function resolveChatModelBudget(modelId: string, listed?: { contextWindow?: number; maxOutputTokens?: number }, extra?: Record<string, unknown>, metadata?: AiModelRegistryEntry): ChatModelBudget {
  const match = matchAiModel(modelId)
  const known = match.confidence === 'exact' || match.confidence === 'high' ? match.match : null
  const candidates = [
    { contextWindow: metadata?.effectiveContextWindow, maxOutputTokens: metadata?.maxOutputTokens, source: 'registry' as const },
    { ...listed, source: 'catalog' as const },
    { contextWindow: known?.effectiveContextWindow, maxOutputTokens: known?.maxOutputTokens, source: 'registry' as const },
  ]
  for (const candidate of candidates) if (validChatModelLimits(candidate)) return {
    contextWindow: candidate.contextWindow, maxOutputTokens: candidate.maxOutputTokens, source: candidate.source, resolved: true,
  }
  const configured = (extra?.chatModelLimits as Record<string, unknown> | undefined)?.[modelId]
  if (validChatModelLimits(configured)) return { contextWindow: configured.contextWindow, maxOutputTokens: configured.maxOutputTokens, source: 'configured', resolved: true }
  // Estimates remain available for legacy hosts; production rejects unresolved limits before inference.
  const contextWindow = candidates.find(candidate => positive(candidate.contextWindow))?.contextWindow ?? 16_384
  return { contextWindow, maxOutputTokens: Math.min(4096, Math.floor(contextWindow * .2)), source: 'estimated', resolved: false }
}

export async function detectChatModelBudget(modelId: string, settings: { extra?: Record<string, unknown> }, deps: {
  listModels(): Promise<Array<{ id: string; contextWindow?: number; maxOutputTokens?: number; supportsFunctionCalling?: boolean }>>
  resolveModelMetadata?(id: string): Promise<AiModelRegistryEntry | undefined>
}) {
  const [models, metadata] = await Promise.all([
    deps.listModels().catch(() => []), deps.resolveModelMetadata?.(modelId).catch(() => undefined),
  ])
  const info = models.find(candidate => candidate.id === modelId)
  return { ...resolveChatModelBudget(modelId, info, settings.extra, metadata), supportsFunctionCalling: info?.supportsFunctionCalling }
}
