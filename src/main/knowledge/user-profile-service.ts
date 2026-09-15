// Note: durable user scope beside project memory — see .agents/notes/implemented/feature/2026-09-15-user-memory-m1.md
/**
 * @file User profile store (M1).
 * @description Owns `profile/profile.json`: identity, format/tool prefs, habit
 * versions. Private by default; no team/roundtable/remote/MCP surfacing.
 * Writes serialize through a SerialQueue and audit `user_profile_updated`.
 */
import { mkdir, readFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { UserProfile } from '../../shared/knowledge'
import { knowledgeRootPath } from './constants'
import { SerialQueue, writeFileAtomic } from '../lib/atomic-file'
import { knowledgeAuditService } from './audit-service'
import { knowledgeContractService } from './contract-service'

const PROFILE_FILE = join('profile', 'profile.json')

function defaultProfile(nowIso: string): UserProfile {
  return { version: 1, updatedAt: nowIso }
}

function normalizeProfile(value: unknown, nowIso: string): UserProfile {
  if (!value || typeof value !== 'object') return defaultProfile(nowIso)
  const record = value as Record<string, unknown>
  const version = typeof record.version === 'number' && Number.isFinite(record.version)
    ? Math.trunc(record.version)
    : 1
  const asStrings = (input: unknown): string[] | undefined => {
    if (!Array.isArray(input)) return undefined
    const out = input.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim())
    return out.length > 0 ? [...new Set(out)].slice(0, 50) : undefined
  }
  return {
    version,
    identity: typeof record.identity === 'string' && record.identity.trim() ? record.identity.trim().slice(0, 500) : undefined,
    formatPrefs: asStrings(record.formatPrefs),
    toolPrefs: asStrings(record.toolPrefs),
    habitVersions: Array.isArray(record.habitVersions)
      ? (record.habitVersions as unknown[]).filter((entry): entry is NonNullable<UserProfile['habitVersions']>[number] => {
        if (!entry || typeof entry !== 'object') return false
        const item = entry as Record<string, unknown>
        return typeof item.habitId === 'string' && item.habitId.length > 0 && typeof item.version === 'number'
      }).slice(0, 200)
      : undefined,
    updatedAt: typeof record.updatedAt === 'string' && record.updatedAt ? record.updatedAt : nowIso,
  }
}

export class UserProfileService {
  private readonly writeQueue = new SerialQueue()

  async load(): Promise<UserProfile> {
    const nowIso = new Date().toISOString()
    await knowledgeContractService.bootstrapWorkspace(undefined)
    try {
      const raw = await readFile(join(knowledgeRootPath(), PROFILE_FILE), 'utf8')
      return normalizeProfile(JSON.parse(raw) as unknown, nowIso)
    } catch {
      return defaultProfile(nowIso)
    }
  }

  async save(patch: Partial<Omit<UserProfile, 'version' | 'updatedAt'>>): Promise<UserProfile> {
    return this.writeQueue.run(async () => {
      const nowIso = new Date().toISOString()
      const current = await this.load()
      const next: UserProfile = normalizeProfile({ ...current, ...patch, version: 1, updatedAt: nowIso }, nowIso)
      const absolutePath = join(knowledgeRootPath(), PROFILE_FILE)
      await mkdir(dirname(absolutePath), { recursive: true })
      await writeFileAtomic(absolutePath, `${JSON.stringify(next, null, 2)}\n`)
      await knowledgeAuditService.record({
        action: 'user_profile_updated',
        targetType: 'fact',
        targetId: 'profile',
        before: null,
        after: { updatedAt: next.updatedAt },
        provenance: {
          workspaceId: 'user',
          workspaceName: 'user',
          workspacePath: '',
          source: 'system',
          sourceObservationIds: [],
          fileRefs: [],
          actor: 'user-memory',
          createdAt: nowIso,
        },
      })
      return next
    })
  }

  async recordHabitVersion(habitId: string, version: number, archived = false): Promise<UserProfile> {
    const current = await this.load()
    const kept = (current.habitVersions ?? []).filter((entry) => entry.habitId !== habitId)
    kept.push({ habitId, version, archived })
    return this.save({ habitVersions: kept.slice(-200) })
  }
}

export const userProfileService = new UserProfileService()
