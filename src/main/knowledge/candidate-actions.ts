// Note: candidate actions use the existing queue and never grant approval — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import { z } from 'zod'
import { configService } from '../config/service'
import { candidateDecisionHash } from './decision-scorer'
import { knowledgeDecisionStage } from './decision-stage'
import { knowledgeExtractService } from './extract-service'
import { knowledgeObservationService } from './observation-service'
import { knowledgeRefinementTasks } from './refinement-tasks'

export const candidateActionSchema = z.object({
  candidateId: z.string().min(1).max(512), candidateHash: z.string().regex(/^[a-f0-9]{64}$/),
  action: z.enum(['score', 'refine']),
}).strict()

/** Called inside the processing queue; IPC cannot supply evidence or scorer identity. */
export async function runCandidateAction(raw: unknown): Promise<void> {
  const input = candidateActionSchema.parse(raw)
  if (!(await configService.getKnowledgeSettings()).enabled) throw new Error('knowledge-disabled')
  const candidate = (await knowledgeExtractService.listFactCandidates()).find(item => item.id === input.candidateId)
  if (!candidate || candidate.status !== 'proposed' || candidate.derivation !== 'deterministic'
    || candidate.legacySource || candidate.personalCorrection || candidateDecisionHash(candidate) !== input.candidateHash) throw new Error('candidate-changed')
  if (input.action === 'refine') {
    await knowledgeRefinementTasks.enqueueManual(input.candidateId, input.candidateHash)
    return
  }
  const ids = new Set(candidate.evidence.observationIds)
  const observations = (await knowledgeObservationService.listAll()).filter(item => ids.has(item.id))
  const plan = await knowledgeDecisionStage.run({ workspaceId: candidate.fact.provenance.workspaceId, observations }, input)
  await knowledgeRefinementTasks.enqueue(plan)
}
