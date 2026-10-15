// Note: transcript-driven display prose — user input and agent text replies
// resolve from the provider store through the shared kernel — see
// .agents/notes/sessions/requirements/session-content-truth.md
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { TranscriptDetail, TranscriptTurn } from '../../shared/ipc/session'
import { readTranscriptSnapshot, SNAPSHOT_TEXT_CAP, SNAPSHOT_TURN_CAP } from './transcript-snapshot'
import {
  kernelMessagesFromRecords,
  pairTurns,
  parseJsonLine,
  type KernelTurn,
} from './transcript-kernel'
import { readOpencodeTurns } from './opencode-sessions'

/** Most-recent pairs kept; older pairs drop with the truncated flag set. */
export const TRANSCRIPT_TURN_CAP = SNAPSHOT_TURN_CAP
/**
 * Display prose stays full inside the bounded window; only a pathological
 * single row is capped and marked, normal answers never truncate.
 */
export const TRANSCRIPT_TEXT_CAP = SNAPSHOT_TEXT_CAP
/** Single-doc histories (janus) parse whole with a size cap instead. */
const JANUS_DOC_MAX_BYTES = 2 * 1024 * 1024

export function truncateTranscriptText(text: string): string {
  return text.length > TRANSCRIPT_TEXT_CAP ? `${text.slice(0, TRANSCRIPT_TEXT_CAP)}…` : text
}

function toTurn(turn: KernelTurn): TranscriptTurn {
  const out: TranscriptTurn = {}
  if (turn.prompt) out.prompt = truncateTranscriptText(turn.prompt)
  if (turn.excerpt) out.excerpt = truncateTranscriptText(turn.excerpt)
  return out
}

/**
 * Janus keeps one JSON document per conversation with a messages array.
 * A missing, oversized or malformed doc resolves null like other engines.
 */
async function readJanusDoc(path: string): Promise<TranscriptTurn[] | null> {
  let raw: string
  try {
    const content = await readFile(path, 'utf-8')
    if (Buffer.byteLength(content) > JANUS_DOC_MAX_BYTES) return null
    raw = content
  } catch {
    return null
  }
  const parsed = parseJsonLine(raw)
  const messages = parsed?.messages
  if (!Array.isArray(messages)) return null
  const records = messages
    .map((message) => (message && typeof message === 'object' ? ({ message } as Record<string, unknown>) : null))
    .filter((record): record is Record<string, unknown> => record !== null)
  return pairTurns(kernelMessagesFromRecords(records, 'janus')).map(toTurn)
}

/**
 * Stream complete provider records, retaining bounded recent prose. Tool
 * output never displaces conversation or metadata; counts cover the file.
 */
export async function readTranscriptDetail(
  transcriptPath: string,
  engine: string,
  sessionId?: string,
): Promise<TranscriptDetail | null> {
  // Opencode detail reads query the sqlite store for one session; the
  // transcript path carries the database location.
  if (engine === 'opencode') {
    if (!sessionId || !transcriptPath) return null
    const list = readOpencodeTurns(transcriptPath, sessionId)
    if (!list) return null
    return { transcriptPath, turns: list.turns, totalTurns: list.totalTurns, truncated: list.truncated }
  }
  if (engine === 'janus') {
    const path =
      transcriptPath?.trim() ||
      (sessionId ? join(homedir(), '.janus', 'history', `${sessionId}.jsonl`) : '')
    if (!path) return null
    const turns = await readJanusDoc(path)
    if (!turns || turns.length === 0) return null
    const totalTurns = turns.length
    const kept = turns.slice(-TRANSCRIPT_TURN_CAP)
    return {
      transcriptPath: path,
      turns: kept,
      totalTurns,
      truncated: totalTurns > kept.length,
    }
  }
  if (engine !== 'claude' && engine !== 'codex' && engine !== 'pi') return null
  if (!transcriptPath) return null
  const snapshot = await readTranscriptSnapshot(transcriptPath, engine)
  if (!snapshot || snapshot.totalTurns === 0) return null
  return { transcriptPath, turns: snapshot.turns, totalTurns: snapshot.totalTurns, truncated: snapshot.truncated }
}
