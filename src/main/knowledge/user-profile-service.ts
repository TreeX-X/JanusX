import { readPersonalForgettingBarrier } from './personal-forgetting-barrier'
import { readObservationRevocationBarrier } from './observation-revocation-barrier'
// Note: profile snapshots derive from confirmed facts; manual overrides stay separate — see .agents/notes/knowledge/requirements/unified-memory-laya-primary.md
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { MemoryFact, UserProfile } from '../../shared/knowledge'
import type { PersonalProfileEditContext } from '../../shared/ipc/knowledge'
import { withFactCandidatesLock } from './review-service'
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

  editContext(): Promise<PersonalProfileEditContext> {
    return profileQueue.run(() => this.readEditContext())
  }

  private async readEditContext(): Promise<PersonalProfileEditContext> {
    const stored = Overrides.parse(await readOptional(join(this.deps.root(), 'profile', 'overrides.json')) ?? {})
    const barrier = await readPersonalForgettingBarrier()
    const overrides = Overrides.parse(stored)
    if (overrides.identity && barrier.blocksContent(overrides.identity)) delete overrides.identity
    if (overrides.formatPrefs) overrides.formatPrefs = overrides.formatPrefs.filter(value => !barrier.blocksContent(value))
    if (overrides.toolPrefs) overrides.toolPrefs = overrides.toolPrefs.filter(value => !barrier.blocksContent(value))
    return { overrides, hash: profileContentHash({ stored, overrides }) }
  }

  /** Whole-form replacement binds the displayed fields; absent fields explicitly clear overrides. */
  replace(input: unknown): Promise<void> {
    const request = z.object({ expectedHash: z.string().regex(/^[a-f0-9]{64}$/), overrides: Overrides }).strict().parse(input)
    return withFactCandidatesLock(() => profileQueue.run(async () => {
      const context = await this.readEditContext()
      const next = request.overrides
      const barrier = await readPersonalForgettingBarrier()
      if ([next.identity, ...(next.formatPrefs ?? []), ...(next.toolPrefs ?? [])].some(value => value && barrier.blocksContent(value))) {
        throw new Error('Personal profile contains forgotten content')
      }
      // A lost successful response can be retried without another audit or version change.
      if (context.hash !== request.expectedHash) {
        if (profileContentHash(context.overrides) === profileContentHash(next)) return
        throw new Error('Personal profile changed; reload before saving')
      }
      await this.writeOverrides(next, Object.keys(next))
      // Projection is derived on the next read. Its failure cannot turn a committed edit into a failed save.
    }))
  }

  private async writeOverrides(next: UserProfileOverrides, fields: string[]): Promise<void> {
    const path = join(this.deps.root(), 'profile', 'overrides.json')
    const current = Overrides.parse(await readOptional(path) ?? {})
    if (profileContentHash(current) === profileContentHash(next)) return
    await writeFileAtomic(path, JSON.stringify(next, null, 2) + '\n')
    try {
      await knowledgeAuditService.record({
        action: 'user_profile_updated', targetType: 'fact', targetId: 'profile-overrides', before: null,
        after: { fields },
        provenance: { workspaceId: 'user', workspaceName: 'user', workspacePath: '', source: 'manual',
          sourceObservationIds: [], fileRefs: [], actor: 'user-memory', createdAt: new Date(this.deps.now()).toISOString() },
      })
    } catch (error) {
      await writeFileAtomic(path, JSON.stringify(current, null, 2) + '\n')
      throw error
    }
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
      await this.writeOverrides(next, Object.keys(patch))
      return this.project()
    })
  }
}

export const userProfileService = new UserProfileService()
