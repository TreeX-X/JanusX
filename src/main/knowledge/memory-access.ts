// Note: only delivered memories gain bounded strength — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { MemoryFact } from '../../shared/knowledge'
import { memoryStrength, reheatHabitStrength, MEMORY_ACCESS_COOLDOWN_MS, MEMORY_ACCESS_REQUEST_LIMIT, type UserMemoryDelivery } from '../../shared/memory-strength'
import { knowledgeRootPath } from './constants'
import { withFactCandidatesLock } from './review-service'
import { readLegacyJsonl } from './legacy-memory-source'
import { readPersonalForgettingBarrier } from './personal-forgetting-barrier'
import { factScope } from './memory-evidence'
import { replacementHash } from './fact-conflicts'
import { reviewedFactHash } from './profile-projection'
import { writeFileAtomic } from '../lib/atomic-file'

/** Revalidates delivered snapshots under the same lock as approval and forgetting. */
export async function recordUserMemoryAccess(receipt: UserMemoryDelivery, requestId: string, nowMs = Date.now(), signal?: AbortSignal): Promise<number> {
  if (!requestId || !Number.isFinite(nowMs) || !Number.isFinite(receipt.capturedAt) || receipt.capturedAt > nowMs || signal?.aborted) return 0
  return withFactCandidatesLock(async () => {
    if (signal?.aborted) return 0
    const facts = await readLegacyJsonl<MemoryFact>('facts/facts.jsonl')
    const barrier = await readPersonalForgettingBarrier()
    const refs = new Map(receipt.facts.map(ref => [ref.id, ref.hash]))
    const counts = new Map<string, number>()
    for (const fact of facts) counts.set(fact.id, (counts.get(fact.id) ?? 0) + 1)
    const requestHash = createHash('sha256').update(requestId).digest('hex')
    let changed = 0
    const next = facts.map(fact => {
      if (!refs.has(fact.id) || counts.get(fact.id) !== 1 || factScope(fact) !== 'user'
        || fact.status !== 'active' || fact.ttl && !(Date.parse(fact.ttl) > nowMs) || barrier.blocksFact(fact)
        || fact.confirmation?.kind !== 'human-review' || fact.confirmation.contentHash !== reviewedFactHash(fact)
        || refs.get(fact.id) !== replacementHash(fact)) return fact
      const state = fact.recallState
      if (state && (!Number.isFinite(state.strength) || state.strength < 0 || state.strength > 1
        || !Number.isFinite(Date.parse(state.anchorAt)) || !Number.isFinite(Date.parse(state.lastAccessAt))
        || !Array.isArray(state.recentRequests) || !state.recentRequests.every(key => typeof key === 'string'))) throw new Error('Invalid memory access state')
      if (state && (state.recentRequests.includes(requestHash) || receipt.capturedAt <= Date.parse(state.lastAccessAt))) return fact
      const anchor = Date.parse(state?.anchorAt ?? fact.lastSeenAt ?? fact.provenance.createdAt)
      if (Number.isFinite(anchor) && nowMs < anchor) return fact
      const boost = !state || nowMs - anchor >= MEMORY_ACCESS_COOLDOWN_MS
      const now = new Date(nowMs).toISOString()
      changed++
      return { ...fact, recallState: {
        strength: boost ? reheatHabitStrength(memoryStrength(fact, nowMs)) : state.strength,
        anchorAt: boost ? now : state.anchorAt,
        lastAccessAt: new Date(receipt.capturedAt).toISOString(),
        recentRequests: [...(state?.recentRequests ?? []), requestHash].slice(-MEMORY_ACCESS_REQUEST_LIMIT),
      } }
    })
    if (changed && !signal?.aborted) await writeFileAtomic(join(knowledgeRootPath(), 'facts/facts.jsonl'), next.map(fact => JSON.stringify(fact)).join('\n') + '\n')
    return signal?.aborted ? 0 : changed
  })
}

/** Ranking telemetry must not turn a successful delivery into a failed chat/tool call. */
export async function recordUserMemoryAccessBestEffort(receipt: UserMemoryDelivery | undefined, requestId: string, signal?: AbortSignal): Promise<void> {
  if (!receipt?.facts.length || signal?.aborted) return
  try { await recordUserMemoryAccess(receipt, requestId, Date.now(), signal) }
  catch (error) { console.warn('[knowledge] memory access was not recorded:', error instanceof Error ? error.message : String(error)) }
}

/** A receipt is eligible only when its complete section survives final message budgeting. */
export function containsMemoryDelivery(messages: unknown, receipt: UserMemoryDelivery): boolean {
  if (!receipt.section || !Array.isArray(messages)) return false
  return messages.some(message => {
    const content = message?.content
    return typeof content === 'string' ? content.includes(receipt.section) : Array.isArray(content)
      && content.some(part => part?.type === 'text' && typeof part.text === 'string' && part.text.includes(receipt.section))
  })
}

/** Wait for provider output, rather than counting a stream object that may never be consumed. */
export function trackMemoryStream<T extends object>(result: T, delivered: () => Promise<void>): T {
  let recorded = false
  const streams = new Map<PropertyKey, AsyncIterable<unknown>>()
  return new Proxy(result, { get(target, key) {
    const value: unknown = Reflect.get(target, key, target)
    if ((key !== 'textStream' && key !== 'fullStream') || !value || typeof value !== 'object'
      || !(Symbol.asyncIterator in value)) return value
    if (!streams.has(key)) streams.set(key, (async function* () {
      for await (const part of value as AsyncIterable<unknown>) {
        const event = typeof part === 'object' && part !== null ? part as Record<string, unknown> : undefined
        const delta = event?.text ?? event?.textDelta ?? event?.delta
        if (!recorded && (typeof part === 'string' && part.length > 0
          || event?.type === 'tool-call' || event?.type === 'text-delta' && typeof delta === 'string' && delta.length > 0)) {
          recorded = true
          await delivered()
        }
        yield part
      }
    })())
    return streams.get(key)
  } })
}
