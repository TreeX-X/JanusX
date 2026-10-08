// Note: confirmed personal facts derive a profile without promoting engineering context — see .agents/notes/knowledge/requirements/unified-memory-laya-primary.md
import { createHash } from 'node:crypto'
import type { MemoryFact, UserProfile } from '../../shared/knowledge'
import { factScope } from './memory-evidence'

export const PROFILE_RULE_VERSION = 'confirmed-facts/1'

export function profileContentHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/** Retrieval strength and lastSeenAt do not change what was approved. */
export function reviewedFactHash(fact: MemoryFact): string {
  return profileContentHash({ id: fact.id, scope: factScope(fact), owner: fact.provenance.workspaceId, content: fact.content,
    kind: fact.kind, version: fact.version, supersedes: fact.supersedes, ttl: fact.ttl,
    factKey: fact.factKey, cardinality: fact.cardinality, polarity: fact.polarity,
    observationIds: fact.provenance.sourceObservationIds, sources: fact.provenance.sourceEvidence })
}

export function confirmedProfileFacts(facts: MemoryFact[], nowMs: number): NonNullable<UserProfile['confirmedFacts']> {
  const eligible = facts.filter(fact => factScope(fact) === 'user' && fact.status === 'active'
    && (!fact.ttl || Date.parse(fact.ttl) > nowMs)
    && fact.confirmation?.kind === 'human-review' && fact.confirmation.contentHash === reviewedFactHash(fact))
  const replaced = new Set(eligible.map(fact => fact.supersedes).filter(Boolean))
  return eligible.filter(fact => !replaced.has(fact.id))
    .sort((a, b) => Number(b.kind === 'preference') - Number(a.kind === 'preference') || a.id.localeCompare(b.id)).map(fact => ({
    id: fact.id, version: fact.version, content: fact.content, kind: fact.kind,
    observationIds: [...fact.provenance.sourceObservationIds], sourceHash: reviewedFactHash(fact), supersedes: fact.supersedes,
  }))
}
