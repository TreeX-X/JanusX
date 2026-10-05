// Note: approval validates source snapshots and merges exact duplicates — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import { createHash } from 'node:crypto'
import type { CandidateFact, MemoryFact, MemorySourceEvidence } from '../../shared/knowledge'
import { knowledgeObservationService } from './observation-service'
import { factScope, isActiveObservation, isUserStatement, observationScope, sourceEvidence } from './memory-evidence'
import { sameFactDomain } from './fact-conflicts'

export async function validateFactEvidence(candidate: CandidateFact): Promise<void> {
  if (candidate.legacySource || candidate.personalCorrection) return
  const sources = candidate.evidence?.sources ?? candidate.fact.provenance.sourceEvidence ?? []
  // Legacy candidates without attribution remain reviewable, but cannot claim a verified source.
  if (!sources.length && !candidate.fact.provenance.sourceEvidence?.length) return
  const ids = [...new Set(candidate.evidence.observationIds)].sort()
  if (JSON.stringify(ids) !== JSON.stringify([...new Set(sources.map(source => source.observationId))].sort())
    || JSON.stringify(ids) !== JSON.stringify([...new Set(candidate.fact.provenance.sourceObservationIds)].sort())
    || JSON.stringify(candidate.evidence.sources) !== JSON.stringify(candidate.fact.provenance.sourceEvidence)) {
    throw new Error('Candidate source references do not match; regenerate before reviewing')
  }
  const observations = await knowledgeObservationService.listAll(true)
  for (const expected of sources) {
    const matches = observations.filter(row => row.id === expected.observationId && row.workspaceId === expected.workspaceId)
    const current = matches[0]
    if (matches.length !== 1 || !current || !isActiveObservation(current)) throw new Error('Candidate source is missing or expired; regenerate before reviewing')
    const sameOwner = current.workspaceId === candidate.fact.provenance.workspaceId && observationScope(current) === factScope(candidate.fact)
    if (!sameOwner && !(factScope(candidate.fact) === 'user' && isUserStatement(current))) throw new Error('Candidate source ownership does not match')
    const actual = sourceEvidence(current)
    const fullContent = await knowledgeObservationService.resolveContent(current)
    if (!expected.contentHash) throw new Error('Candidate source content binding is missing; regenerate before reviewing')
    if (Object.keys({ ...expected, ...actual }).some(key => expected[key as keyof MemorySourceEvidence] !== actual[key as keyof MemorySourceEvidence])
      || createHash('sha256').update(fullContent).digest('hex') !== expected.contentHash) {
      throw new Error('Candidate source changed; regenerate before reviewing')
    }
    for (const quote of candidate.evidence.quotes ?? []) {
      if (!ids.includes(quote.observationId) || !quote.quote.trim()) throw new Error('Candidate quote source is invalid')
      if (quote.observationId === current.id && !fullContent.includes(quote.quote)) throw new Error('Candidate source quote changed')
    }
  }
}

export function isExactFactDuplicate(existing: MemoryFact, incoming: MemoryFact): boolean {
  return sameFactDomain(existing, incoming) && existing.kind === incoming.kind && existing.content === incoming.content
    && (existing.ttl ?? null) === (incoming.ttl ?? null)
    && (existing.factKey ?? null) === (incoming.factKey ?? null)
    && (existing.cardinality ?? null) === (incoming.cardinality ?? null)
    && (existing.polarity ?? null) === (incoming.polarity ?? null)
}

export function mergeFactEvidence(existing: MemoryFact, incoming: MemoryFact): MemoryFact {
  const sources = new Map<string, MemorySourceEvidence>()
  for (const source of [...(existing.provenance.sourceEvidence ?? []), ...(incoming.provenance.sourceEvidence ?? [])]) {
    const key = JSON.stringify([source.workspaceId, source.observationId])
    const previous = sources.get(key)
    if (previous && Object.keys({ ...previous, ...source }).some(field => previous[field as keyof MemorySourceEvidence] !== source[field as keyof MemorySourceEvidence])) {
      throw new Error('Duplicate fact has conflicting source snapshots')
    }
    sources.set(key, source)
  }
  return { ...existing, provenance: { ...existing.provenance,
    sourceObservationIds: [...new Set([...existing.provenance.sourceObservationIds, ...incoming.provenance.sourceObservationIds])],
    sourceEvidence: [...sources.values()],
    fileRefs: [...new Set([...existing.provenance.fileRefs, ...incoming.provenance.fileRefs])],
  } }
}
