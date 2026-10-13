import type { UsageEngine, UsageEvent, UsageObservation, UsageTokens } from '../../shared/usage'

type RecordValue = Record<string, unknown>
function record(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : undefined
}
function text(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value : undefined }
function count(value: unknown): number | undefined { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined }
function time(value: unknown): number | undefined {
  const at = typeof value === 'string' ? Date.parse(value) : typeof value === 'number' ? value : NaN
  return Number.isFinite(at) && at > 0 ? at : undefined
}

/** Preserve field presence: zero cache hits and unknown cache fields are distinct. */
export function usageTokens(input: unknown, output: unknown, read: unknown, write: unknown, total?: unknown): UsageTokens | undefined {
  const inputTokens = count(input)
  const outputTokens = count(output)
  if (inputTokens === undefined || outputTokens === undefined) return undefined
  const cacheReadTokens = count(read)
  const cacheWriteTokens = count(write)
  if ((read !== undefined && cacheReadTokens === undefined) || (write !== undefined && cacheWriteTokens === undefined)) return undefined
  const sum = inputTokens + outputTokens + (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0)
  if (!Number.isSafeInteger(sum) || (total !== undefined && count(total) !== sum)) return undefined
  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalTokens: sum }
}

/** One response can appear in multiple content blocks. A row UUID is not a request identity. */
export function collectUsageEvents(engine: 'claude' | 'pi', namespace: string, sessionId: string, values: RecordValue[], collectedAt: number): UsageObservation {
  const events = new Map<string, UsageEvent>()
  let issue: string | undefined
  for (const value of values) {
    const message = record(value.message)
    if (!message || (message.role !== undefined && message.role !== 'assistant')) continue
    const usage = record(message.usage)
    if (!usage) continue
    if (engine === 'pi' && value.type !== 'message') continue
    // A null stop reason indicates an unfinished Claude response. It will be retried on the next read.
    if (engine === 'claude' && message.stop_reason === null) continue
    const at = time(value.timestamp) ?? time(message.timestamp)
    const responseId = engine === 'claude' ? text(message.id) ?? text(value.requestId) : text(value.id)
    if (!responseId) { issue = 'missing-event-identity'; continue }
    const id = engine === 'pi' ? JSON.stringify([responseId, at ?? null]) : responseId
    const tokens = engine === 'claude'
      ? usageTokens(usage.input_tokens, usage.output_tokens, usage.cache_read_input_tokens, usage.cache_creation_input_tokens)
      : usageTokens(usage.input, usage.output, usage.cacheRead, usage.cacheWrite, usage.totalTokens)
    if (!tokens) { issue = 'invalid-event'; continue }
    const event: UsageEvent = { ...tokens, id, at, model: text(message.model) }
    const previous = events.get(id)
    if (!previous || event.totalTokens >= previous.totalTokens) events.set(id, event)
  }
  return { engine, namespace, sessionId, collectedAt, mode: 'events', events: [...events.values()], issue }
}

export function cumulativeUsage(engine: UsageEngine, namespace: string, sessionId: string, counters: UsageTokens | undefined, model?: string): UsageObservation {
  return { engine, namespace, sessionId, mode: 'cumulative', counters, model, collectedAt: Date.now(), issue: counters ? undefined : 'invalid-counter' }
}
