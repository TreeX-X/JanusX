/**
 * @file LLM sedimentation stage (Phase 2, §5 of the plan).
 * @description Optional async enhancement behind the deterministic stage:
 *              runs only after the deterministic stage completed for a batch,
 *              only when `KnowledgeSettings.mode !== 'deterministic-only'`,
 *              and only when a default model exists. Delivers the queue batch
 *              in chunks of ≤ 50 observations to the extract service.
 *
 *              Degraded extract results (model failure / timeout / invalid
 *              output) are rethrown so the queue records them in the `llm`
 *              failure ledger + `processing_failed` audit; deterministic
 *              products are already on disk and untouched. Skips (mode off /
 *              no model) resolve normally so the queue can advance llmCursor.
 */

import type { Observation } from '../../shared/knowledge'
import type { KnowledgeProcessingMode } from '../../shared/knowledge-settings'
import type { LlmStageBatch, LlmStageStatus } from './processing-queue'
import { knowledgeExtractService } from './extract-service'
import { configService } from '../config/service'
import { llmService } from '../llm/LlmService'

/** §5: the queue delivers batches of at most this many observations per LLM call. */
export const LLM_STAGE_BATCH_LIMIT = 50

export interface LlmStageDeps {
  getMode: () => Promise<KnowledgeProcessingMode>
  hasDefaultModel: () => Promise<boolean>
  extractChunk: (observations: Observation[]) => Promise<{ proposed: number; merged: number }>
}

function defaultDeps(): LlmStageDeps {
  return {
    getMode: async () => (await configService.getKnowledgeSettings()).mode,
    hasDefaultModel: async () =>
      llmService.getDefaultModel().then((model) => model !== null, () => false),
    extractChunk: async (observations) => {
      const result = await knowledgeExtractService.extract({ observations })
      if (result.degraded) {
        throw new Error(
          `LLM stage degraded: ${result.degraded.reason}${
            result.degraded.detail ? ` (${result.degraded.detail})` : ''
          }`,
        )
      }
      return {
        proposed: result.facts.length + result.wikiPatches.length + result.graphEdges.length,
        merged: result.mergedFactCandidateIds?.length ?? 0,
      }
    },
  }
}

/**
 * Runs the LLM stage over one workspace batch from the queue.
 * Never throws on skips; throws on degraded model output (queue ledger path).
 */
export async function runLlmStage(
  batch: LlmStageBatch,
  overrides: Partial<LlmStageDeps> = {},
): Promise<LlmStageStatus> {
  const deps: LlmStageDeps = { ...defaultDeps(), ...overrides }
  const skipped = { skipped: true as const, processed: 0, proposed: 0, merged: 0 }

  if ((await deps.getMode()) === 'deterministic-only') {
    return { ...skipped, skippedReason: 'deterministic-only' }
  }
  if (!(await deps.hasDefaultModel())) {
    return { ...skipped, skippedReason: 'no-default-llm' }
  }

  let proposed = 0
  let merged = 0
  for (let offset = 0; offset < batch.observations.length; offset += LLM_STAGE_BATCH_LIMIT) {
    const chunk = batch.observations.slice(offset, offset + LLM_STAGE_BATCH_LIMIT)
    const outcome = await deps.extractChunk(chunk)
    proposed += outcome.proposed
    merged += outcome.merged
  }
  return { skipped: false, processed: batch.observations.length, proposed, merged }
}
