import { readPersonalForgettingBarrier } from './personal-forgetting-barrier'
// Note: durable refinement survives observation cursors and rechecks snapshots — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { CandidateFact, MemoryFact, Observation } from '../../shared/knowledge'
import type { MemoryScorerIdentity, RefinementTaskStats } from '../../shared/memory-decision'
import type { KnowledgeSettings } from '../../shared/knowledge-settings'
import { SerialQueue, writeFileAtomic } from '../lib/atomic-file'
import { knowledgeRootPath } from './constants'
import { knowledgeExtractService } from './extract-service'
import { knowledgeObservationService } from './observation-service'
import { knowledgeTruthService } from './truth-service'
import { knowledgeDecisionStage, REFINEMENT_CHAR_BUDGET, REFINEMENT_OBSERVATION_CHARS, type RefinementPlan } from './decision-stage'
import { candidateDecisionHash } from './decision-scorer'
import { factScope, isActiveObservation, isUserStatement, observationScope } from './memory-evidence'
import { refinementContextHash, refinementEvidenceHash, refinementHash } from './refinement-snapshot'
import { configService } from '../config/service'
import { llmService } from '../llm/LlmService'

const SHA = z.string().regex(/^[a-f0-9]{64}$/)
const scorerSchema = z.object({ provider: z.string(), modelRevision: z.string(), templateVersion: z.string(), calibrationId: z.string().nullable() })
const taskSchema = z.object({
  id: SHA, candidateId: z.string().min(1), candidateHash: SHA, decisionHash: SHA, contextHash: SHA,
  scope: z.enum(['project', 'user', 'global']), workspaceId: z.string().min(1), scorer: scorerSchema,
  evidenceHashes: z.record(SHA).refine((value) => Object.keys(value).length > 0 && Object.keys(value).length <= 8),
  status: z.enum(['pending', 'running', 'succeeded', 'cancelled', 'failed']),
  attempts: z.number().int().min(0).max(3), nextRetryAt: z.number().finite().nonnegative(),
  createdAt: z.string(), updatedAt: z.string(), reason: z.string().optional(),
})
export type RefinementTask = z.infer<typeof taskSchema>
export interface RefinementRunResult { processed: number; failed: number; cancelled: number; deferred: number }
const ledgerSchema = z.object({ version: z.literal(1), tasks: z.array(taskSchema) }).strict()
const taskLock = new SerialQueue()
const MAX_ATTEMPTS = 3

export interface RefinementTaskDeps {
  listCandidates(): Promise<CandidateFact[]>
  listObservations(): Promise<Observation[]>
  listTruth(): Promise<MemoryFact[]>
  resolveContent(observation: Observation): Promise<string>
  settings(): Promise<KnowledgeSettings>
  hasModel(): Promise<boolean>
  scorerIdentity(): MemoryScorerIdentity
  extract(observations: Observation[], candidateHashes: Record<string, string>): Promise<void>
  nowMs(): number
}

function defaultDeps(): RefinementTaskDeps {
  return {
    listCandidates: () => knowledgeExtractService.listFactCandidates(),
    listObservations: () => knowledgeObservationService.listAll(),
    listTruth: async () => (await knowledgeTruthService.list()).facts,
    resolveContent: (observation) => knowledgeObservationService.resolveContent(observation),
    settings: () => configService.getKnowledgeSettings(),
    hasModel: async () => !!(await llmService.getDefaultModel()),
    scorerIdentity: () => knowledgeDecisionStage.scorerIdentity(),
    extract: async (observations, refinementCandidates) => {
      const result = await knowledgeExtractService.extract({ observations }, { refinementCandidates, maxRetries: 0 })
      if (result.degraded && result.degraded.reason !== 'no-evidence') throw new Error('refinement-unavailable')
    },
    nowMs: () => Date.now(),
  }
}

function taskId(task: Pick<RefinementTask, 'scope' | 'workspaceId' | 'candidateId' | 'candidateHash' | 'decisionHash' | 'contextHash'>): string {
  return refinementHash([1, task.scope, task.workspaceId, task.candidateId, task.candidateHash, task.decisionHash, task.contextHash])
}

