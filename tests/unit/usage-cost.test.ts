import { describe, expect, it } from 'vitest'
import type { AiModelRegistryEntry } from '@janusx/llm-core'
import type { UsageRecord } from '../../src/shared/usage'
import { aggregateUsageCosts, estimateUsageCost } from '../../src/renderer/src/lib/usage-cost'

const model: AiModelRegistryEntry = { id: 'example/pro', name: 'Pro', source: 'openrouter', aliases: [], normalizedKeys: ['example/pro', 'pro'], pricing: { prompt: '0.000002', completion: '0.00001', input_cache_read: '0.0000002', input_cache_write: '0.0000025' } }
const record: UsageRecord = { id: '1', engine: 'opencode', sessionId: 's', at: 1000, timeBasis: 'event', model: model.id, inputTokens: 1000, outputTokens: 200, cacheReadTokens: 3000, cacheWriteTokens: 400, totalTokens: 4600 }

describe('reference usage costs', () => {
  it('prices exclusive input, output, cache read and cache write without counting cache twice', () => {
    const cost = estimateUsageCost(record, model)
    expect(cost.usd).toBeCloseTo(0.0056)
    expect(cost).toMatchObject({ inputUsd: 0.002, outputUsd: 0.002, cacheWriteUsd: 0.001, pricedTokens: 4600 })
  })
  it('keeps missing models, invalid rates and true free rates distinct', () => {
    expect(estimateUsageCost(record).pricedTokens).toBe(0)
    const cost = estimateUsageCost(record, { ...model, pricing: { prompt: '0', completion: '-1', input_cache_read: ' ', input_cache_write: null } })
    expect(cost).toMatchObject({ usd: 0, pricedTokens: 1000, outputUnpriced: 200, cacheReadUnpriced: 3000 })
  })
  it('applies prompt tiers per event using input including cache and inherits untouched rates', () => {
    const tiered = { ...model, pricing: { ...model.pricing, overrides: [{ min_prompt_tokens: 4000, prompt: '0.000004' }] } }
    expect(estimateUsageCost(record, tiered).usd).toBeCloseTo(0.0076)
    expect(estimateUsageCost({ ...record, timeBasis: 'sample' }, tiered).pricedTokens).toBe(0)
    expect(estimateUsageCost(record, { ...model, pricing: { ...model.pricing, overrides: [{ mystery: true }] } }).pricedTokens).toBe(0)
  })
  it('does not invent a TTL or reasoning split and excludes non-token surcharges', () => {
    const cost = estimateUsageCost(record, { ...model, pricing: { ...model.pricing, input_cache_write_1h: '0.000004', internal_reasoning: '0.00002', web_search: '1' } })
    expect(cost.usd).toBeCloseTo(0.0026)
    expect(cost.pricedTokens).toBe(4000)
    expect(cost).toMatchObject({ cacheWriteUnpriced: 400, outputUnpriced: 200 })
  })
  it('aggregates matched models with date and engine filters, duplicate ids and partial coverage', () => {
    const rows = [record, record, { ...record, id: '2', model: 'unknown' }, { ...record, id: '3', engine: 'claude' as const }]
    const cost = aggregateUsageCosts(rows, [model], 0, 2000, 'opencode')
    expect(cost.usd).toBeCloseTo(0.0056)
    expect(cost.pricedTokens).toBe(4600)
    expect(cost.totalTokens).toBe(9200)
    expect(cost.rows).toHaveLength(2)
    expect(aggregateUsageCosts(rows, [model], 2000, 3000).totalTokens).toBe(0)
  })
})
