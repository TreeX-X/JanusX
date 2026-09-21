// Note: stable session identity over volatile terminal ids for workspace
// session cards, scoped checkpoints, and Continue handoff — see
// .agents/notes/implemented/feature/2026-09-21-workspace-sessions-v1.md
import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
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
} from '../../shared/ipc/session'

export interface AgentSessionRecord extends AgentSessionDetail {
  shell?: string
  preset?: string
  command?: string
  args?: string[]
  lastPrompt: string
  checkpointIds: string[]
}

interface SessionStoreDocument {
  version: 1
  sessions: AgentSessionRecord[]
}

const STORE_FILE = 'agent-sessions.json'
const MAX_SESSIONS = 200
const MAX_TURNS_PER_SESSION = 50

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class AgentSessionRegistry {
  private readonly sessions = new Map<string, AgentSessionRecord>()
  private readonly terminalToSession = new Map<string, string>()
  private readonly pendingTurnStart = new Map<string, string>()
  private readonly writeQueue = new SerialQueue()
  private changeListener?: (sessionId?: string) => void
  private loaded = false

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
  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = await readFile(this.storePath(), 'utf-8')
      const document = JSON.parse(raw) as Partial<SessionStoreDocument>
      if (!isRecord(document) || !Array.isArray(document.sessions)) return
      for (const entry of document.sessions) {
        if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.cwd !== 'string') continue
        const record = entry as unknown as AgentSessionRecord
        this.sessions.set(record.id, {
          ...record,
          terminalIds: Array.isArray(record.terminalIds) ? record.terminalIds : [],
          turns: Array.isArray(record.turns) ? record.turns.slice(-MAX_TURNS_PER_SESSION) : [],
          checkpointIds: Array.isArray(record.checkpointIds) ? record.checkpointIds : [],
          archived: record.archived === true,
        })
      }
    } catch {
      // Fresh start: no store yet or unreadable store.
    }
  }

  private persist(): void {
    const document: SessionStoreDocument = {
      version: 1,
      sessions: Array.from(this.sessions.values()),
    }
    void this.writeQueue
      .run(() => writeFileAtomic(this.storePath(), `${JSON.stringify(document, null, 2)}\n`))
      .catch((err) => console.error('[sessions] persist failed:', err))
  }

  /** Drain pending persists (tests and shutdown paths). */
  flush(): Promise<void> {
    return this.writeQueue.run(() => Promise.resolve())
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
    record.updatedAt = new Date().toISOString()
    this.persist()
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
  }

  noteProviderSession(terminalId: string, providerSessionId?: string, transcriptPath?: string): void {
    const record = this.recordForTerminal(terminalId)
    if (!record) return
    if (providerSessionId) record.providerSessionId = providerSessionId
    if (transcriptPath) record.transcriptPath = transcriptPath
    record.updatedAt = new Date().toISOString()
    this.persist()
  }

  recordTurnEnd(terminalId: string, kind: AgentSessionTurnKind, checkpointId?: string): void {
    const record = this.recordForTerminal(terminalId)
    if (!record) return
    const now = new Date().toISOString()
    const turn: SessionTurnRecord = {
      id: randomUUID(),
      kind,
      checkpointId: checkpointId ?? record.checkpointIds.at(-1),
      startedAt: this.pendingTurnStart.get(record.id) ?? now,
      endedAt: now,
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
  }

  detachTerminal(terminalId: string): void {
    this.terminalToSession.delete(terminalId)
    this.persist()
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

  getSession(sessionId: string): AgentSessionRecord | null {
    return this.sessions.get(sessionId) ?? null
  }

  listSessions(filter?: SessionFilter): AgentSessionSummary[] {
    return Array.from(this.sessions.values())
      .filter((record) => {
        if (!filter?.includeArchived && record.archived) return false
        if (filter?.workspaceId && record.workspaceId !== filter.workspaceId) return false
        if (filter?.cwd && record.cwd !== filter.cwd) return false
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
  }
}

function toStatus(record: AgentSessionRecord): AgentSessionStatus {
  return record.status
}

export const agentSessionRegistry = new AgentSessionRegistry()
