// Note: durable personal forgetting blocks replay without deleting engineering sources — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { CandidateFact, MemoryFact, UserEpisode } from '../../shared/knowledge'
import { knowledgeRootPath } from './constants'
import { factScope } from './memory-evidence'
import { profileContentHash } from './profile-projection'

const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const forgettingRecordSchema = z.object({
  target: hash, targetHash: hash, createdAt: z.string().datetime(),
  facts: z.array(hash), candidates: z.array(hash), observations: z.array(hash), contents: z.array(hash),
}).strict()
export type ForgettingRecord = z.infer<typeof forgettingRecordSchema>
const ledgerSchema = z.object({ version: z.literal(1), records: z.array(forgettingRecordSchema) }).strict()
export const forgettingPath = () => join(knowledgeRootPath(), 'profile', 'forgotten.json')
export const memoryKey = (value: string) => profileContentHash(value)
export function contentKeys(content: string): string[] {
  const keys = [memoryKey(content.trim())]
  // Imported profile values carry a host field prefix. Block the original value too.
  const legacy = /^(identity|formatPrefs|toolPrefs): (.+)$/s.exec(content)
  if (legacy) keys.push(memoryKey(legacy[2].trim()))
  return keys
}

export class PersonalForgettingBarrier {
  readonly facts: Set<string>
  readonly candidates: Set<string>
  readonly observations: Set<string>
  readonly contents: Set<string>
  constructor(readonly records: ForgettingRecord[]) {
    this.facts = new Set(records.flatMap(record => record.facts))
    this.candidates = new Set(records.flatMap(record => record.candidates))
    this.observations = new Set(records.flatMap(record => record.observations))
    this.contents = new Set(records.flatMap(record => record.contents))
  }
  blocksContent(content: string): boolean { return contentKeys(content).some(key => this.contents.has(key)) }
  blocksObservations(ids: string[]): boolean { return ids.some(id => this.observations.has(memoryKey(id))) }
  blocksFact(fact: MemoryFact): boolean {
    if (!this.records.length) return false
    return factScope(fact) === 'user' && (this.facts.has(memoryKey(fact.id))
      || Boolean(fact.supersedes && this.facts.has(memoryKey(fact.supersedes)))
      || this.blocksContent(fact.content) || this.blocksObservations(fact.provenance.sourceObservationIds))
  }
  blocksCandidate(candidate: CandidateFact): boolean {
    if (!this.records.length) return false
    return factScope(candidate.fact) === 'user' && (this.blocksFact(candidate.fact)
      || this.candidates.has(memoryKey(candidate.id)) || this.blocksObservations(candidate.evidence.observationIds)
      || Boolean(candidate.personalCorrection && this.facts.has(memoryKey(candidate.personalCorrection.targetId))))
  }
  candidate(candidate: CandidateFact): CandidateFact {
    return candidate.status === 'proposed' && this.blocksCandidate(candidate)
      ? { ...candidate, status: 'rejected', reviewNotes: 'personal-memory-forgotten' } : candidate
  }
  blocksEpisode(episode: UserEpisode): boolean {
    return this.blocksObservations([episode.id, ...episode.sourceObservationIds]) || this.blocksContent(episode.content)
  }
  blocksTask(task: { scope: string; candidateId: string; evidenceHashes: Record<string, string> }): boolean {
    return task.scope === 'user' && (this.candidates.has(memoryKey(task.candidateId)) || this.blocksObservations(Object.keys(task.evidenceHashes)))
  }
}

export async function readPersonalForgettingBarrier(): Promise<PersonalForgettingBarrier> {
  let raw: string
  try { raw = await readFile(forgettingPath(), 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new PersonalForgettingBarrier([])
    throw error
  }
  return new PersonalForgettingBarrier(ledgerSchema.parse(JSON.parse(raw)).records)
}
