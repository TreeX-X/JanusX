import { createHash } from 'node:crypto'
import type { MemoryFact, MemoryScope, Observation } from '../../shared/knowledge'
import { factScope, observationScope, sourceEvidence } from './memory-evidence'

export function refinementHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function refinementEvidenceHash(observation: Observation, content: string): string {
  return refinementHash([observation.id, observation.workspaceId, observationScope(observation), observation.type,
    sourceEvidence(observation), content, observation.expiresAt, observation.episodeStatus])
}

/** Content revisions matter; retrieval strength and access timestamps do not. */
export function refinementContextHash(facts: MemoryFact[], scope: MemoryScope, workspaceId: string, nowMs = Date.now()): string {
  return refinementHash(facts.filter((fact) => fact.status === 'active' && factScope(fact) === scope
    && fact.provenance.workspaceId === workspaceId && (!fact.ttl || Date.parse(fact.ttl) > nowMs))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((fact) => [fact.id, fact.version, fact.content, fact.kind, fact.supersedes, fact.files, fact.concepts]))
}
