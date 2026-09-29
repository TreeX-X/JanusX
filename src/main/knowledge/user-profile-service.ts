import { readPersonalForgettingBarrier } from './personal-forgetting-barrier'
import { readObservationRevocationBarrier } from './observation-revocation-barrier'
// Note: profile snapshots derive from confirmed facts; manual overrides stay separate — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { MemoryFact, UserProfile } from '../../shared/knowledge'
import { knowledgeRootPath } from './constants'
import { SerialQueue, writeFileAtomic } from '../lib/atomic-file'
import { knowledgeAuditService } from './audit-service'
import { knowledgeTruthService } from './truth-service'
import { confirmedProfileFacts, profileContentHash, PROFILE_RULE_VERSION } from './profile-projection'

const profileQueue = new SerialQueue()
const PROFILE_TTL_MS = 5 * 60_000
const Overrides = z.object({
  identity: z.string().trim().max(500).optional(),
  formatPrefs: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
  toolPrefs: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
}).strict()
export type UserProfileOverrides = z.infer<typeof Overrides>
const SnapshotMetadata = z.object({
  version: z.number().int().positive(), updatedAt: z.string().datetime(),
  derivation: z.object({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/), ruleVersion: z.string(), expiresAt: z.string().datetime() }),
})

async function readOptional(path: string): Promise<unknown | undefined> {
  try { return JSON.parse(await readFile(path, 'utf8')) as unknown }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

interface ProfileDeps {
  root: () => string
  facts: () => Promise<MemoryFact[]>
  now: () => number
}

export class UserProfileService {
  constructor(private readonly deps: ProfileDeps = {
    root: knowledgeRootPath,
    facts: async () => (await knowledgeTruthService.list()).facts,
    now: Date.now,
  }) {}

  load(): Promise<UserProfile> {
    return profileQueue.run(() => this.project())
  }

  private async project(): Promise<UserProfile> {
    const root = this.deps.root()
    const nowMs = this.deps.now()
    const nowIso = new Date(nowMs).toISOString()
    const [rawOverrides, rawSnapshot, facts] = await Promise.all([
      readOptional(join(root, 'profile', 'overrides.json')),
      readOptional(join(root, 'profile', 'snapshot.json')),
      this.deps.facts(),
    ])
    const overrides = Overrides.parse(rawOverrides ?? {})
    const barrier = await readPersonalForgettingBarrier()
    if (overrides.identity && barrier.blocksContent(overrides.identity)) delete overrides.identity
    if (overrides.formatPrefs) overrides.formatPrefs = overrides.formatPrefs.filter(value => !barrier.blocksContent(value))
    if (overrides.toolPrefs) overrides.toolPrefs = overrides.toolPrefs.filter(value => !barrier.blocksContent(value))
    const previous = rawSnapshot === undefined ? undefined : SnapshotMetadata.parse(rawSnapshot)
    const revocations = await readObservationRevocationBarrier()
    const confirmedFacts = confirmedProfileFacts(facts.filter(fact => !barrier.blocksFact(fact) && !revocations.blocksFact(fact)), nowMs)
    const fingerprint = profileContentHash({ ruleVersion: PROFILE_RULE_VERSION, overrides, confirmedFacts })
    const unchanged = previous?.derivation.fingerprint === fingerprint && previous.derivation.ruleVersion === PROFILE_RULE_VERSION
    const profile: UserProfile = {
      ...overrides, confirmedFacts,
      habitVersions: confirmedFacts.map(fact => ({ habitId: fact.id, version: fact.version })),
      version: unchanged ? previous.version : (previous?.version ?? 0) + 1,
      updatedAt: unchanged ? previous.updatedAt : nowIso,
      derivation: { fingerprint, ruleVersion: PROFILE_RULE_VERSION, expiresAt: new Date(nowMs + PROFILE_TTL_MS).toISOString() },
    }
    // Re-read source content every time. TTL never masks revocation or same-id edits.
    // Cache bodies are not trusted: only version metadata is reused.
    if (unchanged && Date.parse(previous.derivation.expiresAt) > nowMs) profile.derivation!.expiresAt = previous.derivation.expiresAt
    if (!unchanged || profileContentHash(rawSnapshot) !== profileContentHash(profile)) {
      await writeFileAtomic(join(root, 'profile', 'snapshot.json'), JSON.stringify(profile, null, 2) + '\n')
    }
    return profile
  }

  /** Explicit host mutation only. Undefined removes an override; no generated fields accepted. */
  save(patch: Partial<UserProfileOverrides>): Promise<UserProfile> {
    return profileQueue.run(async () => {
      const path = join(this.deps.root(), 'profile', 'overrides.json')
      const current = Overrides.parse(await readOptional(path) ?? {})
      const next = Overrides.parse({ ...current, ...Overrides.parse(patch) })
      await writeFileAtomic(path, JSON.stringify(next, null, 2) + '\n')
      try {
        await knowledgeAuditService.record({
          action: 'user_profile_updated', targetType: 'fact', targetId: 'profile-overrides', before: null,
          after: { fields: Object.keys(patch) },
          provenance: { workspaceId: 'user', workspaceName: 'user', workspacePath: '', source: 'manual',
            sourceObservationIds: [], fileRefs: [], actor: 'user-memory', createdAt: new Date(this.deps.now()).toISOString() },
        })
      } catch (error) {
        await writeFileAtomic(path, JSON.stringify(current, null, 2) + '\n')
        throw error
      }
      return this.project()
    })
  }
}

export const userProfileService = new UserProfileService()
