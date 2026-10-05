import { knowledgeObservationService } from './observation-service'
import { knowledgeProcessingQueue } from './processing-queue'
import { knowledgeContextService } from './context-service'
import { configurePersonalRecallPolicy } from './user-recall-service'
import { configureCandidateDomainPolicy, withFactCandidatesLock, withWikiCandidatesLock } from './review-service'
import { knowledgeRefinementTasks } from './refinement-tasks'
import { memoryDomainPolicy } from './memory-domain-policy'
import { factScope } from './memory-evidence'
import { basename, resolve } from 'node:path'

/** Install before capture handlers or queue recovery; pure storage instances remain reusable. */
export function installMemoryDomainControls(): void {
  knowledgeObservationService.configureCapturePolicy(async (input, context) => {
    const policy = await memoryDomainPolicy()
    const workspaceId = input.workspaceId?.trim() || basename(resolve(input.workspacePath))
    if (workspaceId === 'user') {
      return context?.memoryIntent === 'remember' ? policy.personal : policy.capturePersonal
    }
    return policy.project
  })
  knowledgeProcessingQueue.configureDomainPolicy(async workspaceId => {
    const policy = await memoryDomainPolicy()
    return workspaceId === 'user' ? policy.personal : policy.project
  })
  knowledgeContextService.configureProjectPolicy(async () => (await memoryDomainPolicy()).project)
  configurePersonalRecallPolicy(async () => (await memoryDomainPolicy()).recallPersonal)
  configureCandidateDomainPolicy(async (candidate, operation) => {
    const policy = await memoryDomainPolicy()
    if (candidate.type !== 'fact' || factScope(candidate.fact) !== 'user') return policy.project
    if (!policy.personal) return false
    return operation === 'review' || !candidate.id.startsWith('habit-candidate:') || policy.inferEngineeringHabits
      || (candidate.evidence.sources ?? []).every(source => source.workspaceId === 'user')
  })
  knowledgeRefinementTasks.configureDomainPolicy(async scope => {
    const policy = await memoryDomainPolicy()
    return scope === 'user' ? policy.personal : policy.project
  })
}

/** Closing a domain returns after writes admitted before the switch have settled. */
export async function settleMemoryMutations(): Promise<void> {
  await knowledgeObservationService.withSourceMutation(async () => {})
  await withFactCandidatesLock(async () => {})
  await withWikiCandidatesLock(async () => {})
}
