// Note: chat queries and selected episodes commit the same durable forgetting decision — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import { z } from 'zod'
import type { CandidateFact, MemoryFact, UserEpisode } from '../../shared/knowledge'
import { writeFileAtomic } from '../lib/atomic-file'
import { withFactCandidatesLock } from './review-service'
import { readLegacyJsonl } from './legacy-memory-source'
import { requirePersonalCorrectionTarget } from './personal-correction-source'
import { factScope } from './memory-evidence'
import { contentKeys, episodeContentHash, forgettingPath, forgettingRecordSchema, memoryKey, PersonalForgettingBarrier, readPersonalForgettingBarrier } from './personal-forgetting-barrier'
import { userEpisodeService } from './user-episode-service'
import { profileContentHash, reviewedFactHash } from './profile-projection'
import { isForgettableQuery, matchesForgettingQuery } from './search/tokenizer'
import { userProfileService } from './user-profile-service'

const inputSchema = z.object({ targetId: z.string().min(1), targetHash: z.string().regex(/^[a-f0-9]{64}$/), kind: z.enum(['fact', 'episode', 'override']).optional() }).strict()

/** The atomic barrier is both the lifecycle decision and its content-free audit receipt. */
export async function forgetPersonalMemory(input: unknown): Promise<void> {
  const parsed = inputSchema.parse(input)
  await withFactCandidatesLock(async () => {
    const existing = await readPersonalForgettingBarrier()
    const receiptTarget = parsed.kind === 'episode' || parsed.kind === 'override' ? `${parsed.kind}:${parsed.targetId}` : parsed.targetId
    if (existing.records.some(record => record.target === memoryKey(receiptTarget) && record.targetHash === parsed.targetHash)) return
    const facts = await readLegacyJsonl<MemoryFact>('facts/facts.jsonl')
    const candidates = await readLegacyJsonl<CandidateFact>('facts/candidates.jsonl')
    if (parsed.kind === 'override') {
      const context = await userProfileService.editContext()
      if (context.hash !== parsed.targetHash) throw new Error('Personal profile changed; reload before forgetting')
      const match = /^(formatPrefs|toolPrefs):(0|[1-9]\d*)$/.exec(parsed.targetId)
      const value = parsed.targetId === 'identity' ? context.overrides.identity
        : match ? context.overrides[match[1] as 'formatPrefs' | 'toolPrefs']?.[Number(match[2])] : undefined
      if (!value) throw new Error('Personal profile field is missing')
      await commitForgetting(existing, facts, candidates, [], [], receiptTarget, parsed.targetHash, [value])
      return
    }
    if (parsed.kind === 'episode') {
      const targets = (await userEpisodeService.listForForgetting()).filter(episode => episode.id === parsed.targetId)
      if (targets.length !== 1 || targets[0].status !== 'active' || !(Date.parse(targets[0].expiresAt) > Date.now())
        || episodeContentHash(targets[0]) !== parsed.targetHash) throw new Error('Personal episode changed, expired, or is ambiguous')
      await commitForgetting(existing, facts, candidates, [], targets, receiptTarget, parsed.targetHash)
      return
    }
    const targets = facts.filter(fact => fact.id === parsed.targetId)
    if (targets.length !== 1) throw new Error('Personal memory target missing or ambiguous')
    const target = targets[0]
    requirePersonalCorrectionTarget(target, parsed.targetHash)
    await commitForgetting(existing, facts, candidates, [target], [], receiptTarget, parsed.targetHash)
  })
}

/** The existing approval-gated chat tool selects both domains of personal memory in one commit. */
export async function forgetPersonalMemoryQuery(input: unknown): Promise<{ archivedFactIds: string[]; expiredEpisodeIds: string[]; silent: true; mode: 'logical' }> {
  const { query } = z.object({ query: z.string().trim().min(1).max(500), confirm: z.literal(true) }).strict().parse(input)
  if (!isForgettableQuery(query)) throw new Error('user-memory.forget query is too broad to forget safely')
  return withFactCandidatesLock(async () => {
    const existing = await readPersonalForgettingBarrier()
    const facts = await readLegacyJsonl<MemoryFact>('facts/facts.jsonl')
    const candidates = await readLegacyJsonl<CandidateFact>('facts/candidates.jsonl')
    const matched = facts.filter(fact => factScope(fact) === 'user' && fact.status === 'active'
      && (!fact.ttl || Date.parse(fact.ttl) > Date.now()) && matchesForgettingQuery(query, `${fact.content}\n${fact.concepts.join(' ')}`))
    const episodes = (await userEpisodeService.listForForgetting()).filter(episode => episode.status === 'active'
      && Date.parse(episode.expiresAt) > Date.now() && matchesForgettingQuery(query, `${episode.content}\n${episode.tags.join(' ')}`))
    if (!matched.length && !episodes.length) throw new Error('user-memory.forget matched no user memory')
    if (new Set(facts.map(fact => fact.id)).size !== facts.length || new Set(episodes.map(episode => episode.id)).size !== episodes.length) throw new Error('Ambiguous personal memory sources')
    const targetHash = profileContentHash({ facts: matched.map(fact => [fact.id, reviewedFactHash(fact)]).sort(), episodes: episodes.map(episode => [episode.id, episodeContentHash(episode)]).sort() })
    const target = `query:${query}`
    if (!existing.records.some(record => record.target === memoryKey(target) && record.targetHash === targetHash)) {
      await commitForgetting(existing, facts, candidates, matched, episodes, target, targetHash)
    }
    return { archivedFactIds: matched.map(fact => fact.id), expiredEpisodeIds: episodes.map(episode => episode.id), silent: true, mode: 'logical' }
  })
}

async function commitForgetting(existing: PersonalForgettingBarrier, facts: MemoryFact[], candidates: CandidateFact[], targets: MemoryFact[], episodes: UserEpisode[], targetId: string, targetHash: string, contents: string[] = []): Promise<void> {
  const record = forgettingRecordSchema.parse({ target: memoryKey(targetId), targetHash,
    createdAt: new Date().toISOString(), facts: [], candidates: [], observations: [], contents: contents.flatMap(contentKeys) })
  const addFact = (fact: MemoryFact) => {
    record.facts.push(memoryKey(fact.id))
    record.contents.push(...contentKeys(fact.content))
    record.observations.push(...fact.provenance.sourceObservationIds.map(memoryKey))
  }
  for (const target of targets) addFact(target)
  for (const episode of episodes) {
    record.contents.push(...contentKeys(episode.content))
    record.observations.push(...[episode.id, ...episode.sourceObservationIds].map(memoryKey))
  }
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
}
