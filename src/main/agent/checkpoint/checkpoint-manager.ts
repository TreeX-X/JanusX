import { randomUUID } from 'crypto'
import { readFile, writeFile, mkdir, readdir, unlink, access, stat } from 'fs/promises'
import { join, relative } from 'path'
import type { AgentEngine } from '../types'
import type { ConversationCheckpoint, FileSnapshot, ConflictInfo, CheckpointCreateOptions } from './types'
import { BlobStore } from './blob-store'
import { GitAdapter } from './git-adapter'
import { generateUnifiedDiff, threeWayMerge, parseConflictMarkers } from './diff-engine'

const MAX_CHECKPOINTS = 40

export class CheckpointManager {
  private checkpoints = new Map<string, ConversationCheckpoint>()
  private blobStore!: BlobStore
  private gitAdapter = new GitAdapter()
  private storagePath = ''
  private workspacePath = ''
  private conversationCounters = new Map<string, number>()

  async initialize(workspacePath: string): Promise<void> {
    // Validate workspace path exists and is a directory
    try {
      const st = await stat(workspacePath)
      if (!st.isDirectory()) throw new Error(`Not a directory: ${workspacePath}`)
    } catch {
      throw new Error(`工作区路径不存在或不是目录: ${workspacePath}`)
    }

    const newPath = join(workspacePath, '.janusX', 'checkpoints')

    // Only clear + reinitialize if this is a new workspace or first init
    if (this.storagePath === newPath) return

    this.workspacePath = workspacePath
    this.storagePath = newPath

    // Clear stale checkpoint files from previous sessions (disk only, safe — memory is empty)
    await this.clearDiskCheckpoints()

    await mkdir(join(this.storagePath, 'blobs'), { recursive: true })
    this.blobStore = new BlobStore(join(this.storagePath, 'blobs'))
    await this.blobStore.initialize()
    await this.loadIndex()
  }

  async createCheckpoint(options: CheckpointCreateOptions): Promise<ConversationCheckpoint> {
    const id = randomUUID()
    const branch = await this.gitAdapter.getCurrentBranch(options.cwd).catch(() => 'unknown')

    // Track conversation index per terminal
    const counterKey = options.terminalId
    const currentIndex = (this.conversationCounters.get(counterKey) ?? 0) + 1
    this.conversationCounters.set(counterKey, currentIndex)

    // Stash FIRST to get a clean working directory, then snapshot HEAD state
    const stashRef = await this.gitAdapter.stashPush(options.cwd, `janusx:${options.terminalId}:${id}`)

    // Snapshot tracked files (now against clean HEAD)
    const files: Record<string, FileSnapshot> = {}
    const trackedFiles = await this.gitAdapter.listTrackedFiles(options.cwd)

    for (const filePath of trackedFiles.slice(0, 200)) {
      try {
        const fullPath = join(options.cwd, filePath)
        const content = await readFile(fullPath)
        const hash = await this.blobStore.store(content)
        files[filePath] = { beforeHash: hash }
      } catch { /* file may be inaccessible */ }
    }

    const checkpoint: ConversationCheckpoint = {
      id,
      terminalId: options.terminalId,
      conversationIndex: currentIndex,
      createdAt: new Date().toISOString(),
      engine: options.engine,
      branch,
      prompt: options.prompt,
      stashRef,
      filesSnapshot: files,
      status: 'pending',
    }

    this.checkpoints.set(id, checkpoint)
    await this.saveCheckpoint(checkpoint)

    // Auto-prune oldest checkpoints beyond retention limit (fire-and-forget)
    this.pruneOldCheckpoints().catch(() => {})

    return checkpoint
  }

  /**
   * Atomically finalize the previous checkpoint (if any) and create a new one.
   * This prevents race conditions between separate finalize and create calls.
   */
  async finalizeAndCreateCheckpoint(
    previousCheckpointId: string | null,
    options: CheckpointCreateOptions,
  ): Promise<{ finalized: boolean; checkpoint: ConversationCheckpoint }> {
    // Step 1: Finalize previous checkpoint FIRST (reads current file state before stash)
    let finalized = false
    if (previousCheckpointId) {
      try {
        await this.finalizeCheckpoint(previousCheckpointId, options.cwd)
        finalized = true
      } catch (err) {
        console.error('Checkpoint finalize failed (continuing with create):', err)
      }
    }

    // Step 2: Create new checkpoint (stashes changes, snapshots clean state)
    const checkpoint = await this.createCheckpoint(options)
    return { finalized, checkpoint }
  }

  async finalizeCheckpoint(checkpointId: string, cwd: string): Promise<void> {
    const checkpoint = this.checkpoints.get(checkpointId)
    if (!checkpoint) throw new Error(`Checkpoint not found: ${checkpointId}`)

    for (const [filePath, snapshot] of Object.entries(checkpoint.filesSnapshot)) {
      try {
        const fullPath = join(cwd, filePath)
        const content = await readFile(fullPath)
        const afterHash = await this.blobStore.store(content)

        if (afterHash !== snapshot.beforeHash) {
          snapshot.afterHash = afterHash
          // Generate diff
          const beforeContent = await this.blobStore.retrieve(snapshot.beforeHash)
          if (beforeContent) {
            snapshot.diff = generateUnifiedDiff(filePath, beforeContent.toString(), content.toString())
          }
        }
      } catch { /* file may have been deleted */ }
    }

    checkpoint.status = 'finalized'
    await this.saveCheckpoint(checkpoint)
  }

