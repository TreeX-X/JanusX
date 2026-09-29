import type { MemoryFact } from './knowledge'

export const HABIT_DECAY_HALF_LIFE_DAYS = 30
export const MEMORY_ACCESS_COOLDOWN_MS = 10 * 60_000
export const MEMORY_ACCESS_BOOST = 0.15
export const MEMORY_ACCESS_REQUEST_LIMIT = 64
const unit = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0

export function decayHabitStrength(strength: number, anchorAt: string, nowMs = Date.now()): number {
  const anchor = Date.parse(anchorAt)
  const days = Number.isFinite(anchor) && Number.isFinite(nowMs) ? Math.max(0, nowMs - anchor) / 86_400_000 : 0
  return unit(strength) * Math.pow(0.5, days / HABIT_DECAY_HALF_LIFE_DAYS)
}

export function reheatHabitStrength(strength: number, boost = MEMORY_ACCESS_BOOST): number {
  return unit(unit(strength) + (Number.isFinite(boost) ? Math.max(0, boost) : 0))
}

export function memoryStrength(fact: MemoryFact, nowMs = Date.now()): number {
  return decayHabitStrength(fact.recallState?.strength ?? fact.habitStrength ?? 0.5,
    fact.recallState?.anchorAt ?? fact.lastSeenAt ?? fact.provenance.createdAt, nowMs)
}

export interface UserMemoryDelivery {
  capturedAt: number
  section: string
  facts: Array<{ id: string; hash: string }>
}