export class RefinementTaskService {
  constructor(private readonly deps: RefinementTaskDeps = defaultDeps()) {}

  private async read(): Promise<RefinementTask[]> {
    let text: string
    try { text = await readFile(join(knowledgeRootPath(), 'processing/refinement-tasks.json'), 'utf8') } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const { tasks } = ledgerSchema.parse(JSON.parse(text))
    if (new Set(tasks.map((task) => task.id)).size !== tasks.length || tasks.some((task) => task.id !== taskId(task))) {
      throw new Error('Invalid refinement task identities')
    }
    return this.applyForgetting(tasks)
  }

  private async applyForgetting(tasks: RefinementTask[]): Promise<RefinementTask[]> {
    const barrier = await readPersonalForgettingBarrier()
    return tasks.map(task => barrier.blocksTask(task)
      ? { ...task, status: 'cancelled', reason: 'personal-memory-forgotten' } : task)
  }

  private async write(tasks: RefinementTask[]): Promise<void> {
    await writeFileAtomic(join(knowledgeRootPath(), 'processing/refinement-tasks.json'), JSON.stringify({ version: 1, tasks: await this.applyForgetting(tasks) }))
  }

  /** Atomic snapshots keep diagnostics responsive while a model call is in flight. */
  list(): Promise<RefinementTask[]> { return this.read() }

  async stats(): Promise<RefinementTaskStats> {
    const result: RefinementTaskStats = { pending: 0, running: 0, succeeded: 0, cancelled: 0, failed: 0, nextRetryAt: null }
    for (const task of await this.read()) {
      result[task.status]++
      if (task.status === 'pending') result.nextRetryAt = Math.min(result.nextRetryAt ?? Infinity, task.nextRetryAt)
    }
    return result
  }

  enqueue(plan: RefinementPlan): Promise<number> {
    if (!Object.keys(plan.candidateHashes).length) return Promise.resolve(0)
    return taskLock.run(async () => {
      const tasks = await this.read()
      const ids = new Set(tasks.map((task) => task.id))
      const candidates = await this.deps.listCandidates()
      const plannedEvidence = new Set(plan.observations.map((observation) => observation.id))
      let added = 0
      for (const candidate of candidates) {
        const decision = candidate.decision
        if (candidate.status !== 'proposed' || candidate.derivation !== 'deterministic'
          || plan.candidateHashes[candidate.id] !== candidateDecisionHash(candidate)
          || decision?.candidateHash !== plan.candidateHashes[candidate.id]
          || decision.status !== 'ready' || decision.route !== 'refine' || decision.truncated
          || !decision.contextHash || !decision.evidenceHashes
          || !candidate.evidence.observationIds.length
          || !candidate.evidence.observationIds.every((id) => plannedEvidence.has(id) && decision.evidenceHashes![id])) continue
        const now = new Date(this.deps.nowMs()).toISOString()
        const task: RefinementTask = {
          id: '', candidateId: candidate.id, candidateHash: decision.candidateHash, decisionHash: decision.inputHash,
          contextHash: decision.contextHash, evidenceHashes: decision.evidenceHashes, scorer: decision.scorer,
          scope: factScope(candidate.fact), workspaceId: candidate.fact.provenance.workspaceId,
          status: 'pending', attempts: 0, nextRetryAt: 0, createdAt: now, updatedAt: now,
        }
        task.id = taskId(task)
        taskSchema.parse(task)
        if (ids.has(task.id)) continue
        ids.add(task.id)
        tasks.push(task)
        added++
      }
      if (added) await this.write(tasks)
      return added
    })
  }

