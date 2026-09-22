// Note: stable session identity over volatile terminal ids for workspace
// session cards, scoped checkpoints, and Continue handoff — see
// .agents/notes/implemented/feature/2026-09-21-workspace-sessions-v1.md
// Note: external provider sessions import by transcript backfill — see
// .agents/notes/implemented/feature/2026-09-22-external-session-backfill.md
import { randomUUID } from 'crypto'
import { copyFile, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import { SerialQueue, writeFileAtomic } from '../lib/atomic-file'
import type {
  AgentSessionDetail,
  AgentSessionStatus,
  AgentSessionSummary,
  AgentSessionTurnKind,
  SessionFilter,
  SessionTurnRecord,
  ShellRestoreManifest,
} from '../../shared/ipc/session'

export interface AgentSessionRecord extends AgentSessionDetail {
  shell?: string
  preset?: string
  command?: string
  args?: string[]
  lastPrompt: string
  checkpointIds: string[]
}

export interface ImportExternalSessionInput {
  engine: string
  cwd: string
  providerSessionId: string
  transcriptPath: string
  firstPrompt: string
  lastExcerpt?: string
  turnCount: number
  createdAt?: string
  updatedAt?: string
}

interface SessionStoreDocument {
  version: 1
  sessions: AgentSessionRecord[]
}

const STORE_FILE = 'agent-sessions.json'
const LAYOUT_FILE = 'shell-restore.json'
const MAX_SESSIONS = 200
const MAX_TURNS_PER_SESSION = 50
const MAX_RESTORE_TERMINALS = 10

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class AgentSessionRegistry {
  private readonly sessions = new Map<string, AgentSessionRecord>()
  private readonly terminalToSession = new Map<string, string>()
  private readonly pendingTurnStart = new Map<string, string>()
  private readonly pendingTurnPrompt = new Map<string, string>()
  private readonly writeQueue = new SerialQueue()
  private changeListener?: (sessionId?: string) => void
  private loadTask: Promise<void> | null = null
  private loadOk = false

  constructor(private readonly userDataDir?: string) {}

  setChangeListener(listener?: (sessionId?: string) => void): void {
    this.changeListener = listener
  }

  private notify(sessionId?: string): void {
    try {
      this.changeListener?.(sessionId)
    } catch (err) {
      console.error('[sessions] change listener failed:', err)
    }
  }

  private storePath(): string {
    const base = this.userDataDir ?? app.getPath('userData')
    return join(base, 'janusx', STORE_FILE)
  }

  /** Load persisted sessions; corrupt files recover to empty without failing. */
  load(): Promise<void> {
    return this.ensureLoaded()
  }

  private ensureLoaded(): Promise<void> {
    return (this.loadTask ??= this.doLoad())
  }

  private async doLoad(): Promise<void> {
    try {
      const raw = await readFile(this.storePath(), 'utf-8')
      const document = JSON.parse(raw) as Partial<SessionStoreDocument>
      if (!isRecord(document) || !Array.isArray(document.sessions)) {
        console.error('[sessions] store has unexpected shape; writes paused to protect disk state')
        return
      }
      for (const entry of document.sessions) {
        if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.cwd !== 'string') continue
        const record = entry as unknown as AgentSessionRecord
        this.sessions.set(record.id, {
          ...record,
          terminalIds: Array.isArray(record.terminalIds) ? record.terminalIds : [],
          turns: Array.isArray(record.turns) ? record.turns.slice(-MAX_TURNS_PER_SESSION) : [],
          checkpointIds: Array.isArray(record.checkpointIds) ? record.checkpointIds : [],
          archived: record.archived === true,
          external: record.external === true || undefined,
        })
      }
      this.loadOk = true
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        // Fresh start: no store yet, writes proceed.
        this.loadOk = true
        return
      }
      console.error('[sessions] store failed to load; writes paused to protect disk state')
    }
  }

  private persist(): void {
    // Mutations gate on load so a fresh process never clobbers disk state
    // it has not read yet; a failed load pauses writes instead of
    // overwriting possibly valid data with a partial view.
    void this.ensureLoaded()
      .then(() => {
        if (!this.loadOk) {
          console.error('[sessions] persist refused: store failed to load')
          return undefined
        }
        return this.writeQueue.run(async () => {
          const path = this.storePath()
          // One-level rollback copy; failures here never block the write.
          await copyFile(path, `${path}.prev`).catch(() => undefined)
          const document: SessionStoreDocument = {
            version: 1,
            sessions: Array.from(this.sessions.values()),
          }
          await writeFileAtomic(path, `${JSON.stringify(document, null, 2)}\n`)
        })
      })
      .catch((err) => console.error('[sessions] persist failed:', err))
  }

  /** Drain pending persists (tests and shutdown paths). */
  flush(): Promise<void> {
    return this.ensureLoaded().then(() => this.writeQueue.run(() => Promise.resolve()))
  }

  private layoutPath(): string {
    const base = this.userDataDir ?? app.getPath('userData')
    return join(base, 'janusx', LAYOUT_FILE)
  }

  /**
   * One-shot cold-restore manifest: shell terminals per workspace, never
   * agents. Consumed once on boot, then cleared by the caller.
   */
  async saveLayout(manifest: ShellRestoreManifest): Promise<void> {
    const clean: ShellRestoreManifest = {
      version: 1,
      savedAt: new Date().toISOString(),
      workspaces: manifest.workspaces
        .filter((entry) => typeof entry.workspaceId === 'string' && Array.isArray(entry.terminals))
        .map((entry) => ({
          workspaceId: entry.workspaceId,
          terminals: entry.terminals
            .filter((terminal) => typeof terminal.cwd === 'string' && terminal.cwd)
            .slice(0, MAX_RESTORE_TERMINALS)
            .map((terminal) => ({
              cwd: terminal.cwd,
              preset: typeof terminal.preset === 'string' ? terminal.preset : 'shell',
              name: typeof terminal.name === 'string' ? terminal.name.slice(0, 80) : 'shell',
            })),
        }))
        .filter((entry) => entry.terminals.length > 0),
    }
    await writeFileAtomic(this.layoutPath(), `${JSON.stringify(clean, null, 2)}\n`)
  }

  async getLayout(): Promise<ShellRestoreManifest | null> {
    try {
      const raw = await readFile(this.layoutPath(), 'utf-8')
      const parsed = JSON.parse(raw) as Partial<ShellRestoreManifest>
      if (parsed.version !== 1 || !Array.isArray(parsed.workspaces)) return null
      return parsed as ShellRestoreManifest
    } catch {
      return null
    }
  }

  async clearLayout(): Promise<void> {
    await rm(this.layoutPath(), { force: true }).catch(() => undefined)
  }

  createSession(input: {
    terminalId: string
    workspaceId: string
    engine: string
    cwd: string
    shell?: string
    preset?: string
    command?: string
    args?: string[]
    branch?: string
    providerSessionId?: string
    transcriptPath?: string
    continuedFrom?: string
  }): AgentSessionRecord {
    const now = new Date().toISOString()
    const record: AgentSessionRecord = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      engine: input.engine,
      cwd: input.cwd,
      branch: input.branch,
      shell: input.shell,
      preset: input.preset,
      command: input.command,
      args: input.args,
      firstPrompt: '',
      lastPrompt: '',
      turnCount: 0,
      checkpointCount: 0,
      status: 'active',
      providerSessionId: input.providerSessionId,
      transcriptPath: input.transcriptPath,
      continuedFrom: input.continuedFrom,
      terminalIds: [input.terminalId],
      turns: [],
      checkpointIds: [],
      createdAt: now,
      updatedAt: now,
      archived: false,
    }
    this.sessions.set(record.id, record)
    this.terminalToSession.set(input.terminalId, record.id)
    this.prune()
    this.persist()
    this.notify(record.id)
    return record
  }

  sessionIdForTerminal(terminalId: string): string | null {
    return this.terminalToSession.get(terminalId) ?? null
  }

  /** Transcript path persisted for the terminal session, if any. */
  transcriptPathForTerminal(terminalId: string): string | undefined {
    const record = this.recordForTerminal(terminalId)
    return record?.transcriptPath
  }

  /** Provider session id persisted for the terminal session, if any. */
  providerSessionIdForTerminal(terminalId: string): string | undefined {
    const record = this.recordForTerminal(terminalId)
    return record?.providerSessionId
  }

  noteTerminal(terminalId: string, sessionId: string): void {
    const record = this.sessions.get(sessionId)
    if (!record) return
    if (!record.terminalIds.includes(terminalId)) record.terminalIds.push(terminalId)
    this.terminalToSession.set(terminalId, sessionId)
    record.updatedAt = new Date().toISOString()
    this.persist()
  }

  notePrompt(terminalId: string, prompt: string): void {
    const record = this.recordForTerminal(terminalId)
    if (!record || !prompt.trim()) return
    if (!record.firstPrompt) record.firstPrompt = prompt
    record.lastPrompt = prompt
    record.status = 'active'
    this.pendingTurnStart.set(record.id, new Date().toISOString())
    // Question snapshot source: consumed once by recordTurnEnd so the turn
    // owns its prompt even after checkpoint prune.
    this.pendingTurnPrompt.set(record.id, prompt)
    record.updatedAt = new Date().toISOString()
    this.persist()
    // Card-visible mutation (first prompt, active status): push session:event
    // so the panel refreshes on submit, not only on turn end.
    this.notify(record.id)
  }

  noteCheckpoint(terminalId: string, checkpointId: string): void {
    const record = this.recordForTerminal(terminalId)
    if (!record) return
    if (!record.checkpointIds.includes(checkpointId)) {
      record.checkpointIds.push(checkpointId)
      record.checkpointCount = record.checkpointIds.length
    }
    record.updatedAt = new Date().toISOString()
    this.persist()
    // Card-visible mutation (checkpoint count): push session:event so the
    // panel refreshes on checkpoint creation, not only on turn end.
    this.notify(record.id)
  }

  /**
   * Drops checkpoint ids that no longer exist in storage (restore prune,
   * retention caps) so the card count matches the session-scoped list.
   * Turn records keep their own checkpoint references and never shrink here.
   */
  retainCheckpoints(sessionId: string, liveIds: Set<string>): void {
    const record = this.sessions.get(sessionId)
    if (!record) return
    const kept = record.checkpointIds.filter((id) => liveIds.has(id))
    if (kept.length === record.checkpointIds.length) return
    record.checkpointIds = kept
    record.checkpointCount = kept.length
    record.updatedAt = new Date().toISOString()
    this.persist()
  }

  noteProviderSession(terminalId: string, providerSessionId?: string, transcriptPath?: string): void {
    const record = this.recordForTerminal(terminalId)
    if (!record) return
    // Hot path: every hook payload carrying a session id lands here. Emit
    // session:event only when a card-visible field actually changes, otherwise
    // each tool call would refetch and reorder the panel.
    let changed = false
    if (providerSessionId && record.providerSessionId !== providerSessionId) {
      record.providerSessionId = providerSessionId
      changed = true
    }
    if (transcriptPath && record.transcriptPath !== transcriptPath) {
      record.transcriptPath = transcriptPath
      changed = true
    }
    if (!changed) return
    record.updatedAt = new Date().toISOString()
    this.persist()
    this.notify(record.id)
  }

  recordTurnEnd(
    terminalId: string,
    kind: AgentSessionTurnKind,
    checkpointId?: string,
    excerpt?: string,
  ): void {
    const record = this.recordForTerminal(terminalId)
    if (!record) return
    const now = new Date().toISOString()
    const prompt = this.pendingTurnPrompt.get(record.id)
    this.pendingTurnPrompt.delete(record.id)
    const turn: SessionTurnRecord = {
      id: randomUUID(),
      kind,
      checkpointId: checkpointId ?? record.checkpointIds.at(-1),
      startedAt: this.pendingTurnStart.get(record.id) ?? now,
      endedAt: now,
      ...(prompt ? { prompt } : {}),
      ...(excerpt ? { excerpt } : {}),
    }
    this.pendingTurnStart.delete(record.id)
    record.turns.push(turn)
    if (record.turns.length > MAX_TURNS_PER_SESSION) {
      record.turns.splice(0, record.turns.length - MAX_TURNS_PER_SESSION)
    }
    record.turnCount += 1
    record.status = kind === 'done' ? 'done' : kind
    record.updatedAt = now
    this.persist()
    this.notify(record.id)
  }

  noteBranch(terminalId: string, branch: string): void {
    const record = this.recordForTerminal(terminalId)
    if (!record || !branch || record.branch === branch) return
    record.branch = branch
    record.updatedAt = new Date().toISOString()
    this.persist()
    this.notify(record.id)
  }

  detachTerminal(terminalId: string): void {
    this.terminalToSession.delete(terminalId)
    this.persist()
  }

  /**
   * Import a provider transcript as a read-only external session. Hook-owned
   * sessions stay the source of truth: when the same engine plus provider id
   * already exists as a live session, the import only backfills a missing
   * transcript path and never overwrites turns. Repeat scans match on the
   * same key and refresh excerpt, count, and timestamps without duplicating.
   */
  importExternalSession(input: ImportExternalSessionInput): AgentSessionRecord {
    const engine = input.engine.trim()
    const cwd = input.cwd.trim()
    const providerSessionId = input.providerSessionId.trim()
    const transcriptPath = input.transcriptPath.trim()
    if (!engine || !cwd || !providerSessionId || !transcriptPath) {
      throw new Error('importExternalSession requires engine, cwd, providerSessionId, and transcriptPath')
    }
    const now = new Date().toISOString()
    const createdAt = toImportTimestamp(input.createdAt) ?? toImportTimestamp(input.updatedAt) ?? now
    const updatedAt = toImportTimestamp(input.updatedAt) ?? toImportTimestamp(input.createdAt) ?? now
    const firstPrompt = input.firstPrompt.trim()
    const lastExcerpt = input.lastExcerpt?.trim() ? input.lastExcerpt.trim() : undefined
    const turnCount = Number.isFinite(input.turnCount) ? Math.max(0, Math.floor(input.turnCount)) : 0

    const existing = Array.from(this.sessions.values()).find(
      (record) => record.engine === engine && record.providerSessionId === providerSessionId,
    )
    if (existing) {
      if (existing.external !== true) {
        if (!existing.transcriptPath) {
          existing.transcriptPath = transcriptPath
          existing.updatedAt = updatedAt > existing.updatedAt ? updatedAt : existing.updatedAt
          this.persist()
          this.notify(existing.id)
        }
        return existing
      }
      let changed = false
      if (!existing.firstPrompt && firstPrompt) {
        existing.firstPrompt = firstPrompt
        existing.lastPrompt = firstPrompt
        changed = true
      }
      if (turnCount > existing.turnCount) {
        existing.turnCount = turnCount
        changed = true
      }
      if (existing.transcriptPath !== transcriptPath) {
        existing.transcriptPath = transcriptPath
        changed = true
      }
      if (updatedAt > existing.updatedAt) {
        existing.updatedAt = updatedAt
        changed = true
      }
      const seed = existing.turns[0]
      if (seed && lastExcerpt && seed.excerpt !== lastExcerpt) {
        seed.excerpt = lastExcerpt
        seed.endedAt = existing.updatedAt
        changed = true
      }
      if (seed && firstPrompt && !seed.prompt) {
        seed.prompt = firstPrompt
        changed = true
      }
      if (changed) {
        this.persist()
        this.notify(existing.id)
      }
      return existing
    }

    const record: AgentSessionRecord = {
      id: randomUUID(),
      workspaceId: '',
      engine,
      cwd,
      branch: undefined,
      shell: undefined,
      preset: undefined,
      command: undefined,
      args: undefined,
      firstPrompt,
      lastPrompt: firstPrompt,
      turnCount,
      checkpointCount: 0,
      status: 'done',
      providerSessionId,
      transcriptPath,
      continuedFrom: undefined,
      terminalIds: [],
      turns:
        firstPrompt || lastExcerpt
          ? [
              {
                id: randomUUID(),
                kind: 'done',
                startedAt: createdAt,
                endedAt: updatedAt,
                ...(firstPrompt ? { prompt: firstPrompt } : {}),
                ...(lastExcerpt ? { excerpt: lastExcerpt } : {}),
              },
            ]
          : [],
      checkpointIds: [],
      createdAt,
      updatedAt,
      archived: false,
      external: true,
    }
    this.sessions.set(record.id, record)
    this.prune()
    this.persist()
    this.notify(record.id)
    return record
  }

  setPendingHandoff(sessionId: string, handoff: string | undefined): void {
    const record = this.sessions.get(sessionId)
    if (!record) return
    if (handoff === undefined) delete record.pendingHandoff
    else record.pendingHandoff = handoff
    record.updatedAt = new Date().toISOString()
    this.persist()
  }

  archiveSession(sessionId: string): boolean {
    const record = this.sessions.get(sessionId)
    if (!record) return false
    record.archived = true
    record.updatedAt = new Date().toISOString()
    this.persist()
    this.notify(record.id)
    return true
  }

  /** Archive every session owned by a removed worktree path. */
  archiveSessionsByCwd(cwd: string): string[] {
    const ids: string[] = []
    for (const record of this.sessions.values()) {
      if (record.cwd === cwd && !record.archived) {
        record.archived = true
        record.updatedAt = new Date().toISOString()
        ids.push(record.id)
      }
    }
    if (ids.length > 0) {
      this.persist()
      this.notify()
    }
    return ids
  }

  getSession(sessionId: string): AgentSessionRecord | null {
    return this.sessions.get(sessionId) ?? null
  }

  listSessions(filter?: SessionFilter): AgentSessionSummary[] {
    return Array.from(this.sessions.values())
      .filter((record) => {
        if (!filter?.includeArchived && record.archived) return false
        if (filter?.workspaceId && record.workspaceId !== filter.workspaceId) return false
        if (filter?.cwd && !matchesCwdScope(record.cwd, filter.cwd)) return false
        if (filter?.engine && record.engine !== filter.engine) return false
        return true
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((record) => toSummary(record))
  }

  private recordForTerminal(terminalId: string): AgentSessionRecord | null {
    const sessionId = this.terminalToSession.get(terminalId)
    if (!sessionId) return null
    return this.sessions.get(sessionId) ?? null
  }

  private prune(): void {
    if (this.sessions.size <= MAX_SESSIONS) return
    const ordered = Array.from(this.sessions.values()).sort((a, b) =>
      a.updatedAt.localeCompare(b.updatedAt),
    )
    for (const record of ordered.slice(0, this.sessions.size - MAX_SESSIONS)) {
      this.sessions.delete(record.id)
    }
  }
}

function toSummary(record: AgentSessionRecord): AgentSessionSummary {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    engine: record.engine,
    cwd: record.cwd,
    branch: record.branch,
    firstPrompt: record.firstPrompt,
    turnCount: record.turnCount,
    checkpointCount: record.checkpointIds.length,
    status: toStatus(record),
    providerSessionId: record.providerSessionId,
    transcriptPath: record.transcriptPath,
    continuedFrom: record.continuedFrom,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    archived: record.archived,
    ...(record.external === true ? { external: true } : {}),
  }
}

function normalizeCwd(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase()
}

/**
 * Exact match still wins; external sessions may live under a child path of a
 * workspace scope, so fall back to prefix (boundary '/') or substring after
 * normalizing separators, trailing slashes, and case.
 */
function matchesCwdScope(recordCwd: string, scopeCwd: string): boolean {
  if (recordCwd === scopeCwd) return true
  const record = normalizeCwd(recordCwd)
  const scope = normalizeCwd(scopeCwd)
  if (!record || !scope) return false
  if (record === scope) return true
  if (record.startsWith(`${scope}/`)) return true
  return record.includes(scope)
}

function toStatus(record: AgentSessionRecord): AgentSessionStatus {
  return record.status
}

function toImportTimestamp(value?: string): string | undefined {
  if (!value) return undefined
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return undefined
  return new Date(parsed).toISOString()
}

export const agentSessionRegistry = new AgentSessionRegistry()
