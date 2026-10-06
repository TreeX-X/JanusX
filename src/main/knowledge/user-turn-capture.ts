// Note: project turns skip personal capture — see .agents/notes/2026-09-17-chat-turn-guard-domain-s6--fd109997.md
/**
 * @file Person turn capture (user memory MVP closeout).
 * @description Writes one workspace-free janus-chat turn into person scope:
 * user plus assistant observations under the `user` sentinel; the user
 * observation is also the dated episode. Schedules the `user` queue cursor. The
 * episode TTL sits mid-range (60 days) so a monthly "what did I do" still
 * answers while harvest plus the rolling working set bound growth. Every
 * path fails open: capture must never break chat completion.
 */
import { memoryDomainPolicy } from './memory-domain-policy'
import { USER_MEMORY_WORKSPACE_ID, USER_MEMORY_WORKSPACE_PATH } from './constants'
import { knowledgeObservationService } from './observation-service'
import { knowledgeProcessingQueue } from './processing-queue'
import { userEpisodeService } from './user-episode-service'
import { logKnowledgeCaptureFailure } from './workspace-identity'
import { isRuntimeNotification } from './personal-memory-content'

/** Mid-range of the 30–90 day episode TTL band. */
export const PERSON_TURN_EPISODE_TTL_DAYS = 60

export interface PersonTurnCaptureInput {
  userText?: string
  assistantText?: string
  sessionId?: string
  correlationId?: string
  providerId?: string
  modelId?: string
}

/** Capture one workspace-free janus-chat turn into person scope; never throws. */
export async function capturePersonChatTurn(input: PersonTurnCaptureInput): Promise<void> {
  const userText = input.userText?.trim() ?? ''
  const assistantText = input.assistantText?.trim() ?? ''
  if (isRuntimeNotification(userText)) return
  if (!userText && !assistantText) return
  try {
    const policy = await memoryDomainPolicy()
    if (!policy.capturePersonal) return
    if (userText) {
      await userEpisodeService.capture({
        content: userText,
        ttlDays: policy.episodeTtlDays,
        tags: ['janus-chat', 'user'],
        sourceEventId: input.correlationId,
        sessionId: input.sessionId,
      }, { speaker: 'user' })
    }
    if (assistantText) {
      await knowledgeObservationService.capture({
        workspaceId: USER_MEMORY_WORKSPACE_ID,
        workspaceName: USER_MEMORY_WORKSPACE_ID,
        workspacePath: USER_MEMORY_WORKSPACE_PATH,
        source: 'janus-chat',
        type: 'conversation-turn',
        content: assistantText,
        summary: 'Janus Chat assistant response (no workspace)',
        tags: ['janus-chat', 'assistant'],
        actor: 'assistant',
        correlationId: input.correlationId,
        sessionId: input.sessionId,
        metadata: {
          ...(input.providerId ? { providerId: input.providerId } : {}),
          ...(input.modelId ? { modelId: input.modelId } : {}),
        },
      }, { speaker: 'assistant', sourceEventId: input.correlationId })
    }
    knowledgeProcessingQueue.scheduleImmediate(USER_MEMORY_WORKSPACE_ID)
  } catch (error) {
    logKnowledgeCaptureFailure(error)
  }
}

/** Capture one dated episode from a workspace-attached janus-chat turn; never throws. */
export async function capturePersonEpisodeFromTurn(input: Pick<PersonTurnCaptureInput, 'userText' | 'sessionId' | 'correlationId'>): Promise<void> {
  const userText = input.userText?.trim() ?? ''
  if (!userText || isRuntimeNotification(userText)) return
  try {
    const policy = await memoryDomainPolicy()
    if (!policy.capturePersonal) return
    await userEpisodeService.capture({
      content: userText,
      ttlDays: policy.episodeTtlDays,
      tags: ['janus-chat'],
      sessionId: input.sessionId,
      sourceEventId: input.correlationId,
    }, { speaker: 'user' })
    knowledgeProcessingQueue.scheduleImmediate(USER_MEMORY_WORKSPACE_ID)
  } catch (error) {
    logKnowledgeCaptureFailure(error)
  }
}
