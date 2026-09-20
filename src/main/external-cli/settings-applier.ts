import { homedir } from 'os'
import { copyFile, mkdir, readdir, readFile, rm } from 'fs/promises'
import { basename, dirname, join } from 'path'
import type { ExternalCliApplyInput } from '../../shared/ipc/external-cli'
import { SerialQueue, writeFileAtomic } from '../lib/atomic-file'

/** 回写时唯一允许触碰的键；其余字段（含 hooks、permissions 与未知键）必须原样保留。 */
export const CLAUDE_MANAGED_ENV_KEYS = {
  baseURL: 'ANTHROPIC_BASE_URL',
  authToken: 'ANTHROPIC_AUTH_TOKEN',
  model: 'ANTHROPIC_MODEL',
} as const
export const CLAUDE_MANAGED_TOP_LEVEL_MODEL = 'model'

const BACKUP_KEEP_COUNT = 10

export interface ClaudeApplyResult {
  backupPath: string | null
  applied: { baseURL: string; model?: string }
}

function backupFileName(): string {
  return `settings.json.bak-${Date.now()}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class ClaudeSettingsApplier {
  private readonly queue = new SerialQueue()

  constructor(private readonly homeDir: string = homedir()) {}

  settingsPath(): string {
    return join(this.homeDir, '.claude', 'settings.json')
  }

  private backupDir(): string {
    return join(this.homeDir, '.claude', 'janusx-backups')
  }

  private async readLive(): Promise<{ existed: boolean; settings: Record<string, unknown> }> {
    const path = this.settingsPath()
    try {
      const raw = (await readFile(path, 'utf8')).replace(/^\uFEFF/, '')
      if (!raw.trim()) return { existed: true, settings: {} }
      const parsed: unknown = JSON.parse(raw)
      if (!isRecord(parsed)) throw new Error(`${path} must contain a JSON object`)
      return { existed: true, settings: parsed }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { existed: false, settings: {} }
      throw error
    }
  }

  private async snapshotLive(): Promise<string> {
    const dir = this.backupDir()
    await mkdir(dir, { recursive: true })
    const backupPath = join(dir, backupFileName())
    await copyFile(this.settingsPath(), backupPath)
    await this.pruneBackups(dir)
    return backupPath
  }

  private async pruneBackups(dir: string): Promise<void> {
    const entries = (await readdir(dir)).filter(name => name.startsWith('settings.json.bak-')).sort()
    const overflow = entries.slice(0, Math.max(0, entries.length - BACKUP_KEEP_COUNT))
    await Promise.all(overflow.map(name => rm(join(dir, name), { force: true })))
  }

  private async newestBackup(): Promise<string | null> {
    try {
      const entries = (await readdir(this.backupDir())).filter(name => name.startsWith('settings.json.bak-')).sort()
      const newest = entries[entries.length - 1]
      return newest ? join(this.backupDir(), newest) : null
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  /** 应用凭证三元组：备份→只替换自有键→原子写→重读校验。调用方必须串行，此处再加一层队列兜底。 */
  async apply(input: ExternalCliApplyInput): Promise<ClaudeApplyResult> {
    const baseURL = input.baseURL.trim()
    const authToken = input.authToken.trim()
    const model = input.model?.trim() ?? ''
    if (!baseURL || !authToken) throw new Error('Base URL and auth token are required.')
    return this.queue.run(async () => {
      const live = await this.readLive()
      const backupPath = live.existed ? await this.snapshotLive() : null
      const next: Record<string, unknown> = { ...live.settings }
      const env: Record<string, unknown> = isRecord(next['env']) ? { ...(next['env'] as Record<string, unknown>) } : {}
      env[CLAUDE_MANAGED_ENV_KEYS.baseURL] = baseURL
      env[CLAUDE_MANAGED_ENV_KEYS.authToken] = authToken
      if (model) {
        env[CLAUDE_MANAGED_ENV_KEYS.model] = model
        next[CLAUDE_MANAGED_TOP_LEVEL_MODEL] = model
      }
      next['env'] = env
      await mkdir(dirname(this.settingsPath()), { recursive: true })
      await writeFileAtomic(this.settingsPath(), `${JSON.stringify(next, null, 2)}\n`)
      // 重读校验：写后即验，写坏（磁盘/并发外部写）立刻报错而不谎称成功。
      const verified = await this.readLive()
      const verifiedEnv = isRecord(verified.settings['env']) ? (verified.settings['env'] as Record<string, unknown>) : {}
      const ok = verifiedEnv[CLAUDE_MANAGED_ENV_KEYS.baseURL] === baseURL &&
        verifiedEnv[CLAUDE_MANAGED_ENV_KEYS.authToken] === authToken &&
        (!model || (verifiedEnv[CLAUDE_MANAGED_ENV_KEYS.model] === model && verified.settings[CLAUDE_MANAGED_TOP_LEVEL_MODEL] === model))
      if (!ok) throw new Error('Live settings verification failed after apply.')
      return { backupPath, applied: { baseURL, ...(model ? { model } : {}) } }
    })
  }

  /** 回滚到最近一次备份；备份不存在则明确报错，绝不凭空构造配置。 */
  async rollback(): Promise<{ backupPath: string }> {
    return this.queue.run(async () => {
      const backupPath = await this.newestBackup()
      if (!backupPath) throw new Error('No backup found to roll back to.')
      const raw = await readFile(backupPath, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (!isRecord(parsed)) throw new Error(`Backup is corrupt: ${basename(backupPath)}`)
      await mkdir(dirname(this.settingsPath()), { recursive: true })
      await writeFileAtomic(this.settingsPath(), `${JSON.stringify(parsed, null, 2)}\n`)
      return { backupPath }
    })
  }
}

export const claudeSettingsApplier = new ClaudeSettingsApplier()
