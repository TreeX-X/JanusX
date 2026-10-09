// Note: personal corrections replace only the exact source version the user reviewed — see .agents/notes/knowledge/requirements/unified-memory-laya-primary.md
import type { CandidateFact, MemoryFact } from '../../shared/knowledge'
import { factScope } from './memory-evidence'
import { profileContentHash, reviewedFactHash } from './profile-projection'

export function requirePersonalCorrectionTarget(target: MemoryFact | undefined, expectedHash: string): asserts target is MemoryFact {
  if (!target || factScope(target) !== 'user' || target.status !== 'active'
    || (target.ttl && !(Date.parse(target.ttl) > Date.now())) || reviewedFactHash(target) !== expectedHash) {
    throw new Error('Personal correction target changed, expired, or is not an active personal memory')
  }
}

export function personalCorrectionCandidate(target: MemoryFact, content: string): CandidateFact {
  const targetHash = reviewedFactHash(target)
  const key = profileContentHash({ targetId: target.id, targetHash, content })
  return {
    id: `personal-correction:${key}`, type: 'fact', status: 'proposed', derivation: 'deterministic',
    personalCorrection: { targetId: target.id, targetHash, previousContent: target.content },
    evidence: { observationIds: [], snippets: [content] },
    fact: { id: `personal-corrected:${key}`, content, kind: target.kind, scope: 'user', status: 'proposed', version: 1,
      ownerScope: target.ownerScope, tenantId: target.tenantId, projectId: target.projectId, ownerUserId: target.ownerUserId,
      supersedes: target.id, concepts: [], files: [], tags: ['personal-correction'], confidence: 0.5,
      provenance: { workspaceId: target.provenance.workspaceId, workspaceName: target.provenance.workspaceName,
        workspacePath: target.provenance.workspacePath, source: 'manual', actor: 'personal-memory-correction',
        sourceObservationIds: [], fileRefs: [], createdAt: new Date().toISOString() },
    },
  }
}

export function validatePersonalCorrection(candidate: CandidateFact, facts: MemoryFact[]): void {
  const correction = candidate.personalCorrection
  if (!correction) {
    if (candidate.id.startsWith('personal-correction:')) throw new Error('Personal correction source binding is missing')
    return
  }
  const targets = facts.filter(fact => fact.id === correction.targetId)
  if (targets.length !== 1) throw new Error('Personal correction target is missing or ambiguous')
  const target = targets[0]
  requirePersonalCorrectionTarget(target, correction.targetHash)
  const expected = personalCorrectionCandidate(target, candidate.fact.content)
  if (candidate.id !== expected.id || correction.previousContent !== target.content
    || reviewedFactHash(candidate.fact) !== reviewedFactHash(expected.fact)) {
    throw new Error('Personal correction no longer matches the submitted content or target')
  }
}
