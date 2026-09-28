// Note: persist refinement intent before advancing the observation cursor — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import type { LlmStageBatch, LlmStageStatus } from './processing-queue'
import { isActiveObservation, isUserStatement, observationScope } from './memory-evidence'
import { knowledgeDecisionStage, type RefinementPlan } from './decision-stage'
import { knowledgeRefinementTasks } from './refinement-tasks'

export interface LlmStageDeps {
  selectRefinement: (batch: LlmStageBatch) => Promise<RefinementPlan>
  enqueue: (plan: RefinementPlan) => Promise<number>
}

/** The queue runs model calls separately, including when no new observation exists. */
export async function runLlmStage(batch: LlmStageBatch, overrides: Partial<LlmStageDeps> = {}): Promise<LlmStageStatus> {
  const deps: LlmStageDeps = {
    selectRefinement: (input) => knowledgeDecisionStage.run(input),
    enqueue: (plan) => knowledgeRefinementTasks.enqueue(plan),
    ...overrides,
  }
  const skipped = { skipped: true as const, processed: 0, proposed: 0, merged: 0 }
  const eligible = batch.observations.filter((observation) => isActiveObservation(observation)
    && observation.memoryIntent !== 'remember'
    && (observationScope(observation) !== 'user' || isUserStatement(observation)))
  if (!eligible.length) return { ...skipped, skippedReason: 'no-evidence' }
  const plan = await deps.selectRefinement({ ...batch, observations: eligible })
  if (!Object.keys(plan.candidateHashes).length) return { ...skipped, skippedReason: 'no-refinement' }
  await deps.enqueue(plan)
  return { ...skipped, skippedReason: 'refinement-queued' }
}