  runDue(workspaceId?: string): Promise<RefinementRunResult> {
    return taskLock.run(async () => {
      const tasks = await this.read()
      const result: RefinementRunResult = { processed: 0, failed: 0, cancelled: 0, deferred: 0 }
      let budget = REFINEMENT_CHAR_BUDGET
      let calls = 0
      for (const task of tasks) {
        if ((workspaceId && task.workspaceId !== workspaceId) || !['pending', 'running'].includes(task.status)) continue
        const candidate = (await this.deps.listCandidates()).find((item) => item.id === task.candidateId)
        const decision = candidate?.decision
        const obsolete = !candidate || candidate.status !== 'proposed' || candidateDecisionHash(candidate) !== task.candidateHash
          || factScope(candidate.fact) !== task.scope || candidate.fact.provenance.workspaceId !== task.workspaceId
          || decision?.inputHash !== task.decisionHash || decision.status !== 'ready' || decision.route !== 'refine'
          || decision.candidateHash !== task.candidateHash || refinementHash(decision.scorer) !== refinementHash(task.scorer)
          || decision.contextHash !== task.contextHash || refinementHash(decision.evidenceHashes) !== refinementHash(task.evidenceHashes)
        const cancel = async (reason: string) => {
          task.status = 'cancelled'; task.reason = reason; task.updatedAt = new Date(this.deps.nowMs()).toISOString()
          await this.write(tasks); result.cancelled++
        }
        if (obsolete) { await cancel('candidate-changed'); continue }
        const scorer = this.deps.scorerIdentity()
        if (scorer.provider !== 'noop' && refinementHash(scorer) !== refinementHash(task.scorer)) { await cancel('scorer-changed'); continue }
        const byId = new Map((await this.deps.listObservations()).map((observation) => [observation.id, observation]))
        const observations: Observation[] = []
        let invalid = false
        for (const [id, hash] of Object.entries(task.evidenceHashes)) {
          const observation = byId.get(id)
          if (!observation || !isActiveObservation(observation, this.deps.nowMs()) || observation.workspaceId !== task.workspaceId
            || observationScope(observation) !== task.scope || observation.memoryIntent === 'remember'
            || (task.scope === 'user' && !isUserStatement(observation))) { invalid = true; break }
          let content: string
          try { content = await this.deps.resolveContent(observation) } catch { invalid = true; break }
          if (content.length > REFINEMENT_OBSERVATION_CHARS || refinementEvidenceHash(observation, content) !== hash) { invalid = true; break }
          observations.push({ ...observation, content })
        }
        if (invalid || !observations.length || refinementContextHash(await this.deps.listTruth(), task.scope, task.workspaceId, this.deps.nowMs()) !== task.contextHash) {
          await cancel('evidence-or-context-changed'); continue
        }
        if (task.attempts >= MAX_ATTEMPTS) {
          task.status = 'failed'; task.reason = 'attempts-exhausted'; task.updatedAt = new Date(this.deps.nowMs()).toISOString()
          await this.write(tasks); result.failed++; continue
        }
        const settings = await this.deps.settings()
        const cost = observations.reduce((sum, observation) => sum + observation.content.length, 0)
        if (task.nextRetryAt > this.deps.nowMs() || !settings.enabled || settings.mode === 'deterministic-only'
          || scorer.provider === 'noop' || cost > budget || calls >= 20 || !(await this.deps.hasModel().catch(() => false))) {
          result.deferred++; continue
        }
        task.status = 'running'; task.attempts++; task.updatedAt = new Date(this.deps.nowMs()).toISOString()
        delete task.reason
        await this.write(tasks)
        budget -= cost; calls++
        try {
          if ((await readPersonalForgettingBarrier()).blocksTask(task)) { await cancel('personal-memory-forgotten'); continue }
          await this.deps.extract(observations, { [task.candidateId]: task.candidateHash })
          if ((await readPersonalForgettingBarrier()).blocksTask(task)) { await cancel('personal-memory-forgotten'); continue }
          task.status = 'succeeded'; result.processed++
        } catch {
          if ((await readPersonalForgettingBarrier()).blocksTask(task)) { await cancel('personal-memory-forgotten'); continue }
          task.status = task.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending'
          task.reason = 'model-call-failed'
          task.nextRetryAt = this.deps.nowMs() + 60000 * 2 ** (task.attempts - 1)
          result.failed++
        }
        task.updatedAt = new Date(this.deps.nowMs()).toISOString()
        await this.write(tasks)
      }
      return result
    })
  }
}

export const knowledgeRefinementTasks = new RefinementTaskService()
