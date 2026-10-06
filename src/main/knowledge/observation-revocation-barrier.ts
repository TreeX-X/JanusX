// Note: source revocation invalidates derived views without deleting evidence — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { MemoryFact, Observation, CandidateFact, CandidateGraphEdge, CandidateWikiPatch } from '../../shared/knowledge'
import { knowledgeRootPath } from './constants'

const hash = z.string().regex(/^[a-f0-9]{64}$/)
type ReviewCandidate = CandidateFact | CandidateGraphEdge | CandidateWikiPatch
const schema = z.object({ version: z.literal(1), records: z.array(z.object({
  source: hash, sourceHash: hash, revokedAt: z.string().datetime(), facts: z.array(hash), observations: z.array(hash),
}).strict()) }).strict()
export type ObservationRevocationRecord = z.infer<typeof schema>['records'][number]
export const revocationPath = () => join(knowledgeRootPath(), 'observations', 'revoked.json')
export const sourceKey = (workspaceId: string, id: string) => createHash('sha256').update(JSON.stringify([workspaceId, id])).digest('hex')
export function observationRevocationHash(observation: Observation, content: string): string {
  const { revokedAt: _revokedAt, ...source } = observation
  return createHash('sha256').update(JSON.stringify([source, content])).digest('hex')
}

export class ObservationRevocationBarrier {
  private readonly sources: Map<string, string>
  private readonly facts: Set<string>
  constructor(readonly records: ObservationRevocationRecord[]) {
    this.sources = new Map(records.flatMap(record => [record.source, ...record.observations].map(key => [key, record.revokedAt] as const)))
    this.facts = new Set(records.flatMap(record => record.facts))
  }
  blocksObservations(workspaceId: string, ids: string[]): boolean {
    return ids.some(id => this.sources.has(sourceKey(workspaceId, id)))
  }
  observation(source: Observation): Observation {
    const revokedAt = this.sources.get(sourceKey(source.workspaceId, source.id))
      ?? (source.relatedObservationIds ?? []).map(id => this.sources.get(sourceKey(source.workspaceId, id))).find(Boolean)
    return revokedAt ? { ...source, revokedAt } : source
  }
  blocksFactIds(workspaceId: string, ids: string[]): boolean {
    return ids.some(id => this.facts.has(sourceKey(workspaceId, id)))
  }
  blocksFact(fact: MemoryFact): boolean {
    return this.blocksFactIds(fact.provenance.workspaceId, [fact.id])
      || this.blocksObservations(fact.provenance.workspaceId, fact.provenance.sourceObservationIds)
      || (fact.provenance.sourceEvidence ?? []).some(source => this.blocksObservations(source.workspaceId, [source.observationId]))
  }
  blocksCandidate(candidate: ReviewCandidate): boolean {
    if (!this.records.length) return false
    if (candidate.type === 'fact') return this.blocksFact(candidate.fact)
      || this.blocksObservations(candidate.fact.provenance.workspaceId, candidate.evidence?.observationIds ?? [])
      || (candidate.evidence?.sources ?? []).some(source => this.blocksObservations(source.workspaceId, [source.observationId]))
      || (candidate.evidence?.contextSources ?? []).some(source => this.blocksObservations(source.workspaceId, [source.observationId]))
    if (candidate.type === 'graph-edge') return this.blocksFactIds(candidate.edge.workspaceId, candidate.edge.sourceFactIds)
    return this.blocksFactIds(candidate.provenance.workspaceId, candidate.sourceFactIds ?? [])
      || this.blocksObservations(candidate.provenance.workspaceId, candidate.provenance.sourceObservationIds)
  }
  candidate<T extends ReviewCandidate>(candidate: T): T {
    return candidate.status === 'proposed' && this.blocksCandidate(candidate)
      ? { ...candidate, status: 'rejected', reviewNotes: 'observation-revoked' } : candidate
  }
}

export async function readObservationRevocationBarrier(): Promise<ObservationRevocationBarrier> {
  let raw: string
  try { raw = await readFile(revocationPath(), 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new ObservationRevocationBarrier([])
    throw error
  }
  return new ObservationRevocationBarrier(schema.parse(JSON.parse(raw)).records)
}
