import { z } from 'zod'
import type { CandidateFact, MemoryFact } from '../../shared/knowledge'
import { writeFileAtomic } from '../lib/atomic-file'
import { knowledgeObservationService } from './observation-service'
import { withFactCandidatesLock, withWikiCandidatesLock, withGraphCandidatesLock } from './review-service'
import { readLegacyJsonl } from './legacy-memory-source'
import { ObservationRevocationBarrier, observationRevocationHash, readObservationRevocationBarrier, revocationPath, sourceKey } from './observation-revocation-barrier'

const targetSchema = z.object({ id: z.string().min(1), workspaceId: z.string().min(1) }).strict()
const revokeSchema = targetSchema.extend({ sourceHash: z.string().regex(/^[a-f0-9]{64}$/) })

export async function observationRevocationContext(input: unknown): Promise<{ sourceHash: string; revoked: boolean; content: string }> {
  const target = targetSchema.parse(input)
  const sources = (await knowledgeObservationService.listAll(true)).filter(source => source.id === target.id && source.workspaceId === target.workspaceId)
  if (sources.length !== 1) throw new Error('Observation source is missing or ambiguous')
  const content = await knowledgeObservationService.resolveContent(sources[0])
  return { sourceHash: observationRevocationHash(sources[0], content), revoked: !!sources[0].revokedAt, content }
}

/** One atomic receipt is the withdrawal decision and audit; raw journals remain intact. */
export async function revokeObservation(input: unknown): Promise<void> {
  const target = revokeSchema.parse(input)
  await withFactCandidatesLock(() => withWikiCandidatesLock(() => withGraphCandidatesLock(() => knowledgeObservationService.withSourceMutation(async () => {
    const existing = await readObservationRevocationBarrier()
    const source = sourceKey(target.workspaceId, target.id)
    if (existing.records.some(record => record.source === source && record.sourceHash === target.sourceHash)) return
    const context = await observationRevocationContext({ id: target.id, workspaceId: target.workspaceId })
    if (context.revoked || context.sourceHash !== target.sourceHash) throw new Error('Observation source changed or was revoked; refresh before retrying')
    const facts = await readLegacyJsonl<MemoryFact>('facts/facts.jsonl')
    const candidates = await readLegacyJsonl<CandidateFact>('facts/candidates.jsonl')
    const observations = await knowledgeObservationService.listAll(true)
    const blocked = new Set([source])
    let size: number
    do {
      size = blocked.size
      for (const observation of observations) {
        if (observation.relatedObservationIds?.some(id => blocked.has(sourceKey(observation.workspaceId, id)))) blocked.add(sourceKey(observation.workspaceId, observation.id))
      }
    } while (blocked.size !== size)
    const record = { source, sourceHash: target.sourceHash, revokedAt: new Date().toISOString(), facts: [] as string[], observations: [...blocked] }
    const barrier = new ObservationRevocationBarrier([record])
    record.facts = [...new Set([
      ...facts.filter(fact => barrier.blocksFact(fact)),
      ...candidates.filter(candidate => barrier.blocksCandidate(candidate)).map(candidate => candidate.fact),
    ].map(fact => sourceKey(fact.provenance.workspaceId, fact.id)))]
    await writeFileAtomic(revocationPath(), JSON.stringify({ version: 1, records: [...existing.records, record] }))
  }))))
}
