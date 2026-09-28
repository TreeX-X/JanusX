import type { CandidateFact, MemoryFact } from '../../shared/knowledge'
import { SerialQueue } from '../lib/atomic-file'
import { knowledgeTruthService } from './truth-service'
import { proposeFactCandidates } from './review-service'
import { legacyFactSource, legacyProfileSources, legacySourceCandidate, readLegacyJsonl } from './legacy-memory-source'

const migrationQueue = new SerialQueue()
const MIGRATION_BATCH_SIZE = 100

/** Explicitly prepare candidates; importing never approves or overwrites legacy sources. */
export function importLegacyPersonalMemory(): Promise<{ created: number; remaining: number }> {
  return migrationQueue.run(async () => {
    // Validate source JSONL before the permissive truth reader filters inactive records.
    await readLegacyJsonl<MemoryFact>('facts/facts.jsonl')
    const [truth, profile, existing] = await Promise.all([
      knowledgeTruthService.list(), legacyProfileSources(), readLegacyJsonl<CandidateFact>('facts/candidates.jsonl'),
    ])
    const ids = new Set(existing.map(candidate => candidate.id))
    const candidates = [...truth.facts.map(legacyFactSource).filter(source => source !== undefined), ...profile]
      .map(legacySourceCandidate).filter(candidate => !ids.has(candidate.id))
    const added = await proposeFactCandidates(candidates.slice(0, MIGRATION_BATCH_SIZE))
    return { created: added.length, remaining: Math.max(0, candidates.length - MIGRATION_BATCH_SIZE) }
  })
}
