// Note: project turns skip personal capture — see .agents/notes/2026-09-17-chat-turn-guard-domain-s6--fd109997.md
/**
 * @file Person turn capture (user memory MVP closeout).
 * @description Writes one workspace-free janus-chat turn into person scope:
 * user plus assistant observations under the `user` sentinel plus one dated
 * episode from the user text, then schedules the `user` queue cursor. The
 * episode TTL sits mid-range (60 days) so a monthly "what did I do" still
 * answers while harvest plus the rolling working set bound growth. Every
 * path fails open: capture must never break chat completion.
 */
import { USER_MEMORY_WORKSPACE_ID, USER_MEMORY_WORKSPACE_PATH } from './constants'
import { knowledgeObservationService } from './observation-service'
import { knowledgeProcessingQueue } from './processing-queue'
import { userEpisodeService } from './user-episode-service'
import { logKnowledgeCaptureFailure } from './workspace-identity'

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
  if (!userText && !assistantText) return
  try {
    const observationIds: string[] = []
    if (userText) {
      const observation = await knowledgeObservationService.capture({
        workspaceId: USER_MEMORY_WORKSPACE_ID,
        workspaceName: USER_MEMORY_WORKSPACE_ID,
        workspacePath: USER_MEMORY_WORKSPACE_PATH,
        source: 'janus-chat',
        type: 'conversation-turn',
        content: userText,
        summary: 'Janus Chat user message (no workspace)',
        tags: ['janus-chat', 'user'],
        actor: 'user',
        correlationId: input.correlationId,
        sessionId: input.sessionId,
      })
      if (typeof observation?.id === 'string') observationIds.push(observation.id)
    }
    if (assistantText) {
      const observation = await knowledgeObservationService.capture({
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
      })
      if (typeof observation?.id === 'string') observationIds.push(observation.id)
    }
    if (userText) {
      await userEpisodeService.capture({
        content: userText,
        ttlDays: PERSON_TURN_EPISODE_TTL_DAYS,
        tags: ['janus-chat'],
        sourceObservationIds: observationIds,
      })
    }
    knowledgeProcessingQueue.scheduleImmediate(USER_MEMORY_WORKSPACE_ID)
  } catch (error) {
    logKnowledgeCaptureFailure(error)
  }
}

/** Capture one dated episode from a workspace-attached janus-chat turn; never throws. */
export async function capturePersonEpisodeFromTurn(input: Pick<PersonTurnCaptureInput, 'userText'>): Promise<void> {
  const userText = input.userText?.trim() ?? ''
  if (!userText) return
  try {
    await userEpisodeService.capture({
      content: userText,
      ttlDays: PERSON_TURN_EPISODE_TTL_DAYS,
      tags: ['janus-chat'],
    })
  } catch (error) {
    logKnowledgeCaptureFailure(error)
  }
}
