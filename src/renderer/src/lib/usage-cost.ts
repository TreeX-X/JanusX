import { matchAiModel } from '@janusx/llm-core/model-registry'
import type { AiModelRegistryEntry } from '@janusx/llm-core'
import type { UsageRecord } from '../../../shared/usage'
import { asRecord, readModelPricing } from '../components/modelCatalogPanelLogic'

export interface UsageCost {
  usd: number
  inputUsd: number
  outputUsd: number
  cacheReadUsd: number
  cacheWriteUsd: number
  inputUnpriced: number
  outputUnpriced: number
  cacheReadUnpriced: number
  cacheWriteUnpriced: number
  pricedTokens: number
  totalTokens: number
}
export interface UsageModelCost extends UsageCost { engine: string; model: string }
const emptyCost = (): UsageCost => ({ usd: 0, inputUsd: 0, outputUsd: 0, cacheReadUsd: 0, cacheWriteUsd: 0, inputUnpriced: 0, outputUnpriced: 0, cacheReadUnpriced: 0, cacheWriteUnpriced: 0, pricedTokens: 0, totalTokens: 0 })

function rate(value: unknown): number | undefined {
  if ((typeof value !== 'string' && typeof value !== 'number') || value === '') return undefined
  if (typeof value === 'string' && !value.trim()) return undefined
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined
}

/** Today's catalog is a reference quote, never a historical provider bill. */
export function estimateUsageCost(record: UsageRecord, model?: AiModelRegistryEntry): UsageCost {
  const result = { ...emptyCost(), totalTokens: record.totalTokens, inputUnpriced: record.inputTokens, outputUnpriced: record.outputTokens, cacheReadUnpriced: record.cacheReadTokens ?? 0, cacheWriteUnpriced: record.cacheWriteTokens ?? 0 }
  if (!model) return result
  let pricing = readModelPricing(model)
  if (pricing.overrides !== undefined) {
    if (!Array.isArray(pricing.overrides)) return result
    if (pricing.overrides.length && record.timeBasis !== 'event') return result
    const prompt = record.inputTokens + (record.cacheReadTokens ?? 0) + (record.cacheWriteTokens ?? 0)
    const rules = pricing.overrides.map(asRecord)
    // Unknown conditions cannot be interpreted as a flat rate.
    if (rules.some(rule => typeof rule.min_prompt_tokens !== 'number' || !Number.isSafeInteger(rule.min_prompt_tokens)
      || rule.min_prompt_tokens < 0 || Object.keys(rule).some(key => !['min_prompt_tokens', 'prompt', 'completion', 'input_cache_read', 'input_cache_write', 'input_cache_write_1h', 'internal_reasoning'].includes(key)))) return result
    for (const rule of rules.sort((a, b) => Number(a.min_prompt_tokens) - Number(b.min_prompt_tokens))) {
      if (prompt >= Number(rule.min_prompt_tokens)) pricing = { ...pricing, ...rule }
    }
  }
  const add = (tokens: number, value: unknown, field: 'inputUsd' | 'outputUsd' | 'cacheReadUsd' | 'cacheWriteUsd', unpriced: 'inputUnpriced' | 'outputUnpriced' | 'cacheReadUnpriced' | 'cacheWriteUnpriced') => {
    const price = rate(value)
    if (price === undefined || !Number.isFinite(tokens * price)) return
    result[field] += tokens * price
    result[unpriced] -= tokens
    result.pricedTokens += tokens
  }
  add(record.inputTokens, pricing.prompt, 'inputUsd', 'inputUnpriced')
  // No source-wide reasoning split exists. Distinct reasoning pricing cannot
  // be applied to a combined output count without inventing a breakdown.
  if (pricing.internal_reasoning === undefined || rate(pricing.internal_reasoning) === rate(pricing.completion)) {
    add(record.outputTokens, pricing.completion, 'outputUsd', 'outputUnpriced')
  }
  add(record.cacheReadTokens ?? 0, pricing.input_cache_read, 'cacheReadUsd', 'cacheReadUnpriced')
  // The native ledger has no cache TTL split. Do not guess the cheaper rate.
  if (pricing.input_cache_write_1h === undefined || rate(pricing.input_cache_write_1h) === rate(pricing.input_cache_write)) {
    add(record.cacheWriteTokens ?? 0, pricing.input_cache_write, 'cacheWriteUsd', 'cacheWriteUnpriced')
  }
  result.usd = result.inputUsd + result.outputUsd + result.cacheReadUsd + result.cacheWriteUsd
  return result
}

export function aggregateUsageCosts(records: readonly UsageRecord[], models: AiModelRegistryEntry[], start: number, end: number, engine?: string) {
  const total = emptyCost()
  const rows = new Map<string, UsageModelCost>()
  const matches = new Map<string, AiModelRegistryEntry | undefined>()
  const seen = new Set<string>()
  for (const record of records) {
    if (seen.has(record.id) || record.at < start || record.at > end || (engine && record.engine !== engine)) continue
    seen.add(record.id)
    const name = record.model ?? ''
    if (!matches.has(name)) {
      const match = name ? matchAiModel(name, models) : undefined
      matches.set(name, match && (match.confidence === 'exact' || match.confidence === 'high') ? match.match ?? undefined : undefined)
    }
    const cost = estimateUsageCost(record, matches.get(name))
    const key = JSON.stringify([record.engine, name])
    const row = rows.get(key) ?? { ...emptyCost(), engine: record.engine, model: name }
    for (const field of Object.keys(total) as Array<keyof UsageCost>) {
      total[field] += cost[field]
      row[field] += cost[field]
    }
    rows.set(key, row)
  }
  return { ...total, rows: [...rows.values()].sort((a, b) => b.usd - a.usd || b.totalTokens - a.totalTokens) }
}
