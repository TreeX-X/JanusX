import { matchAiModel } from '@janusx/llm-core'
import type { ChatContextStatus } from '../../shared/chat-context'

export interface ChatModelBudget {
  contextWindow: number
  maxOutputTokens: number
  source: ChatContextStatus['source']
}
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1024 && value <= 10_000_000

/** Explicit per-model settings win. An unknown window stays visibly estimated. */
export function resolveChatModelBudget(modelId: string, listed?: { contextWindow?: number; maxOutputTokens?: number }, extra?: Record<string, unknown>): ChatModelBudget {
  const overrides = extra?.chatModelLimits as Record<string, { contextWindow?: unknown }> | undefined
  const configured = overrides?.[modelId]?.contextWindow
  const match = matchAiModel(modelId)
  const known = match.confidence === 'exact' || match.confidence === 'high' ? match.match : null
  const source = positive(configured) ? 'configured' : positive(listed?.contextWindow) ? 'catalog'
    : positive(known?.effectiveContextWindow) ? 'registry' : 'estimated'
  const contextWindow = positive(configured) ? configured : positive(listed?.contextWindow) ? listed.contextWindow
    : positive(known?.effectiveContextWindow) ? known.effectiveContextWindow : 16_384
  // The same limit is applied to generation, so the reserved reply budget is real.
  const maxOutputTokens = Math.max(256, Math.min(listed?.maxOutputTokens || known?.maxOutputTokens || 4096, Math.floor(contextWindow * .2)))
  return { contextWindow, maxOutputTokens, source }
}
