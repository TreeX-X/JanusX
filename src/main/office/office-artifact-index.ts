import { extname, isAbsolute, join } from 'path'
import { lstat, readdir } from 'fs/promises'
import {
  OFFICE_EXTENSIONS,
  type OfficeExtension,
  type OfficeFileEntry,
  type OfficeFilesChangedEvent,
  type OfficeWatchErrorCode,
} from '../../shared/office'
import {
  resolveTrustedOfficeWorkspace,
  type ResolveWorkspaceRoot,
  type TrustedOfficeWorkspace,
} from './office-workspace-guard'

export const OFFICE_ARTIFACT_IGNORED_DIRECTORIES = new Set([
  '.git',
  '.janusx',
  'node_modules',
  'out',
  'dist',
  'build',
  'release',
])

export const OFFICE_ARTIFACT_SCAN_LIMITS = {
  maxVisitedEntries: 50_000,
  maxFiles: 2_000,
  maxDurationMs: 1_500,
} as const

type WatchEventType = 'change' | 'rename' | 'error'
type WatchSubscriber = (eventType: WatchEventType, filename: string | Buffer | null) => void

interface ArtifactIndexDependencies {
  subscribe(rootPath: string, subscriber: WatchSubscriber): () => void
  onChanged(event: OfficeFilesChangedEvent): void
  now(): number
  debounceMs: number
  maxVisitedEntries: number
  maxFiles: number
  maxDurationMs: number
}

interface WorkspaceIndexState {
  workspace: TrustedOfficeWorkspace
  entries: Map<string, OfficeFileEntry>
  directories: Set<string>
  pendingSignals: Set<Promise<boolean>>
  unsubscribe: () => void
  timer?: ReturnType<typeof setTimeout>
  fullReconcile: boolean
  targetedPaths: Set<string>
}

interface WorkspaceScan {
  entries: Map<string, OfficeFileEntry>
  directories: Set<string>
}

export class OfficeArtifactIndexError extends Error {
  constructor(readonly code: Extract<OfficeWatchErrorCode, 'SCAN_LIMIT' | 'IO'>) {
    super(code)
    this.name = 'OfficeArtifactIndexError'
  }
}

const defaultDependencies: ArtifactIndexDependencies = {
  subscribe: () => () => {},
  onChanged: () => {},
  now: Date.now,
  debounceMs: 200,
  ...OFFICE_ARTIFACT_SCAN_LIMITS,
}

function isOfficeExtension(value: string): value is OfficeExtension {
  return (OFFICE_EXTENSIONS as readonly string[]).includes(value)
}

function normalizedRelativePath(value: string): string | undefined {
  if (!value || /^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/.test(value) || isAbsolute(value)) return undefined
  const parts = value.split(/[\\/]+/).filter(Boolean)
  if (parts.length === 0 || parts.includes('..')) return undefined
  return parts.join('/')
}

function isIgnoredRelativePath(relPath: string): boolean {
  return relPath.split('/').some((part) => OFFICE_ARTIFACT_IGNORED_DIRECTORIES.has(part.toLowerCase()))
}

