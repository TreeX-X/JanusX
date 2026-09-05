/**
 * @file Knowledge processing queue (Phase 1-1, deterministic stage wired since Phase 1-2).
 * @description Owns the observation → candidate pipeline bookkeeping from
 *              §6 of the knowledge restructuring plan: per-workspace cursors,
 *              a failure ledger, debounced scheduling, startup restore, and
 *              manual/IPC triggers.
 *
 *              The queue advances the deterministic cursor only when the
 *              deterministic-stage handler succeeds, and the llmCursor only
 *              when the LLM-stage handler succeeds or skips cleanly.
 *              Production wiring lives in `register.ts`
 *              (`configureDeterministicHandler(runDeterministicStage)` +
 *              `configureLlmHandler(runLlmStage)`); without
 *              a handler `processNow` reports pending work with
 *              `handlerMissing: true` and never moves the cursor.
 *
 *              Locking: all mutating paths run inside a single SerialQueue;
 *              internal `*Locked` helpers must only be called with the lock held.
 */

import { mkdir, readFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { Observation } from '../../shared/knowledge'
import { knowledgeRootPath } from './constants'
import { SerialQueue, writeFileAtomic } from '../lib/atomic-file'
import { knowledgeObservationService } from './observation-service'
import { knowledgeAuditService, type AuditEventInput } from './audit-service'

const CURSOR_FILE = join('processing', 'cursor.json')
const FAILURES_FILE = join('processing', 'failures.jsonl')
const MAINTENANCE_FILE = join('processing', 'maintenance.json')

const DEFAULT_THRESHOLD = 20
const DEFAULT_DEBOUNCE_MS = 5 * 60 * 1000
const MAX_BACKOFF_MS = 60 * 60 * 1000
/** Phase 5 (§6): retention maintenance cadence — autoPrune/archive/compact at most once per day. */
export const MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000

export type ProcessingStage = 'deterministic' | 'llm'

export interface WorkspaceCursor {
  workspaceId: string
  lastObservationCreatedAt: string | null
  lastObservationId: string | null
  llmCursor?: string | null
  updatedAt: string
}

export interface ProcessingFailure {
  observationId: string
  workspaceId: string
  stage: ProcessingStage
  reason: string
  attempts: number
  nextRetryAt: string
  firstFailedAt: string
  lastFailedAt: string
}

export interface WorkspacePending {
  workspaceId: string
  pending: number
  lastObservationAt?: string
}

export interface QueueRunSummary {
  at: string
  processed: number
  failed: number
}

export interface ProcessNowResult {
  processed: number
  failed: number
  pending: number
  advancedWorkspaces: string[]
  handlerMissing: boolean
}

/** Phase 5 (§6): Inbox 压力 = `status === 'proposed'` 的候选按 derivation 计数。 */
export interface ProposalsByDerivation {
  deterministic: number
  llm: number
  merged: number
}

export const EMPTY_PROPOSALS_BY_DERIVATION: ProposalsByDerivation = {
  deterministic: 0,
  llm: 0,
  merged: 0,
}

/**
 * Phase 5 (§6): best-effort 计数，永不抛错。缺 derivation / 非 proposed
 * 一律忽略（缺字段的 schema 错误由读写两侧的 `schema_violation` audit 负责）。
 */
export function countProposalsByDerivation(
  ...lists: Array<Array<{ status?: string; derivation?: string }>>
): ProposalsByDerivation {
  const counts: ProposalsByDerivation = { ...EMPTY_PROPOSALS_BY_DERIVATION }
  for (const list of lists) {
    for (const candidate of list) {
      if (candidate.status !== 'proposed') continue
      if (candidate.derivation === 'deterministic') counts.deterministic += 1
      else if (candidate.derivation === 'llm') counts.llm += 1
      else if (candidate.derivation === 'merged') counts.merged += 1
    }
  }
  return counts
}

export interface ProcessingStats {
  generatedAt: string
  pendingTotal: number
  workspaces: WorkspacePending[]
  failures: number
  lastRunAt: string | null
  lastRun: QueueRunSummary | null
  handlerConfigured: boolean
  /** Phase 2: LLM stage wiring + process-lifetime outcome counters. */
  llmConfigured: boolean
  llmSucceeded: number
  llmFailed: number
  llmSkipped: number
  /** Phase 5 (§6): proposed 候选按 derivation 计数 + 总数。 */
  proposalsByDerivation: ProposalsByDerivation
  proposalsTotal: number
  /** Phase 5 (§6): recall 索引最近一次重建时间；从未构建为 null。 */
  indexUpdatedAt: string | null
  /** Phase 5 (§6): retention 维护最近一次成功时间；从未成功为 null。 */
  lastMaintenanceAt: string | null
}

export interface DeterministicBatch {
  workspaceId: string
  observations: Observation[]
}

export type DeterministicBatchHandler = (batch: DeterministicBatch) => Promise<void>

/** Phase 2: the LLM stage consumes the same workspace batch after the deterministic stage. */
export interface LlmStageBatch {
  workspaceId: string
  observations: Observation[]
}

export interface LlmStageStatus {
  skipped: boolean
  skippedReason?: 'deterministic-only' | 'no-default-llm'
  processed: number
  proposed: number
  merged: number
}

export type LlmBatchHandler = (batch: LlmStageBatch) => Promise<LlmStageStatus>

/** Phase 5 (§6): daily retention maintenance (autoPrune/archive/compact). Wired in register.ts. */
export type MaintenanceHandler = () => Promise<void>

export interface MaintenanceRunResult {
  at: string
  ran: boolean
  skippedReason?: 'handler-missing' | 'not-due'
}

interface MaintenanceFileShape {
  version: 1
  lastMaintenanceAt: string | null
}

export interface ProcessingQueueDeps {
  listAllObservations: () => Promise<Observation[]>
  recordAudit: (input: AuditEventInput) => Promise<unknown>
  nowMs: () => number
}

function defaultDeps(): ProcessingQueueDeps {
  return {
    listAllObservations: () => knowledgeObservationService.listAll(),
    recordAudit: (input) => knowledgeAuditService.record(input),
    nowMs: () => Date.now(),
  }
}

function isEvidence(observation: Observation): boolean {
  return (observation.retentionClass ?? 'evidence') === 'evidence'
}

function compareObservations(left: Observation, right: Observation): number {
  const byTime = left.createdAt.localeCompare(right.createdAt)
  if (byTime !== 0) return byTime
  return left.id.localeCompare(right.id)
}

/** Failure retry backoff: 1m, 2m, 4m, … capped at 1h. */
export function failureBackoffMs(attempts: number): number {
  return Math.min(2 ** Math.max(0, Math.min(attempts, 10)) * 60_000, MAX_BACKOFF_MS)
}

interface CursorFileShape {
  version: 1
  workspaces: Record<string, Omit<WorkspaceCursor, 'workspaceId'> | undefined>
}

export class KnowledgeProcessingQueue {
  private readonly queue = new SerialQueue()
  private handler: DeterministicBatchHandler | null = null
  private llmHandler: LlmBatchHandler | null = null
  private maintenanceHandler: MaintenanceHandler | null = null
  private threshold: number
  private debounceMs: number
  private readonly pendingCounts = new Map<string, number>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private maintenanceTimer: ReturnType<typeof setInterval> | null = null
  private lastRun: QueueRunSummary | null = null
  private llmSucceeded = 0
  private llmFailed = 0
  private llmSkipped = 0

  constructor(private readonly deps: ProcessingQueueDeps = defaultDeps()) {
    this.threshold = DEFAULT_THRESHOLD
    this.debounceMs = DEFAULT_DEBOUNCE_MS
  }

  /** Test / composition hook: tune the §6 capture trigger without waiting minutes. */
  configure(options: { threshold?: number; debounceMs?: number }): void {
    if (options.threshold !== undefined) this.threshold = Math.max(1, Math.trunc(options.threshold))
    if (options.debounceMs !== undefined) this.debounceMs = Math.max(0, options.debounceMs)
  }

  /** Phase 1-2 plugs the deterministic extractor here; null detaches it. */
  configureDeterministicHandler(handler: DeterministicBatchHandler | null): void {
    this.handler = handler
  }

  isHandlerConfigured(): boolean {
    return this.handler !== null
  }

  /** Phase 2 plugs the LLM enhancement stage here; null detaches it. */
  configureLlmHandler(handler: LlmBatchHandler | null): void {
    this.llmHandler = handler
  }

  isLlmConfigured(): boolean {
    return this.llmHandler !== null
  }

  /** Phase 5 plugs the daily retention maintenance here; null detaches it. */
  configureMaintenanceHandler(handler: MaintenanceHandler | null): void {
    this.maintenanceHandler = handler
  }

  isMaintenanceConfigured(): boolean {
    return this.maintenanceHandler !== null
  }

  /** Clears pending debounce + maintenance timers (test hygiene; timers are unref'd). */
  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    this.pendingCounts.clear()
    this.stopMaintenanceLoop()
  }

  /**
   * §6 trigger entry for capture points: same workspace accumulates
   * `threshold` observations → run now, otherwise debounce `debounceMs`.
   * Fire-and-forget; run errors are logged, failures are persisted by the run.
   */
  schedule(workspaceId: string): void {
    const id = workspaceId.trim()
    if (!id) return
    const count = (this.pendingCounts.get(id) ?? 0) + 1
    this.pendingCounts.set(id, count)
    if (count >= this.threshold) {
      this.pendingCounts.set(id, 0)
      this.clearTimer(id)
      void this.queue.run(() => this.runWorkspaceLocked(id)).catch((error: unknown) => {
        console.error(`[knowledge] processing run failed for ${id}: ${error instanceof Error ? error.message : String(error)}`)
      })
      return
    }
    this.clearTimer(id)
    const timer = setTimeout(() => {
      this.timers.delete(id)
      this.pendingCounts.set(id, 0)
      void this.queue.run(() => this.runWorkspaceLocked(id)).catch((error: unknown) => {
        console.error(`[knowledge] processing run failed for ${id}: ${error instanceof Error ? error.message : String(error)}`)
      })
    }, this.debounceMs)
    if (typeof timer.unref === 'function') timer.unref()
    this.timers.set(id, timer)
  }

  /**
   * Phase 5 (§6 gap close): turn-completion / chat session-end entry.
   * Bypasses the capture debounce and threshold: the turn is over, so the
   * workspace runs as soon as the SerialQueue drains. Fire-and-forget.
   */
  scheduleImmediate(workspaceId: string): void {
    const id = workspaceId.trim()
    if (!id) return
    this.pendingCounts.set(id, 0)
    this.clearTimer(id)
    void this.queue.run(() => this.runWorkspaceLocked(id)).catch((error: unknown) => {
      console.error(`[knowledge] immediate processing run failed for ${id}: ${error instanceof Error ? error.message : String(error)}`)
    })
  }

  /** Manual trigger (§6 `knowledge:processNow`): run now, bypassing debounce. */
  async processNow(workspaceId?: string): Promise<ProcessNowResult> {
    return this.queue.run(() => this.processLocked(workspaceId?.trim() || undefined))
  }

  /**
   * Phase 5 (§6): run retention maintenance now (autoPrune/archive/compact
   * via the wired handler). Updates the maintenance stamp only on success;
   * failures audit `processing_failed` and leave the stamp so the next
   * due-check retries.
   */
  async runMaintenanceNow(): Promise<MaintenanceRunResult> {
    const at = new Date(this.deps.nowMs()).toISOString()
    if (!this.maintenanceHandler) {
      return { at, ran: false, skippedReason: 'handler-missing' }
    }
    try {
      await this.maintenanceHandler()
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      try {
        await this.deps.recordAudit({
          action: 'processing_failed',
          targetType: 'observation',
          targetId: 'maintenance',
          before: null,
          after: { stage: 'maintenance', reason },
          provenance: {
            workspaceId: 'maintenance',
            workspaceName: 'maintenance',
            workspacePath: '',
            source: 'system',
            sourceObservationIds: [],
            fileRefs: [],
            actor: 'knowledge-queue',
            createdAt: at,
          },
        })
      } catch (auditError) {
        console.error(`[knowledge] maintenance audit failed: ${auditError instanceof Error ? auditError.message : String(auditError)}`)
      }
      throw error
    }
    await this.writeMaintenance({ version: 1, lastMaintenanceAt: at })
    return { at, ran: true }
  }

  /** Phase 5 (§6): run maintenance only when the daily interval elapsed. */
  async maybeRunMaintenanceIfDue(intervalMs: number = MAINTENANCE_INTERVAL_MS): Promise<MaintenanceRunResult> {
    const at = new Date(this.deps.nowMs()).toISOString()
    if (!this.maintenanceHandler) {
      return { at, ran: false, skippedReason: 'handler-missing' }
    }
    const last = await this.readMaintenance()
    if (last?.lastMaintenanceAt) {
      const elapsed = this.deps.nowMs() - Date.parse(last.lastMaintenanceAt)
      if (Number.isFinite(elapsed) && elapsed < intervalMs) {
        return { at, ran: false, skippedReason: 'not-due' }
      }
    }
    return this.runMaintenanceNow()
  }

  /** Phase 5 (§6): daily low-peak maintenance loop (unref'd; dispose stops it). */
  startMaintenanceLoop(intervalMs: number = MAINTENANCE_INTERVAL_MS): void {
    this.stopMaintenanceLoop()
    const timer = setInterval(() => {
      void this.maybeRunMaintenanceIfDue(intervalMs).catch((error: unknown) => {
        console.error(`[knowledge] maintenance run failed: ${error instanceof Error ? error.message : String(error)}`)
      })
    }, intervalMs)
    if (typeof timer.unref === 'function') timer.unref()
    this.maintenanceTimer = timer
  }

  stopMaintenanceLoop(): void {
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer)
      this.maintenanceTimer = null
    }
  }

  /** Startup recovery (§6): report unprocessed ranges without processing. */
  async startupRestore(): Promise<{ pendingTotal: number; workspaces: WorkspacePending[] }> {
    const stats = await this.buildStats()
    return { pendingTotal: stats.pendingTotal, workspaces: stats.workspaces }
  }

  /** §6 metrics snapshot for the Workbench status bar. */
  async processingStats(): Promise<ProcessingStats> {
    return this.buildStats()
  }

  async listFailures(): Promise<ProcessingFailure[]> {
    return this.readFailures()
  }

  private clearTimer(workspaceId: string): void {
    const timer = this.timers.get(workspaceId)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(workspaceId)
    }
  }

  private async runWorkspaceLocked(workspaceId: string): Promise<void> {
    const result = await this.processLocked(workspaceId)
    if (result.handlerMissing) {
      console.warn(`[knowledge] processing skipped for ${workspaceId}: no deterministic handler configured (Phase 1-2)`)
    }
  }

  private async processLocked(workspaceId?: string): Promise<ProcessNowResult> {
    const all = (await this.deps.listAllObservations()).filter(isEvidence)
    const cursors = await this.readCursors()
    const byWorkspace = new Map<string, Observation[]>()
    for (const observation of all) {
      if (workspaceId && observation.workspaceId !== workspaceId) continue
      const list = byWorkspace.get(observation.workspaceId) ?? []
      list.push(observation)
      byWorkspace.set(observation.workspaceId, list)
    }

    let pending = 0
    const batches: DeterministicBatch[] = []
    for (const [id, observations] of [...byWorkspace.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const cursor = cursors.get(id)
      const unprocessed = observations
        .filter((observation) => isAfterCursor(observation, cursor))
        .sort(compareObservations)
      pending += unprocessed.length
      if (unprocessed.length > 0) batches.push({ workspaceId: id, observations: unprocessed })
    }

    if (!this.handler) {
      return { processed: 0, failed: 0, pending, advancedWorkspaces: [], handlerMissing: true }
    }

    const advancedWorkspaces: string[] = []
    let processed = 0
    let failed = 0
    for (const batch of batches) {
      try {
        await this.handler(batch)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        await this.recordBatchFailures(batch, 'deterministic', reason)
        failed += batch.observations.length
        continue
      }
      const last = batch.observations[batch.observations.length - 1]!
      const cursor: WorkspaceCursor = {
        workspaceId: batch.workspaceId,
        lastObservationCreatedAt: last.createdAt,
        lastObservationId: last.id,
        llmCursor: cursors.get(batch.workspaceId)?.llmCursor ?? null,
        updatedAt: new Date(this.deps.nowMs()).toISOString(),
      }
      // Phase 2: the LLM stage runs only after the deterministic stage
      // completed for this batch. Its failure is recorded in the `llm`
      // failure ledger but never rolls back deterministic products.
      if (this.llmHandler) {
        try {
          const status = await this.llmHandler({
            workspaceId: batch.workspaceId,
            observations: batch.observations,
          })
          cursor.llmCursor = last.id
          if (status.skipped) this.llmSkipped += 1
          else this.llmSucceeded += 1
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          await this.recordBatchFailures(batch, 'llm', reason)
          this.llmFailed += 1
        }
      }
      cursors.set(batch.workspaceId, cursor)
      advancedWorkspaces.push(batch.workspaceId)
      processed += batch.observations.length
    }
    if (advancedWorkspaces.length > 0) await this.writeCursors(cursors)

    const at = new Date(this.deps.nowMs()).toISOString()
    this.lastRun = { at, processed, failed }
    return { processed, failed, pending, advancedWorkspaces, handlerMissing: false }
  }

  private async recordBatchFailures(
    batch: DeterministicBatch,
    stage: ProcessingStage,
    reason: string,
  ): Promise<void> {
    const nowIso = new Date(this.deps.nowMs()).toISOString()
    const previous = await this.readFailures()
    const byKey = new Map(previous.map((failure) => [`${failure.stage}:${failure.observationId}`, failure]))
    for (const observation of batch.observations) {
      const key = `${stage}:${observation.id}`
      const existing = byKey.get(key)
      const attempts = (existing?.attempts ?? 0) + 1
      const record: ProcessingFailure = {
        observationId: observation.id,
        workspaceId: batch.workspaceId,
        stage,
        reason,
        attempts,
        nextRetryAt: new Date(this.deps.nowMs() + failureBackoffMs(attempts)).toISOString(),
        firstFailedAt: existing?.firstFailedAt ?? nowIso,
        lastFailedAt: nowIso,
      }
      byKey.set(key, record)
    }
    await this.writeFailures([...byKey.values()])
    try {
      await this.deps.recordAudit({
        action: 'processing_failed',
        targetType: 'observation',
        targetId: batch.workspaceId,
        before: null,
        after: {
          stage,
          reason,
          failedObservationIds: batch.observations.map((observation) => observation.id),
        },
        provenance: {
          workspaceId: batch.workspaceId,
          workspaceName: batch.workspaceId,
          workspacePath: '',
          source: 'system',
          sourceObservationIds: batch.observations.map((observation) => observation.id),
          fileRefs: [],
          actor: 'knowledge-queue',
          createdAt: nowIso,
        },
      })
    } catch (error) {
      console.error(`[knowledge] processing_failed audit failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Phase 5 (§6): proposed 候选按 derivation 计数。best-effort：读盘失败
   * 即回零值，绝不让指标快照失败。动态 import 避免在队列模块图里静态
   * 拉入 extract/recall 重依赖（observation-service 侧已有静态边）。
   */
  private async readProposalsByDerivation(): Promise<ProposalsByDerivation> {
    try {
      const { knowledgeExtractService } = await import('./extract-service')
      const [facts, wikiPatches, graphEdges] = await Promise.all([
        knowledgeExtractService.listFactCandidates(),
        knowledgeExtractService.listWikiPatchCandidates(),
        knowledgeExtractService.listGraphCandidates(),
      ])
      return countProposalsByDerivation(facts, wikiPatches, graphEdges)
    } catch (error) {
      console.error(`[knowledge] proposals-by-derivation snapshot failed: ${error instanceof Error ? error.message : String(error)}`)
      return { ...EMPTY_PROPOSALS_BY_DERIVATION }
    }
  }

  /** Phase 5 (§6): recall 索引新鲜度，best-effort，失败即 null。 */
  private async readIndexUpdatedAt(): Promise<string | null> {
    try {
      const { knowledgeRecallService } = await import('./recall-service')
      return knowledgeRecallService.getLastIndexBuildAt()
    } catch (error) {
      console.error(`[knowledge] index-updated-at snapshot failed: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  private async buildStats(): Promise<ProcessingStats> {
    const all = (await this.deps.listAllObservations()).filter(isEvidence)
    const cursors = await this.readCursors()
    const byWorkspace = new Map<string, { pending: number; lastObservationAt?: string }>()
    for (const observation of all) {
      let entry = byWorkspace.get(observation.workspaceId)
      if (!entry) {
        entry = { pending: 0 }
        byWorkspace.set(observation.workspaceId, entry)
      }
      if (!entry.lastObservationAt || observation.createdAt > entry.lastObservationAt) {
        entry.lastObservationAt = observation.createdAt
      }
      if (isAfterCursor(observation, cursors.get(observation.workspaceId))) entry.pending += 1
    }
    const workspaces: WorkspacePending[] = [...byWorkspace.entries()]
      .map(([workspaceId, entry]) => ({ workspaceId, ...entry }))
      .sort((left, right) => (right.lastObservationAt ?? '').localeCompare(left.lastObservationAt ?? ''))
    const [proposalsByDerivation, indexUpdatedAt, maintenance] = await Promise.all([
      this.readProposalsByDerivation(),
      this.readIndexUpdatedAt(),
      this.readMaintenance(),
    ])
    return {
      generatedAt: new Date(this.deps.nowMs()).toISOString(),
      pendingTotal: workspaces.reduce((total, entry) => total + entry.pending, 0),
      workspaces,
      failures: (await this.readFailures()).length,
      lastRunAt: this.lastRun?.at ?? null,
      lastRun: this.lastRun,
      handlerConfigured: this.handler !== null,
      llmConfigured: this.llmHandler !== null,
      llmSucceeded: this.llmSucceeded,
      llmFailed: this.llmFailed,
      llmSkipped: this.llmSkipped,
      proposalsByDerivation,
      proposalsTotal:
        proposalsByDerivation.deterministic + proposalsByDerivation.llm + proposalsByDerivation.merged,
      indexUpdatedAt,
      lastMaintenanceAt: maintenance?.lastMaintenanceAt ?? null,
    }
  }

  private cursorPath(): string {
    return join(knowledgeRootPath(), CURSOR_FILE)
  }

  private failuresPath(): string {
    return join(knowledgeRootPath(), FAILURES_FILE)
  }

  private maintenancePath(): string {
    return join(knowledgeRootPath(), MAINTENANCE_FILE)
  }

  private async readMaintenance(): Promise<MaintenanceFileShape | null> {
    try {
      const raw = JSON.parse(await readFile(this.maintenancePath(), 'utf8')) as MaintenanceFileShape
      if (!raw || raw.version !== 1) return null
      if (raw.lastMaintenanceAt !== null && typeof raw.lastMaintenanceAt !== 'string') return null
      return raw
    } catch {
      return null
    }
  }

  private async writeMaintenance(shape: MaintenanceFileShape): Promise<void> {
    await writeFileAtomic(this.maintenancePath(), `${JSON.stringify(shape, null, 2)}\n`)
  }

  private async readCursors(): Promise<Map<string, WorkspaceCursor>> {
    try {
      const raw = JSON.parse(await readFile(this.cursorPath(), 'utf8')) as CursorFileShape
      const result = new Map<string, WorkspaceCursor>()
      if (!raw || typeof raw.workspaces !== 'object' || !raw.workspaces) return result
      for (const [workspaceId, cursor] of Object.entries(raw.workspaces)) {
        if (!cursor || typeof cursor.lastObservationCreatedAt !== 'string' && cursor.lastObservationCreatedAt !== null) continue
        result.set(workspaceId, {
          workspaceId,
          lastObservationCreatedAt: cursor.lastObservationCreatedAt ?? null,
          lastObservationId: cursor.lastObservationId ?? null,
          llmCursor: cursor.llmCursor ?? null,
          updatedAt: typeof cursor.updatedAt === 'string' ? cursor.updatedAt : new Date(this.deps.nowMs()).toISOString(),
        })
      }
      return result
    } catch {
      return new Map()
    }
  }

  private async writeCursors(cursors: Map<string, WorkspaceCursor>): Promise<void> {
    const workspaces: CursorFileShape['workspaces'] = {}
    for (const [workspaceId, cursor] of cursors) {
      workspaces[workspaceId] = {
        lastObservationCreatedAt: cursor.lastObservationCreatedAt,
        lastObservationId: cursor.lastObservationId,
        llmCursor: cursor.llmCursor ?? null,
        updatedAt: cursor.updatedAt,
      }
    }
    await writeFileAtomic(this.cursorPath(), `${JSON.stringify({ version: 1, workspaces }, null, 2)}\n`)
  }

  private async readFailures(): Promise<ProcessingFailure[]> {
    let content: string
    try {
      content = await readFile(this.failuresPath(), 'utf8')
    } catch {
      return []
    }
    const results: ProcessingFailure[] = []
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const parsed = JSON.parse(trimmed) as ProcessingFailure
        if (typeof parsed.observationId === 'string' && typeof parsed.stage === 'string') results.push(parsed)
      } catch {
        // Skip malformed lines.
      }
    }
    return results
  }

  private async writeFailures(failures: ProcessingFailure[]): Promise<void> {
    const file = this.failuresPath()
    await mkdir(dirname(file), { recursive: true })
    const body = failures.map((failure) => JSON.stringify(failure)).join('\n')
    await writeFileAtomic(file, body.length > 0 ? `${body}\n` : '')
  }
}

function isAfterCursor(observation: Observation, cursor?: WorkspaceCursor): boolean {
  if (!cursor?.lastObservationCreatedAt) return true
  if (observation.createdAt > cursor.lastObservationCreatedAt) return true
  if (observation.createdAt < cursor.lastObservationCreatedAt) return false
  return (cursor.lastObservationId ?? '') < observation.id
}

export const knowledgeProcessingQueue = new KnowledgeProcessingQueue()
