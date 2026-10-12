// Note: engineering activity contributes only opted-in personal habits, never project facts.
import type { CaptureObservationInput, Observation } from '../../shared/knowledge'
import { memoryDomainPolicy } from './memory-domain-policy'
import { knowledgeObservationService, type ObservationCaptureContext } from './observation-service'

export async function captureEngineeringUserMemory(input: CaptureObservationInput, context: ObservationCaptureContext): Promise<Observation | undefined> {
  if (context.speaker !== 'user' || !(await memoryDomainPolicy()).inferEngineeringHabits) return undefined
  try { return await knowledgeObservationService.capture(input, context) }
  catch (error) {
    if (!(error instanceof Error && error.message === 'memory-capture-disabled')) console.warn('[memory] Personal habit source could not be saved')
    return undefined
  }
}
