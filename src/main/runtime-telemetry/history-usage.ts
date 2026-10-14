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

/**
 * Codex rollout replay. Each `token_count` event carries cumulative
 * `total_token_usage`; per-event consumption is the delta against the previous
 * event, which conserves the session total by construction. Verified on disk:
 * summing `last_token_usage` instead diverges from the final cumulative in 86
 * of 300 sampled sessions (repeated emissions and zeroed-breakdown events),
 * while cumulative deltas always telescope to the session total. Identity is
 * the per-file `ordinal` scoped by session, so ordinals never collide across
 * sessions; time is the event timestamp. Codex counts cache writes inside
 * `input_tokens`, so only cache reads are split out — the same mapping the
 * cumulative path uses, keeping both modes numerically identical.
 *
 * Forked/subagent rollouts copy the parent's events up to
 * `subagent_history_start_ordinal`; those ordinals stay with the parent file,
 * so they are skipped and the baseline is the parent's last cumulative value.
 */
export function collectCodexEvents(namespace: string, sessionId: string, values: RecordValue[], collectedAt: number): UsageObservation {
  const events = new Map<string, UsageEvent>()
  let issue: string | undefined
  const meta = values.find(value => value.type === 'session_meta')
  const inheritedFrom = count(record(meta?.payload)?.subagent_history_start_ordinal)
  // A root session's cumulative counters start at zero, so the first event's
  // delta is its own consumption. A forked thread inherits the parent's
  // counters, so its baseline is the last inherited event instead.
  let previous: RecordValue = { total_tokens: 0, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 }
  if (inheritedFrom !== undefined) {
    for (const value of values) {
      const ordinal = value.ordinal
      if (value.type !== 'event_msg' || typeof ordinal !== 'number' || ordinal >= inheritedFrom) continue
      const payload = record(value.payload)
      const cumulative = payload?.type === 'token_count' ? record(record(payload.info)?.total_token_usage) : undefined
      if (cumulative) previous = cumulative
    }
  }
  for (const value of values) {
    if (value.type !== 'event_msg') continue
    const payload = record(value.payload)
    if (!payload || payload.type !== 'token_count') continue
    const ordinal = value.ordinal
    if (typeof ordinal !== 'number' || !Number.isFinite(ordinal)) { issue = 'missing-event-identity'; continue }
    if (inheritedFrom !== undefined && ordinal < inheritedFrom) continue
    const info = record(payload.info)
    const cumulative = record(info?.total_token_usage) ?? record(info?.totalTokenUsage)
    const id = `${sessionId}#${ordinal}`
    if (!cumulative) continue
    const total = count(cumulative.total_tokens)
    const input = count(cumulative.input_tokens)
    const cached = count(cumulative.cached_input_tokens)
    const output = count(cumulative.output_tokens)
    if (total === undefined || input === undefined || cached === undefined || output === undefined) {
      issue = 'invalid-event'
      previous = cumulative
      continue
    }
    const deltaTotal = total - count(previous.total_tokens)!
    const deltaInput = input - count(previous.input_tokens)!
    const deltaCached = cached - count(previous.cached_input_tokens)!
    const deltaOutput = output - count(previous.output_tokens)!
    // A reset (compaction, /new) is not consumption; pause instead of guessing.
    if (deltaTotal < 0 || deltaInput < 0 || deltaCached < 0 || deltaOutput < 0) {
      issue = 'counter-regressed'
      previous = cumulative
      continue
    }
    const tokens = usageTokens(deltaInput - deltaCached, deltaOutput, deltaCached, undefined, deltaTotal)
    if (!tokens) { issue = 'invalid-event'; previous = cumulative; continue }
    const event: UsageEvent = { ...tokens, id, at: time(value.timestamp) }
    const existing = events.get(id)
    if (!existing || event.totalTokens >= existing.totalTokens) events.set(id, event)
    previous = cumulative
  }
  return { engine: 'codex', namespace, sessionId, mode: 'events', events: [...events.values()], collectedAt, issue }
}
