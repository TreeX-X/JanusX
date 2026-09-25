// Note: external provider sessions import by transcript backfill — see
// .agents/notes/2026-09-22-external-session-backfill--18fffeff.md
import { open, readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import {
  AGENT_ENGINE_CAPABILITIES,
  resolveSessionStorePath,
  type SessionStoreKind,
} from '../notifications/agent-engine-capabilities'
import type { AgentHookSource } from '../notifications/agent-hook-types'
import type { AgentSessionRegistry, ImportExternalSessionInput } from './session-registry'
import { listOpencodeSessions } from './opencode-sessions'

export interface ExternalScanOptions {
  env?: NodeJS.ProcessEnv
  home?: string
  maxFilesPerEngine?: number
}

export interface ExternalScanSummary {
  scanned: number
  imported: number
  updated: number
  skipped: number
}

/**
 * Engines with a readable session store, derived from the capability table in
 * table order. Adding a driver is a capability-table row plus a parser entry
 * below — this list never needs a manual edit.
 */
const SCAN_ENGINES: AgentHookSource[] = (
  Object.keys(AGENT_ENGINE_CAPABILITIES) as AgentHookSource[]
).filter((source) => AGENT_ENGINE_CAPABILITIES[source].sessionStore !== null)
const MAX_FILES_PER_ENGINE = 200
/** Full read cap; larger files fall back to head plus tail windows. */
const MAX_FULL_BYTES = 512 * 1024
const HEAD_BYTES = 16 * 1024
const TAIL_BYTES = 64 * 1024
const EXCERPT_MAX_CHARS = 500

interface FileCandidate {
  path: string
  mtimeMs: number
}

interface ParsedTranscript {
  providerSessionId: string
  cwd: string
  firstPrompt: string
  lastExcerpt?: string
  turnCount: number
  createdAt?: string
  updatedAt?: string
}

function truncate(text: string): string {
  return text.length > EXCERPT_MAX_CHARS ? text.slice(0, EXCERPT_MAX_CHARS) : text
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

export function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function toIso(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const ms = value < 1_000_000_000_000 ? Math.round(value * 1000) : Math.round(value)
    return new Date(ms).toISOString()
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value.trim())
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
  }
  return undefined
}

/** Message content as string or text blocks, across claude and codex shapes. */
export function textOfContent(content: unknown): string | undefined {
  if (typeof content === 'string') return content.trim() || undefined
  if (!Array.isArray(content)) return undefined
  const texts: string[] = []
  for (const block of content) {
    const record = asRecord(block)
    if (!record) {
      if (typeof block === 'string' && block.trim()) texts.push(block.trim())
      continue
    }
    const type = readString(record.type)?.toLowerCase()
    if (type && !['text', 'input_text', 'output_text'].includes(type)) continue
    const text = readString(record.text)
    if (text) texts.push(text)
  }
  const joined = texts.join('').trim()
  return joined || undefined
}

export function claudeUserText(record: Record<string, unknown>): string | undefined {
  if (readString(record.type)?.toLowerCase() !== 'user') return undefined
  const message = asRecord(record.message)
  if (!message || readString(message.role)?.toLowerCase() !== 'user') return undefined
  return textOfContent(message.content)
}

export function claudeAssistantText(record: Record<string, unknown>): string | undefined {
  if (readString(record.type)?.toLowerCase() !== 'assistant') return undefined
  const message = asRecord(record.message)
  if (!message || readString(message.role)?.toLowerCase() !== 'assistant') return undefined
  return textOfContent(message.content)
}

export function codexUserText(record: Record<string, unknown>): string | undefined {
  const payload = asRecord(record.payload)
  const rootType = readString(record.type)?.toLowerCase()
  if (payload) {
    const role = readString(payload.role)?.toLowerCase()
    if (rootType === 'response_item' && role === 'user') {
      const text = textOfContent(payload.content)
      if (text) return text
    }
    const payloadType = readString(payload.type)?.toLowerCase()
    if (payloadType === 'user_message') {
      const text =
        readString(payload.message) ?? readString(payload.text) ?? textOfContent(payload.content)
      if (text) return text
    }
  }
  const message = asRecord(record.message)
  if (message && readString(message.role)?.toLowerCase() === 'user') {
    const text = textOfContent(message.content)
    if (text) return text
  }
  return undefined
}

export function codexAssistantText(record: Record<string, unknown>): string | undefined {
  const payload = asRecord(record.payload)
  if (payload) {
    const role = readString(payload.role)?.toLowerCase()
    if (readString(record.type)?.toLowerCase() === 'response_item' && role === 'assistant') {
      const text = textOfContent(payload.content)
      if (text) return text
    }
    const payloadType = readString(payload.type)?.toLowerCase()
    if (payloadType === 'agent_message') {
      const text =
        readString(payload.message) ?? readString(payload.text) ?? textOfContent(payload.content)
      if (text) return text
    }
  }
  return undefined
}

