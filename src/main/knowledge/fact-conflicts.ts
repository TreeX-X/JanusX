// Note: explicit single-value conflicts require reviewed replacement — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import { createHash } from 'node:crypto'
import type { CandidateFact, MemoryFact } from '../../shared/knowledge'
import type { FactReviewContext } from '../../shared/ipc/knowledge'
import { factSlot, slotsConflict } from '../../shared/fact-slot'
import { reviewCandidateSnapshot } from '../../shared/review-candidate-snapshot'
import { factScope } from './memory-evidence'

export function sameFactDomain(a: MemoryFact, b: MemoryFact): boolean {
  return factScope(a) === factScope(b) && a.provenance.workspaceId === b.provenance.workspaceId
    && (['ownerScope', 'tenantId', 'projectId', 'ownerUserId'] as const).every(key => a[key] === b[key]
      || a[key] == null && b[key] == null)
}

export function replacementHash(fact: MemoryFact): string {
  const { habitStrength: _strength, lastSeenAt: _seen, ...stable } = fact
  return createHash('sha256').update(reviewCandidateSnapshot({ id: fact.id, type: 'fact', status: 'proposed', derivation: 'deterministic', fact: stable,
    evidence: { observationIds: fact.provenance.sourceObservationIds } })).digest('hex')
}

export function factReviewContext(candidate: CandidateFact, facts: MemoryFact[], candidates: CandidateFact[]): FactReviewContext {
  const fact = candidate.fact
  const active = facts.filter(item => item.status === 'active' && (!item.ttl || Date.parse(item.ttl) > Date.now()) && sameFactDomain(fact, item))
  const targetId = fact.supersedes?.trim()
  const targets = active.filter(item => item.id === targetId || slotsConflict(fact.content, item.content))
  const blocked = facts.some(item => item.id === fact.id) ? 'id-collision'
    : targetId && (facts.filter(item => item.id === targetId).length !== 1 || !active.some(item => item.id === targetId)) ? 'invalid-target'
      : targets.length > 1 ? 'multiple-targets' : undefined
  return {
    factKey: factSlot(fact.content)?.factKey,
    targets: targets.map(item => ({ id: item.id, content: item.content, version: item.version, hash: replacementHash(item) })),
    competing: candidates.filter(item => item.status === 'proposed' && item.id !== candidate.id && sameFactDomain(fact, item.fact)
      && slotsConflict(fact.content, item.fact.content)).map(item => ({ id: item.id, content: item.fact.content })),
    ...(blocked ? { blocked } : {}),
  }
}
