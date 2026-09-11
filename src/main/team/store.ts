/**
 * @file 团队本地存储（ToB M2）
 * @description 单文件 JSON（`team/store.json`）+ temp+rename 原子写 + 串行队列。
 *              机密（密码哈希）在内存与落盘均只存 salt+hash，不存明文。
 */

import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname } from 'path'
import type { Device, Invite, Membership, Project, Tenant, User } from '../../shared/team/types'
import { teamStoreFile } from './paths'

export interface StoredUser extends User {
  passSalt: string
  passHash: string
  /** 全局会话版本：登出全部设备 / 禁用账号时递增，旧 access 立刻失效。 */
  tokenVersion: number
}

export interface StoredDevice extends Device {
  /** 单设备会话版本：本设备登出时递增，不影响其他设备。 */
  rev: number
}

export interface RefreshRecord {
  rid: string
  userId: string
  deviceId: string
  revoked: boolean
  expiresAt: number
}

export interface TeamDocs {
  version: 1
  users: StoredUser[]
  tenants: Tenant[]
  projects: Project[]
  memberships: Membership[]
  invites: Invite[]
  devices: StoredDevice[]
  refresh: RefreshRecord[]
}

const EMPTY_DOCS: TeamDocs = {
  version: 1,
  users: [],
  tenants: [],
  projects: [],
  memberships: [],
  invites: [],
  devices: [],
  refresh: [],
}

let queue = Promise.resolve()

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const previous = queue
  let release!: () => void
  queue = new Promise<void>((resolve) => { release = resolve })
  return previous.then(operation).finally(release)
}

export class TeamStore {
  private cache: TeamDocs | null = null

  async load(): Promise<TeamDocs> {
    if (this.cache) return this.cache
    try {
      const raw = await readFile(teamStoreFile(), 'utf8')
      const parsed = JSON.parse(raw) as Partial<TeamDocs>
      this.cache = { ...EMPTY_DOCS, ...parsed }
    } catch {
      this.cache = structuredClone(EMPTY_DOCS)
    }
    return this.cache
  }

  /** 读改写：fn 内可直接改 docs，结束自动落盘。 */
  async mutate<T>(fn: (docs: TeamDocs) => T | Promise<T>): Promise<T> {
    return serialized(async () => {
      const docs = await this.load()
      const result = await fn(docs)
      await this.persistLocked(docs)
      return result
    })
  }

  async read<T>(fn: (docs: TeamDocs) => T | Promise<T>): Promise<T> {
    const docs = await this.load()
    return fn(docs)
  }

  private async persistLocked(docs: TeamDocs): Promise<void> {
    const file = teamStoreFile()
    await mkdir(dirname(file), { recursive: true })
    const temp = `${file}.tmp-${process.pid}-${Date.now()}`
    await writeFile(temp, JSON.stringify(docs, null, 2), 'utf8')
    await rename(temp, file)
  }
}

export const teamStore = new TeamStore()