function snapshot(entries: Map<string, OfficeFileEntry>): OfficeFileEntry[] {
  return Array.from(entries.values(), (entry) => ({ ...entry }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs || left.relPath.localeCompare(right.relPath))
}

export class OfficeArtifactIndex {
  private readonly states = new Map<string, WorkspaceIndexState>()
  private readonly ensuring = new Map<string, Promise<WorkspaceIndexState>>()
  private readonly generations = new Map<string, number>()
  private readonly deps: ArtifactIndexDependencies

  constructor(
    private readonly resolveWorkspaceRoot: ResolveWorkspaceRoot,
    dependencies: Partial<ArtifactIndexDependencies> = {},
  ) {
    this.deps = { ...defaultDependencies, ...dependencies }
  }

  async list(workspaceId: string): Promise<OfficeFileEntry[]> {
    return snapshot((await this.ensure(workspaceId)).entries)
  }

  async ensure(workspaceId: string): Promise<WorkspaceIndexState> {
    const current = this.states.get(workspaceId)
    if (current) return current
    const inFlight = this.ensuring.get(workspaceId)
    if (inFlight) return inFlight

    const generation = this.generations.get(workspaceId) ?? 0
    let promise!: Promise<WorkspaceIndexState>
    promise = this.createState(workspaceId, generation).finally(() => {
      if (this.ensuring.get(workspaceId) === promise) {
        this.ensuring.delete(workspaceId)
        if (!this.states.has(workspaceId)) this.generations.delete(workspaceId)
      }
    })
    this.ensuring.set(workspaceId, promise)
    return promise
  }

  async reconcile(workspaceId: string, changedRelPath?: string): Promise<OfficeFileEntry[]> {
    const state = await this.ensure(workspaceId)
    const normalized = changedRelPath ? normalizedRelativePath(changedRelPath) : undefined
    if (normalized && isOfficeExtension(extname(normalized).toLowerCase()) && !isIgnoredRelativePath(normalized)) {
      await this.reconcileTarget(state, normalized)
    } else {
      const scan = await this.scanWorkspace(state.workspace.rootPath)
      state.entries = scan.entries
      state.directories = scan.directories
    }
    const entries = snapshot(state.entries)
    this.emit({ workspaceId, entries, reason: 'reconciled' })
    return entries
  }

  dispose(workspaceId?: string): void {
    if (workspaceId === undefined) {
      for (const id of new Set([...this.states.keys(), ...this.ensuring.keys()])) this.dispose(id)
      return
    }
    this.generations.set(workspaceId, (this.generations.get(workspaceId) ?? 0) + 1)
    const state = this.states.get(workspaceId)
    if (state) {
      if (state.timer) clearTimeout(state.timer)
      try {
        state.unsubscribe()
      } catch {}
      state.targetedPaths.clear()
      state.entries.clear()
      this.states.delete(workspaceId)
    }
    if (!this.ensuring.has(workspaceId)) this.generations.delete(workspaceId)
  }

  disposeAll(): void {
    this.dispose()
  }

  private async createState(workspaceId: string, generation: number): Promise<WorkspaceIndexState> {
    const workspace = await resolveTrustedOfficeWorkspace(workspaceId, this.resolveWorkspaceRoot)
    if ((this.generations.get(workspaceId) ?? 0) !== generation) {
      throw new OfficeArtifactIndexError('IO')
    }

    const state: WorkspaceIndexState = {
      workspace,
      entries: new Map(),
      directories: new Set(),
      pendingSignals: new Set(),
      unsubscribe: () => {},
      fullReconcile: false,
      targetedPaths: new Set(),
    }
    let initializing = true
    state.unsubscribe = this.deps.subscribe(workspace.rootPath, (eventType, filename) => {
      const pending = this.queueWatchSignal(state, eventType, filename)
      state.pendingSignals.add(pending)
      void pending.then((queued) => {
        state.pendingSignals.delete(pending)
        if (!initializing && queued && this.states.get(workspaceId) === state) {
          this.scheduleWatchFlush(workspaceId, state)
        }
      })
    })
    try {
      const initialScan = await this.scanWorkspace(workspace.rootPath)
      state.entries = initialScan.entries
      state.directories = initialScan.directories
      while (state.pendingSignals.size > 0) {
        await Promise.all(state.pendingSignals)
      }
      if ((this.generations.get(workspaceId) ?? 0) !== generation) {
        throw new OfficeArtifactIndexError('IO')
      }

      const fullReconcile = state.fullReconcile
      const targetedPaths = Array.from(state.targetedPaths)
      state.fullReconcile = false
      state.targetedPaths.clear()
      if (fullReconcile) {
        const scan = await this.scanWorkspace(workspace.rootPath)
        state.entries = scan.entries
        state.directories = scan.directories
      } else {
        await Promise.all(targetedPaths.map((relPath) => this.reconcileTarget(state, relPath)))
      }
      if ((this.generations.get(workspaceId) ?? 0) !== generation) {
        throw new OfficeArtifactIndexError('IO')
      }

      this.states.set(workspaceId, state)
      initializing = false
      this.emit({ workspaceId, entries: snapshot(state.entries), reason: 'initial' })
      if (state.fullReconcile || state.targetedPaths.size > 0) {
        this.scheduleWatchFlush(workspaceId, state)
      }
      return state
    } catch (error) {
      initializing = false
      state.unsubscribe()
      throw error
    }
  }

  private async queueWatchSignal(
    state: WorkspaceIndexState,
    eventType: WatchEventType,
    filename: string | Buffer | null,
  ): Promise<boolean> {
    if (eventType === 'error' || filename === null || Buffer.isBuffer(filename)) {
      state.fullReconcile = true
      return true
    }

    const relPath = normalizedRelativePath(filename)
    if (!relPath) {
      state.fullReconcile = true
      return true
    }
    if (isIgnoredRelativePath(relPath)) return false

    if (state.directories.has(relPath)) {
      state.fullReconcile = true
      return true
    }

    try {
      if ((await lstat(join(state.workspace.rootPath, ...relPath.split('/')))).isDirectory()) {
        state.fullReconcile = true
        return true
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        state.fullReconcile = true
        return true
      }
    }

    const extension = extname(relPath).toLowerCase()
    if (isOfficeExtension(extension)) {
      state.targetedPaths.add(relPath)
      return true
    }
    return false
  }

  private scheduleWatchFlush(workspaceId: string, state: WorkspaceIndexState): void {
    if (state.timer) clearTimeout(state.timer)
    state.timer = setTimeout(() => {
      state.timer = undefined
      void this.flushWatchChanges(workspaceId, state)
    }, this.deps.debounceMs)
    state.timer.unref?.()
  }

  private async flushWatchChanges(workspaceId: string, state: WorkspaceIndexState): Promise<void> {
    if (this.states.get(workspaceId) !== state) return
    const fullReconcile = state.fullReconcile
    const targetedPaths = Array.from(state.targetedPaths)
    state.fullReconcile = false
    state.targetedPaths.clear()
    try {
      if (fullReconcile) {
        const scan = await this.scanWorkspace(state.workspace.rootPath)
        state.entries = scan.entries
        state.directories = scan.directories
      } else {
        await Promise.all(targetedPaths.map((relPath) => this.reconcileTarget(state, relPath)))
      }
      if (this.states.get(workspaceId) !== state) return
      this.emit({ workspaceId, entries: snapshot(state.entries), reason: 'watch' })
    } catch {
      if (this.states.get(workspaceId) === state) {
        this.emit({ workspaceId, entries: snapshot(state.entries), reason: 'watch' })
      }
    }
  }

  private async scanWorkspace(rootPath: string): Promise<WorkspaceScan> {
    const startedAt = this.deps.now()
    const entries = new Map<string, OfficeFileEntry>()
    const directoryPaths = new Set<string>()
    const directories: Array<{ path: string; relPath: string }> = [{ path: rootPath, relPath: '' }]
    let visited = 0

    while (directories.length > 0) {
      const directory = directories.pop()!
      let children
      try {
        children = await readdir(directory.path, { withFileTypes: true })
      } catch {
        throw new OfficeArtifactIndexError('IO')
      }

      for (const child of children) {
        visited += 1
        if (visited > this.deps.maxVisitedEntries || this.deps.now() - startedAt > this.deps.maxDurationMs) {
          throw new OfficeArtifactIndexError('SCAN_LIMIT')
        }
        const relPath = directory.relPath ? `${directory.relPath}/${child.name}` : child.name
        if (child.isSymbolicLink()) continue
        if (child.isDirectory()) {
          if (!OFFICE_ARTIFACT_IGNORED_DIRECTORIES.has(child.name.toLowerCase())) {
            directoryPaths.add(relPath)
            directories.push({ path: join(directory.path, child.name), relPath })
          }
          continue
        }
        const extension = extname(child.name).toLowerCase()
        if (!child.isFile() || !isOfficeExtension(extension)) continue
        try {
          const fileStat = await lstat(join(directory.path, child.name))
          if (!fileStat.isFile() || fileStat.isSymbolicLink()) continue
          entries.set(relPath, { relPath, mtimeMs: fileStat.mtimeMs, size: fileStat.size, ext: extension })
          if (entries.size > this.deps.maxFiles) throw new OfficeArtifactIndexError('SCAN_LIMIT')
        } catch (error) {
          if (error instanceof OfficeArtifactIndexError) throw error
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new OfficeArtifactIndexError('IO')
        }
      }
    }
    return { entries, directories: directoryPaths }
  }

  private async reconcileTarget(state: WorkspaceIndexState, relPath: string): Promise<void> {
    const parts = relPath.split('/')
    let currentPath = state.workspace.rootPath
    try {
      for (let index = 0; index < parts.length; index++) {
        currentPath = join(currentPath, parts[index])
        const fileStat = await lstat(currentPath)
        if (fileStat.isSymbolicLink()) throw new Error('symlink')
        if (index < parts.length - 1 && !fileStat.isDirectory()) throw new Error('not-directory')
        if (index === parts.length - 1) {
          if (!fileStat.isFile()) throw new Error('not-file')
          const extension = extname(relPath).toLowerCase()
          if (!isOfficeExtension(extension)) throw new Error('not-office')
          state.entries.set(relPath, {
            relPath,
            mtimeMs: fileStat.mtimeMs,
            size: fileStat.size,
            ext: extension,
          })
        }
      }
    } catch {
      state.entries.delete(relPath)
    }
  }

  private emit(event: OfficeFilesChangedEvent): void {
    try {
      this.deps.onChanged(event)
    } catch {}
  }
}
