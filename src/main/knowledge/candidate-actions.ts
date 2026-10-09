// Note: candidate actions use the existing queue and never grant approval — see .agents/notes/knowledge/requirements/unified-memory-laya-primary.md
import { z } from 'zod'
import { configService } from '../config/service'
import { memoryDomainPolicy } from './memory-domain-policy'
import { factScope } from './memory-evidence'
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
  // Note: the current pipeline never queues legacy scoring/refinement — see .agents/notes/knowledge/tasks/knowledge-review-status-audit-plan.md
  if ((await configService.getKnowledgeSettings()).automation) throw new Error('legacy-candidate-action-disabled')
  const candidate = (await knowledgeExtractService.listFactCandidates()).find(item => item.id === input.candidateId)
  if (!candidate || candidate.status !== 'proposed' || candidate.derivation !== 'deterministic'
    || candidate.legacySource || candidate.personalCorrection || candidateDecisionHash(candidate) !== input.candidateHash) throw new Error('candidate-changed')
  const policy = await memoryDomainPolicy()
  if (!(factScope(candidate.fact) === 'user' ? policy.personal : policy.project)) throw new Error('memory-domain-disabled')
  if (input.action === 'refine') {
    await knowledgeRefinementTasks.enqueueManual(input.candidateId, input.candidateHash)
    return
  }
  const ids = new Set(candidate.evidence.observationIds)
  const observations = (await knowledgeObservationService.listAll()).filter(item => ids.has(item.id))
  const plan = await knowledgeDecisionStage.run({ workspaceId: candidate.fact.provenance.workspaceId, observations }, input)
  await knowledgeRefinementTasks.enqueue(plan)
}