  async restoreCheckpoint(checkpointId: string, cwd: string): Promise<{ conflicts: ConflictInfo[] }> {
    const checkpoint = this.checkpoints.get(checkpointId)
    if (!checkpoint) throw new Error(`Checkpoint not found: ${checkpointId}`)

    const conflicts: ConflictInfo[] = []

    for (const [filePath, snapshot] of Object.entries(checkpoint.filesSnapshot)) {
      const beforeContent = await this.blobStore.retrieve(snapshot.beforeHash)
      if (!beforeContent) continue

      if (!snapshot.afterHash) {
        // File wasn't changed by this conversation, skip
        continue
      }

      try {
        const fullPath = join(cwd, filePath)
        const currentContent = await readFile(fullPath)
        const currentHash = (await this.blobStore.store(currentContent)).toString()

        if (currentHash === snapshot.afterHash) {
          // File unchanged since conversation end - safe direct restore
          await writeFile(fullPath, beforeContent)
        } else {
          // File was modified by another terminal - 3-way merge
          const result = threeWayMerge(
            beforeContent.toString(),
            beforeContent.toString(), // "ours" = the version we want to restore
            currentContent.toString(),
          )

          await writeFile(fullPath, result.merged)

          if (result.conflicts) {
            conflicts.push({ filePath, resolution: 'manual' })
          }
        }
      } catch { /* file may not exist */ }
    }

    return { conflicts }
  }

  async listCheckpoints(filter?: { terminalId?: string; engine?: AgentEngine }): Promise<ConversationCheckpoint[]> {
    let results = Array.from(this.checkpoints.values())
    if (filter?.terminalId) results = results.filter(cp => cp.terminalId === filter.terminalId)
    if (filter?.engine) results = results.filter(cp => cp.engine === filter.engine)
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async deleteCheckpoint(checkpointId: string): Promise<void> {
    const checkpoint = this.checkpoints.get(checkpointId)
    if (!checkpoint) return

    this.checkpoints.delete(checkpointId)

    try {
      await unlink(join(this.storagePath, `${checkpointId}.json`))
    } catch { /* may not exist */ }

    // Drop git stash if exists
    if (checkpoint.stashRef && this.workspacePath) {
      await this.gitAdapter.stashDrop(this.workspacePath, checkpoint.stashRef).catch(() => {})
    }
  }

  /** Evict oldest finalized checkpoints beyond MAX_CHECKPOINTS. */
  private async pruneOldCheckpoints(): Promise<void> {
    const finalized = Array.from(this.checkpoints.values())
      .filter(cp => cp.status === 'finalized')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

    const excess = finalized.length - MAX_CHECKPOINTS
    if (excess <= 0) return

    const toRemove = finalized.slice(0, excess)
    for (const cp of toRemove) {
      await this.deleteCheckpoint(cp.id)
    }
  }

  /** Startup cleanup: delete checkpoint JSON files from disk only. No stash or memory operations. */
  private async clearDiskCheckpoints(): Promise<void> {
    try {
      const files = await readdir(this.storagePath)
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        try {
          await unlink(join(this.storagePath, file))
        } catch { /* skip locked or missing files */ }
      }
    } catch { /* directory may not exist yet — first run, nothing to clear */ }
  }

  async clearAll(): Promise<void> {
    const all = Array.from(this.checkpoints.values())
    for (const cp of all) {
      if (cp.stashRef && this.workspacePath) {
        await this.gitAdapter.stashDrop(this.workspacePath, cp.stashRef).catch(() => {})
      }
      try {
        await unlink(join(this.storagePath, `${cp.id}.json`))
      } catch { /* may not exist */ }
    }
    this.checkpoints.clear()
    this.conversationCounters.clear()
    try {
      await unlink(join(this.storagePath, 'index.json'))
    } catch { /* may not exist */ }
  }

  async getDiff(checkpointId: string, filePath: string): Promise<string> {
    const checkpoint = this.checkpoints.get(checkpointId)
    if (!checkpoint) return ''
    const snapshot = checkpoint.filesSnapshot[filePath]
    if (!snapshot?.diff) return ''
    return snapshot.diff
  }

  async getAllDiffs(checkpointId: string): Promise<string> {
    const checkpoint = this.checkpoints.get(checkpointId)
    if (!checkpoint) return ''
    const parts: string[] = []
    for (const [filePath, snapshot] of Object.entries(checkpoint.filesSnapshot)) {
      if (snapshot.diff) {
        parts.push(snapshot.diff)
      }
    }
    return parts.join('\n')
  }

  private async saveCheckpoint(checkpoint: ConversationCheckpoint): Promise<void> {
    // Ensure directory exists before writing — handles cases where
    // initialize() was called with a different cwd or directory was deleted
    await mkdir(this.storagePath, { recursive: true })
    const data = JSON.stringify(checkpoint, null, 2)
    await writeFile(join(this.storagePath, `${checkpoint.id}.json`), data)
    await this.saveIndex()
  }

  private async loadIndex(): Promise<void> {
    try {
      const files = await readdir(this.storagePath)
      for (const file of files) {
        if (!file.endsWith('.json') || file === 'index.json') continue
        try {
          const data = await readFile(join(this.storagePath, file), 'utf-8')
          const cp = JSON.parse(data) as ConversationCheckpoint
          this.checkpoints.set(cp.id, cp)
          // Restore conversation counter
          const current = this.conversationCounters.get(cp.terminalId) ?? 0
          if (cp.conversationIndex > current) {
            this.conversationCounters.set(cp.terminalId, cp.conversationIndex)
          }
        } catch { /* skip corrupt files */ }
      }
    } catch { /* directory may not exist yet */ }
  }

  private async saveIndex(): Promise<void> {
    await mkdir(this.storagePath, { recursive: true })
    const index = {
      version: 1,
      checkpointIds: Array.from(this.checkpoints.keys()),
    }
    await writeFile(join(this.storagePath, 'index.json'), JSON.stringify(index, null, 2))
  }
}

export const checkpointManager = new CheckpointManager()
