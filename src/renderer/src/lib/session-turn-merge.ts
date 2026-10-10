// Note: transcript prose pairs merge onto registry turns by end alignment,
// never by raw index — see .agents/notes/sessions/requirements/session-content-truth.md
import type {
  AgentSessionTurnKind,
  SessionTurnRecord,
  TranscriptTurn,
} from '../../../shared/ipc/session'

export interface DisplayTurn {
  id: string
  kind: AgentSessionTurnKind
  checkpointId?: string
  startedAt: string
  endedAt: string
  prompt?: string
  excerpt?: string
}

/**
 * Registry turns own identity (kind, checkpoint binding, times); transcript
 * pairs own display prose. Both sides count one turn per user question, so
 * they align from the end — earlier transcript turns that never reached the
 * registry (window cut, missed hooks) prepend as prose-only turns.
 */
export function mergeTranscriptTurns(
  base: SessionTurnRecord[],
  pairs: TranscriptTurn[],
  fallback: { createdAt: string; updatedAt: string },
): DisplayTurn[] {
  if (pairs.length === 0) {
    return base.map((turn) => ({ ...turn }))
  }
  if (base.length === 0) {
    return pairs.map((turn, index) => ({
      id: `transcript-${index}`,
      kind: 'done' as AgentSessionTurnKind,
      checkpointId: undefined,
      startedAt: fallback.createdAt,
      endedAt: fallback.updatedAt,
      prompt: turn.prompt,
      excerpt: turn.excerpt,
    }))
  }
  const offset = pairs.length - base.length
  const merged: DisplayTurn[] = []
  if (offset > 0) {
    for (let index = 0; index < offset; index += 1) {
      const turn = pairs[index]
      merged.push({
        id: `transcript-${index}`,
        kind: 'done',
        checkpointId: undefined,
        startedAt: fallback.createdAt,
        endedAt: fallback.updatedAt,
        prompt: turn.prompt,
        excerpt: turn.excerpt,
      })
    }
  }
  for (let index = 0; index < base.length; index += 1) {
    const turn = base[index]
    const pair = pairs[index + offset]
    merged.push({
      ...turn,
      prompt: pair?.prompt ?? turn.prompt,
      excerpt: pair?.excerpt ?? turn.excerpt,
    })
  }
  return merged
}
