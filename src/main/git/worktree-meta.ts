// Note: per-worktree creation metadata for Ship base resolution — see
// .agents/notes/implemented/feature/2026-09-21-worktree-ship-merge.md
import { readFile } from 'fs/promises'
import { join } from 'path'
import { SerialQueue, writeFileAtomic } from '../lib/atomic-file'

export interface WorktreeMeta {
  startFrom: string
  branch: string
  createdAt: string
}

interface MetaDocument {
  version: 1
  byPath: Record<string, WorktreeMeta>
}

export class WorktreeMetaStore {
  private readonly queue = new SerialQueue()
  private cache: Record<string, WorktreeMeta> | null = null

  constructor(private readonly userDataDir?: string) {}

  private baseDir(): string | null {
    if (this.userDataDir) return this.userDataDir
    try {
      // Lazy so unit tests stay electron-free; production always resolves.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { app } = require('electron') as typeof import('electron')
      return app.getPath('userData')
    } catch {
      return null
    }
  }

  private storePath(): string | null {
    const base = this.baseDir()
    return base ? join(base, 'janusx', 'worktrees-meta.json') : null
  }

  private async load(): Promise<Record<string, WorktreeMeta>> {
    if (this.cache) return this.cache
    try {
      const storePath = this.storePath()
      if (!storePath) return (this.cache = {})
      const raw = await readFile(storePath, 'utf-8')
      const document = JSON.parse(raw) as Partial<MetaDocument>
      this.cache = document.byPath && typeof document.byPath === 'object' ? document.byPath : {}
    } catch {
      this.cache = {}
    }
    return this.cache
  }

  async get(worktreePath: string): Promise<WorktreeMeta | null> {
    const all = await this.load()
    return all[worktreePath] ?? null
  }

  async set(worktreePath: string, meta: WorktreeMeta): Promise<void> {
    const storePath = this.storePath()
    if (!storePath) return
    await this.queue.run(async () => {
      const all = await this.load()
      all[worktreePath] = meta
      const document: MetaDocument = { version: 1, byPath: all }
      await writeFileAtomic(storePath, `${JSON.stringify(document, null, 2)}\n`)
    })
  }

  async remove(worktreePath: string): Promise<void> {
    const storePath = this.storePath()
    if (!storePath) return
    await this.queue.run(async () => {
      const all = await this.load()
      if (!(worktreePath in all)) return
      delete all[worktreePath]
      const document: MetaDocument = { version: 1, byPath: all }
      await writeFileAtomic(storePath, `${JSON.stringify(document, null, 2)}\n`)
    })
  }
}

export const worktreeMetaStore = new WorktreeMetaStore()
