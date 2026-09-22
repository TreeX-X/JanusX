// Note: bounded full-prose transcript reads back the windowed session
// reading — see
// .agents/notes/implemented/feature/2026-09-22-session-resume-detail.md
import type { TranscriptDetail, TranscriptTurn } from '../../shared/ipc/session'
import {
  claudeAssistantText,
  claudeUserText,
  codexAssistantText,
  codexUserText,
  parseJsonLine,
  readBounded,
} from './external-session-scanner'
import { readOpencodeTurns } from './opencode-sessions'

/** Most-recent pairs kept; older pairs drop with the truncated flag set. */
export const TRANSCRIPT_TURN_CAP = 100
/** Per-side character cap; the provider store stays the lossless source. */
export const TRANSCRIPT_TEXT_CAP = 2000

export function truncateTranscriptText(text: string): string {
  return text.length > TRANSCRIPT_TEXT_CAP ? `${text.slice(0, TRANSCRIPT_TEXT_CAP)}…` : text
}

function truncateTurn(text: string): string {
  return truncateTranscriptText(text)
}

/**
 * Bounded full-prose read of one provider transcript. Corrupt lines and
 * unknown shapes are skipped inline; a missing or unreadable file resolves
 * null so callers fall back to cached excerpts without failing.
 */
export async function readTranscriptDetail(
  transcriptPath: string,
  engine: string,
  sessionId?: string,
): Promise<TranscriptDetail | null> {
  if (!transcriptPath) return null
  // Opencode detail reads query the sqlite store for one session; the
  // transcript path carries the database location.
  if (engine === 'opencode') {
    if (!sessionId) return null
    const list = readOpencodeTurns(transcriptPath, sessionId)
    if (!list) return null
    return { transcriptPath, turns: list.turns, totalTurns: list.totalTurns, truncated: list.truncated }
  }
  if (engine !== 'claude' && engine !== 'codex') return null
  const bounded = await readBounded(transcriptPath)
  if (!bounded) return null
  const userOf = engine === 'claude' ? claudeUserText : codexUserText
  const assistantOf = engine === 'claude' ? claudeAssistantText : codexAssistantText
  const turns: TranscriptTurn[] = []
  let pending: string | undefined
  let totalTurns = 0
  const push = (turn: TranscriptTurn): void => {
    totalTurns += 1
    turns.push(turn)
    if (turns.length > TRANSCRIPT_TURN_CAP) turns.shift()
  }
  for (const line of bounded.lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const record = parseJsonLine(trimmed)
    if (!record) continue
    const question = userOf(record)
    if (question) {
      pending = question
      continue
    }
    const answer = assistantOf(record)
    if (!answer) continue
    const turn: TranscriptTurn = {}
    if (pending !== undefined) {
      turn.prompt = truncateTurn(pending)
      pending = undefined
    }
    turn.excerpt = truncateTurn(answer)
    push(turn)
  }
  if (pending !== undefined) push({ prompt: truncateTurn(pending) })
  if (totalTurns === 0) return null
  return { transcriptPath, turns, totalTurns, truncated: totalTurns > turns.length }
}
