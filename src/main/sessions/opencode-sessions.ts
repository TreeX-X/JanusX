// Note: opencode sqlite backfill plus detail reads — see
// .agents/notes/2026-09-22-opencode-session-driver--ba08f562.md
import { DatabaseSync } from 'node:sqlite'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { TranscriptTurn } from '../../shared/ipc/session'
import { TRANSCRIPT_TURN_CAP, truncateTranscriptText } from './transcript-reader'

export interface OpencodeSessionRow {
  providerSessionId: string
  cwd: string
  title: string
  firstPrompt: string
  lastExcerpt?: string
  turnCount: number
  createdAt?: string
  updatedAt?: string
}

export interface OpencodeTurnList {
  turns: TranscriptTurn[]
  totalTurns: number
  truncated: boolean
}

/** Provider on-disk store: the opencode sqlite database under the home dir. */
export function resolveOpencodeDbPath(home: string = homedir()): string {
  return join(home, '.local', 'share', 'opencode', 'opencode.db')
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function toIsoMs(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return new Date(Math.round(value)).toISOString()
}

/** First non-empty text part of one message, in part order. */
function firstTextOfParts(database: DatabaseSync, messageId: string): string | undefined {
  let rows: Array<{ data?: unknown }>
  try {
    rows = database
      .prepare("SELECT data FROM part WHERE message_id = ? ORDER BY time_created ASC LIMIT 10")
      .all(messageId) as Array<{ data?: unknown }>
  } catch {
    return undefined
  }
  for (const row of rows) {
    const text = textOfPart(row.data)
    if (text) return text
  }
  return undefined
}

/** Last non-empty text part of one message, newest part first. */
function lastTextOfParts(database: DatabaseSync, messageId: string): string | undefined {
  let rows: Array<{ data?: unknown }>
  try {
    rows = database
      .prepare("SELECT data FROM part WHERE message_id = ? ORDER BY time_created DESC LIMIT 10")
      .all(messageId) as Array<{ data?: unknown }>
  } catch {
    return undefined
  }
  for (const row of rows) {
    const text = textOfPart(row.data)
    if (text) return text
  }
  return undefined
}

function textOfPart(data: unknown): string | undefined {
  if (typeof data !== 'string' || !data) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return undefined
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  const record = parsed as Record<string, unknown>
  if (readString(record.type)?.toLowerCase() !== 'text') return undefined
  return readString(record.text)
}

function roleOf(data: unknown): string | undefined {
  if (typeof data !== 'string' || !data) return undefined
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>
    return readString(parsed.role)?.toLowerCase()
  } catch {
    return undefined
  }
}

interface MessageRow {
  id: string
  data: string
}

function messagesOf(database: DatabaseSync, sessionId: string, limit: number): MessageRow[] {
  try {
    return database
      .prepare('SELECT id, data FROM message WHERE session_id = ? ORDER BY time_created ASC LIMIT ?')
      .all(sessionId, limit) as unknown as MessageRow[]
  } catch {
    return []
  }
}

/**
 * Newest-first session rows with first question, tail answer, and user-turn
 * count resolved per session. One bad session never fails the list; a missing
 * or unreadable database resolves empty so callers skip the engine.
 */
export function listOpencodeSessions(dbPath: string, limit: number): OpencodeSessionRow[] {
  let database: DatabaseSync | undefined
  try {
    database = new DatabaseSync(dbPath, { readOnly: true })
    const sessions = database
      .prepare(
        'SELECT id, directory, title, time_created, time_updated FROM session ORDER BY time_updated DESC LIMIT ?',
      )
      .all(limit) as Array<Record<string, unknown>>
    const rows: OpencodeSessionRow[] = []
    for (const session of sessions) {
      try {
        const providerSessionId = readString(session.id)
        const cwd = readString(session.directory)
        if (!providerSessionId || !cwd) continue
        const messages = messagesOf(database, providerSessionId, 500)
        let firstPrompt: string | undefined
        let lastExcerpt: string | undefined
        let turnCount = 0
        for (const message of messages) {
          const role = roleOf(message.data)
          if (role === 'user') {
            turnCount += 1
            firstPrompt ??= firstTextOfParts(database, message.id)
          } else if (role === 'assistant') {
            // Newest answer wins: messages arrive oldest-first.
            lastExcerpt = lastTextOfParts(database, message.id) ?? lastExcerpt
          }
        }
        if (!firstPrompt && !lastExcerpt) continue
        rows.push({
          providerSessionId,
          cwd,
          title: readString(session.title) ?? '',
          firstPrompt: firstPrompt ?? '',
          ...(lastExcerpt ? { lastExcerpt: truncateTranscriptText(lastExcerpt) } : {}),
          turnCount,
          ...(toIsoMs(session.time_created) ? { createdAt: toIsoMs(session.time_created) as string } : {}),
          ...(toIsoMs(session.time_updated) ? { updatedAt: toIsoMs(session.time_updated) as string } : {}),
        })
      } catch {
        continue
      }
    }
    return rows
  } catch {
    return []
  } finally {
    try {
      database?.close()
    } catch {
      // Read-only handle on a live database; close failures stay silent.
    }
  }
}

/**
 * Full ordered question-plus-answer pairs for one session, newest-capped like
 * the transcript reader. Null when the session has no turns or the database
 * cannot serve it.
 */
export function readOpencodeTurns(dbPath: string, sessionId: string): OpencodeTurnList | null {
  if (!sessionId) return null
  let database: DatabaseSync | undefined
  try {
    database = new DatabaseSync(dbPath, { readOnly: true })
    const messages = messagesOf(database, sessionId, 500)
    const turns: TranscriptTurn[] = []
    let pending: string | undefined
    let totalTurns = 0
    const push = (turn: TranscriptTurn): void => {
      totalTurns += 1
      turns.push(turn)
      if (turns.length > TRANSCRIPT_TURN_CAP) turns.shift()
    }
    for (const message of messages) {
      const role = roleOf(message.data)
      if (role === 'user') {
        const text = firstTextOfParts(database, message.id)
        if (text) pending = text
        continue
      }
      if (role !== 'assistant') continue
      const answer = lastTextOfParts(database, message.id)
      if (!answer) continue
      const turn: TranscriptTurn = {}
      if (pending !== undefined) {
        turn.prompt = truncateTranscriptText(pending)
        pending = undefined
      }
      turn.excerpt = truncateTranscriptText(answer)
      push(turn)
    }
    if (pending !== undefined) push({ prompt: truncateTranscriptText(pending) })
    if (totalTurns === 0) return null
    return { turns, totalTurns, truncated: totalTurns > turns.length }
  } catch {
    return null
  } finally {
    try {
      database?.close()
    } catch {
      // Read-only handle on a live database; close failures stay silent.
    }
  }
}
