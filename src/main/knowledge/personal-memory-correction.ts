import { z } from 'zod'
import { redactHighConfidenceSecrets } from '@janus-agent/agent-core'
import { knowledgeTruthService } from './truth-service'
import { proposeFactCandidates } from './review-service'
import { readLegacyJsonl } from './legacy-memory-source'
import type { CandidateFact } from '../../shared/knowledge'
import { personalCorrectionCandidate, requirePersonalCorrectionTarget } from './personal-correction-source'

const CorrectionInput = z.object({
  targetId: z.string().min(1), targetHash: z.string().regex(/^[a-f0-9]{64}$/), content: z.string().trim().min(1).max(4000),
}).strict()

export async function proposePersonalMemoryCorrection(input: unknown): Promise<{ candidateId: string; status: CandidateFact['status'] }> {
  const parsed = CorrectionInput.parse(input)
  const targets = (await knowledgeTruthService.list()).facts.filter(fact => fact.id === parsed.targetId)
  if (targets.length !== 1) throw new Error('Personal correction target is missing or ambiguous')
  const target = targets[0]
  requirePersonalCorrectionTarget(target, parsed.targetHash)
  const content = redactHighConfidenceSecrets(parsed.content).text
  if (content === target.content) throw new Error('Personal correction must change the memory content')
  const candidate = personalCorrectionCandidate(target, content)
  const [created] = await proposeFactCandidates([candidate])
  const existing = created ?? (await readLegacyJsonl<CandidateFact>('facts/candidates.jsonl')).find(item => item.id === candidate.id)
  if (!existing) throw new Error('Personal correction candidate could not be read')
  return { candidateId: existing.id, status: existing.status }
}
