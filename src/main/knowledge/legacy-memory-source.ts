// Note: legacy records require fresh confirmation against unchanged source content — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import { readFile } from 'node:fs/promises'
import { assertFactReviewReady } from './fact-review-recovery'
import { join } from 'node:path'
import { z } from 'zod'
import type { CandidateFact, MemoryFact } from '../../shared/knowledge'
import { knowledgeRootPath } from './constants'
import { factScope } from './memory-evidence'
import { profileContentHash, reviewedFactHash } from './profile-projection'

export async function readLegacyJson(path: string): Promise<unknown | undefined> {
  try { return JSON.parse(await readFile(join(knowledgeRootPath(), path), 'utf8')) as unknown }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
}

export async function readLegacyJsonl<T>(path: string): Promise<T[]> {
  const revision = path.replace(/\\/g, '/').startsWith('facts/') ? await assertFactReviewReady() : undefined
  let raw: string
  try { raw = await readFile(join(knowledgeRootPath(), path), 'utf8') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  if (revision !== undefined) await assertFactReviewReady(revision)
  return raw.split('\n').filter(line => line.trim()).map(line => JSON.parse(line) as T)
}

interface LegacySource {
  binding: NonNullable<CandidateFact['legacySource']>
  content: string
  fact?: MemoryFact
}

const LegacyProfile = z.object({ identity: z.string().optional(), formatPrefs: z.array(z.string()).optional(), toolPrefs: z.array(z.string()).optional() }).passthrough()

export async function legacyProfileSources(): Promise<LegacySource[]> {
  const profile = LegacyProfile.parse(await readLegacyJson('profile/profile.json') ?? {})
  const sources = new Map<string, LegacySource>()
  for (const [field, values] of [['identity', profile.identity ? [profile.identity] : []], ['formatPrefs', profile.formatPrefs ?? []], ['toolPrefs', profile.toolPrefs ?? []]] as const) {
    for (const value of values) {
      if (!value.trim()) continue
      const id = `${field}:${profileContentHash(value)}`
      sources.set(id, { binding: { kind: 'profile', id, hash: profileContentHash({ field, value }) }, content: `${field}: ${value}` })
    }
  }
  return [...sources.values()]
}

export function legacyFactSource(fact: MemoryFact): LegacySource | undefined {
  if (factScope(fact) !== 'user' || fact.status !== 'active' || (fact.ttl && !(Date.parse(fact.ttl) > Date.now()))) return undefined
  if (fact.confirmation?.kind === 'human-review' && fact.confirmation.contentHash === reviewedFactHash(fact)) return undefined
  return { binding: { kind: 'fact', id: fact.id, hash: profileContentHash({ contentHash: reviewedFactHash(fact), confirmation: fact.confirmation, status: fact.status }) }, content: fact.content, fact }
}

export function legacySourceCandidate(source: LegacySource): CandidateFact {
  const key = profileContentHash(source.binding)
  const now = new Date().toISOString()
  const provenance = source.fact?.provenance ?? {
    workspaceId: 'user', workspaceName: 'user', workspacePath: '', source: 'manual' as const,
    sourceObservationIds: [], fileRefs: ['profile/profile.json'], actor: 'legacy-profile', createdAt: now,
  }
  const fact: MemoryFact = source.fact ? { ...source.fact, confirmation: undefined, id: `legacy-confirmed:${key}`, version: 1, status: 'proposed', scope: 'user', supersedes: source.fact.id } : {
    id: `legacy-confirmed:${key}`, content: source.content, kind: source.binding.id.startsWith('identity:') ? 'fact' : 'preference',
    scope: 'user', status: 'proposed', version: 1, concepts: [], files: [], tags: ['legacy-profile'], confidence: 0.5, provenance,
  }
  return { id: `legacy-memory:${key}`, type: 'fact', status: 'proposed', derivation: 'deterministic', legacySource: source.binding,
    fact, evidence: { observationIds: provenance.sourceObservationIds, snippets: [source.content], sources: provenance.sourceEvidence },
  }
}

export async function validateLegacyCandidate(candidate: CandidateFact, facts: MemoryFact[]): Promise<void> {
  const binding = candidate.legacySource
  if (!binding) return
  if (binding.kind === 'fact' && facts.filter(fact => fact.id === binding.id).length !== 1) throw new Error('Legacy fact source is missing or ambiguous')
  const source = binding.kind === 'fact'
    ? facts.filter(fact => fact.id === binding.id).map(legacyFactSource).find(Boolean)
    : (await legacyProfileSources()).find(item => item.binding.id === binding.id)
  if (!source || source.binding.hash !== binding.hash) throw new Error('Legacy memory source changed or is no longer eligible; import it again for review')
  const expected = legacySourceCandidate(source)
  if (candidate.id !== expected.id || reviewedFactHash(candidate.fact) !== reviewedFactHash(expected.fact)) {
    throw new Error('Legacy memory candidate does not match its source')
  }
}