function piMessageText(record: Record<string, unknown>, role: string): string | undefined {
  if (readString(record.type)?.toLowerCase() !== 'message') return undefined
  const message = asRecord(record.message)
  if (!message || readString(message.role)?.toLowerCase() !== role) return undefined
  return textOfContent(message.content)
}

export function piUserText(record: Record<string, unknown>): string | undefined {
  return piMessageText(record, 'user')
}

export function piAssistantText(record: Record<string, unknown>): string | undefined {
  return piMessageText(record, 'assistant')
}

function codexThreadFromFilename(path: string): string | undefined {
  const base = basename(path)
  const match = base.match(/-([0-9a-f]{8}[0-9a-f-]*)\.jsonl$/i)
  if (match?.[1]) return match[1]
  return base.endsWith('.jsonl') && base.length > 6 ? base.slice(0, -6) : undefined
}

async function* walkJsonl(root: string): AsyncGenerator<string> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      yield* walkJsonl(full)
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      yield full
    }
  }
}

async function collectCandidates(root: string, maxFiles: number): Promise<FileCandidate[]> {
  const candidates: FileCandidate[] = []
  for await (const path of walkJsonl(root)) {
    try {
      const info = await stat(path)
      if (!info.isFile() || info.size <= 0) continue
      candidates.push({ path, mtimeMs: info.mtimeMs })
    } catch {
      continue
    }
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return candidates.slice(0, maxFiles)
}

export interface BoundedContent {
  lines: string[]
  size: number
  mtimeMs: number
}

export async function readBounded(path: string): Promise<BoundedContent | null> {
  let info
  try {
    info = await stat(path)
  } catch {
    return null
  }
  if (!info.isFile() || info.size <= 0) return null
  const mtimeMs = info.mtimeMs
  try {
    if (info.size <= MAX_FULL_BYTES) {
      const raw = await readFile(path, 'utf-8')
      return { lines: raw.split(/\r?\n/), size: info.size, mtimeMs }
    }
    const handle = await open(path, 'r')
    try {
      const headLength = Math.min(info.size, HEAD_BYTES)
      const headBuffer = Buffer.alloc(headLength)
      await handle.read(headBuffer, 0, headLength, 0)
      const tailLength = Math.min(info.size - headLength, TAIL_BYTES)
      const tailBuffer = Buffer.alloc(Math.max(0, tailLength))
      if (tailLength > 0) {
        await handle.read(tailBuffer, 0, tailLength, info.size - tailLength)
      }
      const headLines = headBuffer.toString('utf-8').split(/\r?\n/)
      headLines.pop()
      const tailLines = tailLength > 0 ? tailBuffer.toString('utf-8').split(/\r?\n/) : []
      if (tailLength > 0) tailLines.shift()
      return { lines: [...headLines, ...tailLines], size: info.size, mtimeMs }
    } finally {
      await handle.close().catch(() => undefined)
    }
  } catch {
    return null
  }
}

function recordTimestamp(record: Record<string, unknown>): string | undefined {
  const message = asRecord(record.message)
  const payload = asRecord(record.payload)
  return (
    toIso(record.timestamp) ??
    toIso(record.created_at) ??
    toIso(record.createdAt) ??
    toIso(message?.timestamp) ??
    toIso(payload?.timestamp)
  )
}

function parseClaudeFile(lines: string[], path: string, mtimeMs: number): ParsedTranscript | null {
  let providerSessionId: string | undefined
  let cwd: string | undefined
  let firstPrompt: string | undefined
  let lastExcerpt: string | undefined
  let turnCount = 0
  let earliest: string | undefined
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const record = parseJsonLine(trimmed)
    if (!record) continue
    providerSessionId ??= readString(record.sessionId) ?? readString(record.session_id)
    cwd ??= readString(record.cwd)
    const stamp = recordTimestamp(record)
    if (stamp && (!earliest || stamp < earliest)) earliest = stamp
    if (!firstPrompt) firstPrompt = claudeUserText(record)
    const answer = claudeAssistantText(record)
    if (answer) {
      turnCount += 1
      lastExcerpt = answer
    }
  }
  providerSessionId ??= basename(path).endsWith('.jsonl') ? basename(path).slice(0, -6) : undefined
  if (!providerSessionId || !cwd) return null
  if (!firstPrompt && !lastExcerpt) return null
  const updatedAt = new Date(mtimeMs).toISOString()
  return {
    providerSessionId,
    cwd,
    firstPrompt: firstPrompt ?? '',
    ...(lastExcerpt ? { lastExcerpt: truncate(lastExcerpt) } : {}),
    turnCount,
    ...(earliest ? { createdAt: earliest } : {}),
    updatedAt,
  }
}

