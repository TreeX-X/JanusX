/**
 * @file Habit aggregator skeleton (M1).
 * @description Pure promotion math over repeated observations; queue ownership
 * stays untouched (no new cursors/queues). Promotion at frequency three or
 * higher passes the existing Inbox review as a candidate-only fact with
 * scope=user. Ebbinghaus decay with retrieval reheat keeps stale habits from
 * guiding silently; evidence merging keeps provenance.
 */
import { randomUUID } from 'crypto'
import type { CandidateFact, MemoryFact, Observation } from '../../shared/knowledge'
import { knowledgeAuditService } from './audit-service'

export const HABIT_PROMOTION_THRESHOLD = 3
export const HABIT_DECAY_HALF_LIFE_DAYS = 30
export const HABIT_SIMILARITY_THRESHOLD = 0.6

function tokenizeForHabit(text: string): string[] {
  const lower = text.toLowerCase()
  const ascii = lower.split(/[^a-z0-9_]+/).filter((token) => token.length >= 2)
  const cjk = lower.match(/[一-鿿]/g) ?? []
  const bigrams = cjk.slice(0, -1).map((char, index) => char + cjk[index + 1])
  return [...ascii, ...bigrams]
}

function habitJaccard(left: string, right: string): number {
  const setLeft = new Set(tokenizeForHabit(left))
  const setRight = new Set(tokenizeForHabit(right))
  if (setLeft.size === 0 && setRight.size === 0) return 1
  let intersection = 0
  for (const token of setLeft) {
    if (setRight.has(token)) intersection += 1
  }
  return intersection / (setLeft.size + setRight.size - intersection)
}

export interface HabitObservationInput {
  id: string
  content: string
  createdAt: string
}

export interface HabitPromotion {
  key: string
  content: string
  frequency: number
  evidenceObservationIds: string[]
  strength: number
  lastSeenAt: string
}

/** Group near-duplicate preference/habit observations; promote groups at frequency >= 3. */
export function proposeHabitCandidates(
  observations: HabitObservationInput[],
  nowIso: string = new Date().toISOString(),
): HabitPromotion[] {
  const groups: Array<{ members: HabitObservationInput[]; latestText: string }> = []
  const sorted = [...observations].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  for (const item of sorted) {
    const text = item.content.trim()
    if (!text) continue
    const target = groups.find((group) => habitJaccard(text, group.latestText) >= HABIT_SIMILARITY_THRESHOLD)
    if (target) {
      target.members.push(item)
      target.latestText = text
    } else {
      groups.push({ members: [item], latestText: text })
    }
  }
  return groups
    .filter((group) => group.members.length >= HABIT_PROMOTION_THRESHOLD)
    .map((group) => {
      const members = group.members
      const last = members[members.length - 1]!
      return {
        key: `habit:${members[0]!.id.slice(0, 8)}`,
        content: last.content.trim().slice(0, 1000),
        frequency: members.length,
        evidenceObservationIds: members.map((member) => member.id),
        strength: initialHabitStrength(members.length),
        lastSeenAt: last.createdAt,
      }
    })
    .filter((promotion) => promotion.content.length > 0)
    .map((promotion) => ({ ...promotion, key: `${promotion.key}:${promotion.content.length}` }))
}

/** Ebbinghaus decay: strength * 0.5^(ageDays / halfLife). */
export function decayHabitStrength(strength: number, lastSeenAt: string, nowMs: number = Date.now()): number {
  const lastMs = Date.parse(lastSeenAt)
  if (!Number.isFinite(lastMs)) return strength
  const ageDays = Math.max(0, (nowMs - lastMs) / (24 * 60 * 60 * 1000))
  return strength * Math.pow(0.5, ageDays / HABIT_DECAY_HALF_LIFE_DAYS)
}

/** Retrieval reheat: successful recall refreshes strength and lastSeenAt. */
export function reheatHabitStrength(strength: number, boost = 0.15): number {
  return Math.min(1, strength + boost)
}

function initialHabitStrength(frequency: number): number {
  return Math.min(1, 0.4 + 0.15 * (frequency - HABIT_PROMOTION_THRESHOLD + 1))
}

/** Evidence merging: union observation ids, keep newest content, bump strength. */
export function mergeHabitEvidence(existing: HabitPromotion, incoming: HabitPromotion): HabitPromotion {
  const evidence = [...new Set([...existing.evidenceObservationIds, ...incoming.evidenceObservationIds])]
  return {
    key: existing.key,
    content: incoming.lastSeenAt >= existing.lastSeenAt ? incoming.content : existing.content,
    frequency: existing.frequency + incoming.frequency,
    evidenceObservationIds: evidence.slice(-50),
    strength: Math.min(1, Math.max(existing.strength, incoming.strength) + 0.05),
    lastSeenAt: incoming.lastSeenAt >= existing.lastSeenAt ? incoming.lastSeenAt : existing.lastSeenAt,
  }
}

/** Build an Inbox candidate-only fact for a promotion; caller submits via review queue. */
export function habitPromotionToCandidate(promotion: HabitPromotion, nowIso: string = new Date().toISOString()): CandidateFact {
  const fact: MemoryFact = {
    id: randomUUID(),
    content: promotion.content,
    concepts: [],
    files: [],
    tags: ['habit', 'user-memory'],
    confidence: Math.min(0.95, Math.max(0.5, promotion.strength)),
    version: 1,
    status: 'proposed',
    kind: 'preference',
    scope: 'user',
    habitStrength: promotion.strength,
    lastSeenAt: promotion.lastSeenAt,
    provenance: {
      workspaceId: 'user',
      workspaceName: 'user',
      workspacePath: '',
      source: 'system',
      sourceObservationIds: promotion.evidenceObservationIds,
      fileRefs: [],
      actor: 'habit-aggregator',
      createdAt: nowIso,
    },
  }
  return {
    id: randomUUID(),
    type: 'fact',
    status: 'proposed',
    fact,
    derivation: 'deterministic',
    evidence: { observationIds: promotion.evidenceObservationIds, snippets: [promotion.content.slice(0, 280)] },
  }
}

/** Skeleton queue entry: derive promotions from a deterministic batch without owning cursors. */
export async function deriveHabitPromotions(
  batch: Array<Pick<Observation, 'id' | 'content' | 'createdAt' | 'type'>>,
  nowIso: string = new Date().toISOString(),
): Promise<HabitPromotion[]> {
  const inputs = batch
    .filter((item) => item.type === 'conversation-turn' || item.type === 'user-note')
    .map((item): HabitObservationInput => ({ id: item.id, content: item.content, createdAt: item.createdAt }))
  const promotions = proposeHabitCandidates(inputs, nowIso)
  if (promotions.length > 0) {
    await knowledgeAuditService.record({
      action: 'habit_candidate_proposed',
      targetType: 'fact',
      targetId: `habits:${promotions.length}`,
      before: null,
      after: { count: promotions.length },
      provenance: {
        workspaceId: 'user',
        workspaceName: 'user',
        workspacePath: '',
        source: 'system',
        sourceObservationIds: promotions.flatMap((promotion) => promotion.evidenceObservationIds).slice(0, 50),
        fileRefs: [],
        actor: 'habit-aggregator',
        createdAt: nowIso,
      },
    }).catch(() => undefined)
  }
  return promotions
}
