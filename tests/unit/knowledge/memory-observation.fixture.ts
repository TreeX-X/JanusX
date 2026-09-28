import type { Observation } from '../../../src/shared/knowledge'

/** A host-verified user statement, not a payload-supplied actor label. */
export function personalObservation(input: Pick<Observation, 'id' | 'content' | 'createdAt'>): Observation {
  return {
    ...input,
    workspaceId: 'user', workspaceName: 'user', workspacePath: 'user', scope: 'user',
    source: 'janus-chat', type: 'conversation-turn', actor: 'user',
    sessionId: 'session', fileRefs: [], tags: [], visibility: 'restricted',
    retentionClass: 'evidence', contentHash: 'a'.repeat(64), dedupeKey: 'b'.repeat(64),
    contentLength: input.content.length, compactionStatus: 'active',
    sourceEvidence: {
      observationId: input.id, sourceEventId: input.id, sessionId: 'session',
      workspaceId: 'user', scope: 'user', source: 'janus-chat', createdAt: input.createdAt,
      speaker: 'user', authority: 'user-stated', excerpt: input.content,
    },
  }
}
