import { z } from 'zod'
import type { CandidateFact, MemoryFact } from '../../shared/knowledge'
import { writeFileAtomic } from '../lib/atomic-file'
import { withFactCandidatesLock } from './review-service'
import { readLegacyJsonl } from './legacy-memory-source'
import { requirePersonalCorrectionTarget } from './personal-correction-source'
import { factScope } from './memory-evidence'
import { contentKeys, forgettingPath, forgettingRecordSchema, memoryKey, PersonalForgettingBarrier, readPersonalForgettingBarrier } from './personal-forgetting-barrier'

const inputSchema = z.object({ targetId: z.string().min(1), targetHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()

/** The atomic barrier is both the lifecycle decision and its content-free audit receipt. */
export async function forgetPersonalMemory(input: unknown): Promise<void> {
  const parsed = inputSchema.parse(input)
  await withFactCandidatesLock(async () => {
    const existing = await readPersonalForgettingBarrier()
    if (existing.records.some(record => record.target === memoryKey(parsed.targetId) && record.targetHash === parsed.targetHash)) return
    const facts = await readLegacyJsonl<MemoryFact>('facts/facts.jsonl')
    const candidates = await readLegacyJsonl<CandidateFact>('facts/candidates.jsonl')
    const targets = facts.filter(fact => fact.id === parsed.targetId)
    if (targets.length !== 1) throw new Error('Personal memory target missing or ambiguous')
    const target = targets[0]
    requirePersonalCorrectionTarget(target, parsed.targetHash)
    const record = forgettingRecordSchema.parse({ target: memoryKey(target.id), targetHash: parsed.targetHash,
      createdAt: new Date().toISOString(), facts: [], candidates: [], observations: [], contents: [] })
    const addFact = (fact: MemoryFact) => {
      record.facts.push(memoryKey(fact.id))
      record.contents.push(...contentKeys(fact.content))
      record.observations.push(...fact.provenance.sourceObservationIds.map(memoryKey))
    }
    addFact(target)
    // Follow the explicit version chain in both directions, then personal evidence dependencies.
    let changed = true
    while (changed) {
      changed = false
      const barrier = new PersonalForgettingBarrier([record])
      for (const fact of facts) {
        if (factScope(fact) !== 'user' || barrier.facts.has(memoryKey(fact.id))) continue
        const predecessor = facts.some(next => barrier.facts.has(memoryKey(next.id)) && next.supersedes === fact.id)
        if (predecessor || barrier.blocksFact(fact)) { addFact(fact); changed = true }
      }
      for (const candidate of candidates) {
        if (record.candidates.includes(memoryKey(candidate.id)) || !barrier.blocksCandidate(candidate)) continue
        record.candidates.push(memoryKey(candidate.id))
        addFact(candidate.fact)
        record.observations.push(...candidate.evidence.observationIds.map(memoryKey))
        changed = true
      }
    }
    for (const field of ['facts', 'candidates', 'observations', 'contents'] as const) record[field] = [...new Set(record[field])].sort()
    await writeFileAtomic(forgettingPath(), JSON.stringify({ version: 1, records: [...existing.records, record] }, null, 2) + '\n')
  })
}