function parseCodexFile(lines: string[], path: string, mtimeMs: number): ParsedTranscript | null {
  let providerSessionId: string | undefined
  let cwd: string | undefined
  let firstPrompt: string | undefined
  let lastExcerpt: string | undefined
  let turnCount = 0
  let earliest: string | undefined
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const record = parseJsonLine(trimmed)
    if (!record) continue
    const rootType = readString(record.type)?.toLowerCase()
    const payload = asRecord(record.payload)
    if (rootType === 'session_meta' && payload) {
      providerSessionId ??= readString(payload.id) ?? readString(record.session_id)
      cwd ??= readString(payload.cwd)
    }
    if (rootType === 'turn_context' && payload && !cwd) {
      cwd ??= readString(payload.cwd)
    }
    const stamp = recordTimestamp(record)
    if (stamp && (!earliest || stamp < earliest)) earliest = stamp
    if (!firstPrompt) firstPrompt = codexUserText(record)
    const answer = codexAssistantText(record)
    if (answer) {
      turnCount += 1
      lastExcerpt = answer
    }
  }
  providerSessionId ??= codexThreadFromFilename(path)
  if (!providerSessionId || !cwd) return null
  if (!firstPrompt && !lastExcerpt) return null
  const updatedAt = new Date(mtimeMs).toISOString()
  return {
    providerSessionId,
    cwd,
    firstPrompt: firstPrompt ?? '',
    ...(lastExcerpt ? { lastExcerpt: truncate(lastExcerpt) } : {}),
    turnCount,
    ...(earliest ? { createdAt: earliest } : {}),
    updatedAt,
  }
}

/**
 * Pi slug directories encode the cwd (`--C--Users-Tree-...--`). The session
 * record carries the authoritative cwd; this decode is the fallback only, and
 * directory names containing dashes stay approximate.
 */
function decodePiSlugDir(slug: string): string | undefined {
  const trimmed = slug.replace(/^-+|-+$/g, '')
  const drive = trimmed.match(/^([A-Za-z])--(.*)$/)
  if (!drive) return undefined
  const rest = drive[2].replace(/-{2,}/g, '/').replace(/-/g, '/')
  if (!rest) return undefined
  return `${drive[1]}:/${rest}`
}

function piSessionIdFromFilename(path: string): string | undefined {
  const base = basename(path)
  const match = base.match(/_([0-9a-f-]{8,})\.jsonl$/i)
  if (match?.[1]) return match[1]
  return base.endsWith('.jsonl') && base.length > 6 ? base.slice(0, -6) : undefined
}

function parsePiFile(lines: string[], path: string, mtimeMs: number): ParsedTranscript | null {
  let providerSessionId: string | undefined
  let cwd: string | undefined
  let firstPrompt: string | undefined
  let lastExcerpt: string | undefined
  let turnCount = 0
  let earliest: string | undefined
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const record = parseJsonLine(trimmed)
    if (!record) continue
    if (readString(record.type)?.toLowerCase() === 'session') {
      providerSessionId ??= readString(record.id)
      cwd ??= readString(record.cwd)
    }
    const stamp = recordTimestamp(record)
    if (stamp && (!earliest || stamp < earliest)) earliest = stamp
    if (!firstPrompt) firstPrompt = piUserText(record)
    const answer = piAssistantText(record)
    if (answer) {
      turnCount += 1
      lastExcerpt = answer
    }
  }
  providerSessionId ??= piSessionIdFromFilename(path)
  cwd ??= decodePiSlugDir(basename(dirname(path)))
  if (!providerSessionId || !cwd) return null
  if (!firstPrompt && !lastExcerpt) return null
  const updatedAt = new Date(mtimeMs).toISOString()
  return {
    providerSessionId,
    cwd,
    firstPrompt: firstPrompt ?? '',
    ...(lastExcerpt ? { lastExcerpt: truncate(lastExcerpt) } : {}),
    turnCount,
    ...(earliest ? { createdAt: earliest } : {}),
    updatedAt,
  }
}

type TranscriptFileParser = (lines: string[], path: string, mtimeMs: number) => ParsedTranscript | null

/**
 * File-based transcript parsers keyed by the capability-table store kind. A
 * new file-backed engine lands here beside its table row; engines without an
 * entry skip file by file instead of failing the scan.
 */
const FILE_PARSERS: Partial<Record<Exclude<SessionStoreKind, null>, TranscriptFileParser>> = {
  'claude-projects': parseClaudeFile,
  'codex-sessions': parseCodexFile,
  'pi-sessions': parsePiFile,
}

/**
 * Opencode sqlite backfill over the session table, newest rows first. One bad
 * row never fails the scan; an unreadable database skips the engine silently
 * like a missing transcript store.
 */
function scanOpencodeStore(
  registry: AgentSessionRegistry,
  dbPath: string,
  maxFiles: number,
  summary: ExternalScanSummary,
  known: Set<string>,
): void {
  let rows: ReturnType<typeof listOpencodeSessions>
  try {
    rows = listOpencodeSessions(dbPath, maxFiles)
  } catch {
    return
  }
  for (const row of rows) {
    summary.scanned += 1
    const input: ImportExternalSessionInput = {
      engine: 'opencode',
      cwd: row.cwd,
      providerSessionId: row.providerSessionId,
      transcriptPath: dbPath,
      firstPrompt: row.firstPrompt,
      ...(row.lastExcerpt ? { lastExcerpt: row.lastExcerpt } : {}),
      turnCount: row.turnCount,
      ...(row.createdAt ? { createdAt: row.createdAt } : {}),
      ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    }
    const key = `opencode::${row.providerSessionId}`
    const isKnown = known.has(key)
    try {
      registry.importExternalSession(input)
      known.add(key)
      if (isKnown) summary.updated += 1
      else summary.imported += 1
    } catch (err) {
      console.error('[sessions] external import failed:', row.providerSessionId, err)
      summary.skipped += 1
    }
  }
}
/**
 * Pull-mode backfill over provider transcript stores. Every file tolerates
 * unknown shapes and corrupt lines; a single bad file never fails the scan.
 * Repeat scans deduplicate on engine plus provider session id inside the
 * registry, so boot passes and panel-open passes converge without duplicates.
 */
export async function scanExternalSessions(
  registry: AgentSessionRegistry,
  options: ExternalScanOptions = {},
): Promise<ExternalScanSummary> {
  const env = options.env ?? process.env
  const home = options.home ?? homedir()
  const maxFiles = options.maxFilesPerEngine ?? MAX_FILES_PER_ENGINE
  const summary: ExternalScanSummary = { scanned: 0, imported: 0, updated: 0, skipped: 0 }
  const known = new Set(
    registry.listSessions({ includeArchived: true }).map((session) => `${session.engine}::${session.providerSessionId ?? ''}`),
  )

  // One bulk pass emits one session:event: per-row notifies would refetch
  // and reorder the card list hundreds of times per scan.
  registry.beginBatch()
  try {
    for (const engine of SCAN_ENGINES) {
      const store = resolveSessionStorePath(engine as AgentHookSource, env, home)
      if (!store) continue
      // Opencode persists sessions in sqlite, not transcript files: list the
      // newest rows directly instead of walking for jsonl.
      if (engine === 'opencode') {
        scanOpencodeStore(registry, store, maxFiles, summary, known)
        continue
      }
      const candidates = await collectCandidates(store, maxFiles)
      for (const candidate of candidates) {
        summary.scanned += 1
        const bounded = await readBounded(candidate.path)
        if (!bounded) {
          summary.skipped += 1
          continue
        }
        const kind: SessionStoreKind = AGENT_ENGINE_CAPABILITIES[engine].sessionStore
        const parser = kind ? FILE_PARSERS[kind] : undefined
        if (!parser) {
          summary.skipped += 1
          continue
        }
        const parsed = parser(bounded.lines, candidate.path, bounded.mtimeMs)
        if (!parsed) {
          summary.skipped += 1
          continue
        }
        const input: ImportExternalSessionInput = {
          engine,
          cwd: parsed.cwd,
          providerSessionId: parsed.providerSessionId,
          transcriptPath: candidate.path,
          firstPrompt: parsed.firstPrompt,
          ...(parsed.lastExcerpt ? { lastExcerpt: parsed.lastExcerpt } : {}),
          turnCount: parsed.turnCount,
          ...(parsed.createdAt ? { createdAt: parsed.createdAt } : {}),
          ...(parsed.updatedAt ? { updatedAt: parsed.updatedAt } : {}),
        }
        const key = `${engine}::${parsed.providerSessionId}`
        const isKnown = known.has(key)
        try {
          registry.importExternalSession(input)
          known.add(key)
          if (isKnown) summary.updated += 1
          else summary.imported += 1
        } catch (err) {
          console.error('[sessions] external import failed:', candidate.path, err)
          summary.skipped += 1
        }
      }
    }
    return summary
  } finally {
    registry.endBatch()
  }
}
