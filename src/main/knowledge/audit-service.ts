import { createHash, randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AuditEvent } from '../../shared/knowledge'
import type { AuditPage, AuditPageQuery, AuditQuery, AuditStats } from '../../shared/ipc/knowledge'
import { z } from 'zod'
import { redactHighConfidenceSecrets } from '@janus-agent/agent-core'
import { auditBatchEventId } from './fact-review-recovery'
export type { AuditQuery, AuditStats } from '../../shared/ipc/knowledge'
import { knowledgeRootPath } from './constants'

const AUDIT_FILE = join('audit', 'audit.jsonl')
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/** Caller-supplied audit event; the service assigns `id`. */
export type AuditEventInput = Omit<AuditEvent, 'id'>
let auditQueue = Promise.resolve()

async function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const previous = auditQueue
  let release!: () => void
  auditQueue = new Promise<void>((resolve) => { release = resolve })
  await previous
  try { return await operation() } finally { release() }
}

function clampLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit as number)))
}

async function ensureAuditFile(): Promise<string> {
  const absolutePath = join(knowledgeRootPath(), AUDIT_FILE)
  await mkdir(dirname(absolutePath), { recursive: true })
  try {
    await readFile(absolutePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    await appendFile(absolutePath, '', 'utf8')
  }
  return absolutePath
}

function parseAuditLine(line: string): AuditEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    const event = JSON.parse(trimmed)
    return event && ['id', 'action', 'targetType', 'targetId'].every(key => typeof event[key] === 'string') && event.id ? event as AuditEvent : null
  } catch {
    return null
  }
}

const querySchema = z.object({
  domain: z.enum(['all', 'engineering', 'personal']).default('all'),
  workspaceId: z.string().min(1).max(4096).optional(), action: z.string().min(1).max(128).optional(),
  targetType: z.enum(['observation', 'fact', 'wiki', 'graph', 'index']).optional(), targetId: z.string().min(1).max(4096).optional(),
  limit: z.number().optional(), cursor: z.string().min(1).max(4096).optional(),
}).strict()
const cursorSchema = z.object({ v: z.literal(1), scope: z.string(), end: z.number().int().nonnegative(), digest: z.string(), time: z.number(), id: z.string() }).strict()
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
const eventTime = (event: AuditEvent) => Number.isFinite(Date.parse(event.provenance?.createdAt)) ? Date.parse(event.provenance.createdAt) : -8640000000000001
function inDomain(event: AuditEvent, domain: AuditQuery['domain']) {
  const workspace = event.provenance?.workspaceId
  if (domain === 'personal') return workspace === 'user'
  if (domain === 'engineering') return typeof workspace === 'string' && Boolean(workspace.trim()) && workspace !== 'user' && workspace !== 'global'
  return true
}
function filterEvents(events: AuditEvent[], query: AuditQuery) {
  return events.filter(event => inDomain(event, query.domain) && (!query.workspaceId || event.provenance?.workspaceId === query.workspaceId)
    && (!query.action || event.action === query.action) && (!query.targetType || event.targetType === query.targetType) && (!query.targetId || event.targetId === query.targetId))
}
function readEvents(content: string) {
  // Recovery can replay the same deterministic event ID; one identity is one event.
  const events = new Map<string, AuditEvent>()
  for (const line of content.split('\n')) { const event = parseAuditLine(line); if (event && !events.has(event.id)) events.set(event.id, event) }
  return [...events.values()].sort((a, b) => eventTime(b) - eventTime(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
}
function eventStats(events: AuditEvent[]): AuditStats {
  const byAction: Record<string, number> = Object.create(null)
  for (const event of events) byAction[event.action] = (byAction[event.action] ?? 0) + 1
  return { total: events.length, byAction }
}
function displayTitle(event: AuditEvent): string | undefined {
  for (const value of [event.after, event.before]) {
    if (!value || typeof value !== 'object') continue
    const nested = value.fact && typeof value.fact === 'object' && !Array.isArray(value.fact) ? value.fact : value
    for (const key of ['title', 'content', 'summary', 'markdown']) {
      const text = nested[key]
      if (typeof text === 'string' && text.trim()) return redactHighConfidenceSecrets(text).text.replace(/\s+/g, ' ').trim().slice(0, 120)
    }
  }
  return undefined
}

/**
 * Append-only audit trail for the JanusX knowledge engine.
 * Mirrors the JSONL + singleton service pattern of observation-service.
 */
export class KnowledgeAuditService {
  async record(input: AuditEventInput): Promise<AuditEvent> {
    return (await this.recordBatch([input]))[0]!
  }

  async recordBatch(inputs: AuditEventInput[], operationId?: string): Promise<AuditEvent[]> {
    if (!inputs.length) return []
    return serialized(async () => {
      const events = inputs.map((input, index): AuditEvent => ({ id: operationId ? auditBatchEventId(operationId, index) : randomUUID(), ...input }))
      const absolutePath = await ensureAuditFile()
      const previous = await readFile(absolutePath, 'utf8')
      const tempPath = `${absolutePath}.tmp-${process.pid}-${Date.now()}`
      try {
        await writeFile(tempPath, `${previous}${events.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8')
        await rename(tempPath, absolutePath)
      } catch (error) {
        await unlink(tempPath).catch(() => undefined)
        throw error
      }
      return events
    })
  }

  async list(query: AuditQuery = {}): Promise<AuditEvent[]> {
    // Windows readers must release their handle before the atomic audit replacement.
    const content = await serialized(async () => readFile(await ensureAuditFile(), 'utf8'))

    const filters = querySchema.parse(query)
    return filterEvents(readEvents(content), filters).slice(0, clampLimit(filters.limit))
  }

  async stats(query: AuditQuery = {}): Promise<AuditStats> {
    const content = await serialized(async () => readFile(await ensureAuditFile(), 'utf8'))
    return eventStats(filterEvents(readEvents(content), querySchema.parse(query)))
  }

  // Note: freeze the append-only prefix while paging, including backdated appends — see .agents/notes/2026-10-06-knowledge-review-status-audit-plan--76ef32d1.md
  async page(input: AuditPageQuery = {}): Promise<AuditPage> {
    const { cursor, limit, ...query } = querySchema.parse(input)
    const content = await serialized(async () => readFile(await ensureAuditFile(), 'utf8'))
    const scope = digest(JSON.stringify(query))
    let previous: z.infer<typeof cursorSchema> | undefined
    if (cursor) {
      try { previous = cursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))) } catch { throw new Error('audit-cursor-invalid') }
      if (previous.scope !== scope || previous.end > content.length || digest(content.slice(0, previous.end)) !== previous.digest) throw new Error('audit-cursor-stale')
    }
    const end = previous?.end ?? content.length
    const prefix = content.slice(0, end)
    const all = readEvents(prefix)
    const events = filterEvents(all, query)
    if (previous && !events.some(event => event.id === previous.id && eventTime(event) === previous.time)) throw new Error('audit-cursor-invalid')
    const remaining = previous ? events.filter(event => eventTime(event) < previous.time || eventTime(event) === previous.time && event.id < previous.id) : events
    const items = remaining.slice(0, clampLimit(limit))
    const last = items.at(-1)
    const workspaces = new Map<string, string>()
    for (const event of all) {
      if (inDomain(event, query.domain) && event.provenance?.workspaceId) workspaces.set(event.provenance.workspaceId, event.provenance.workspaceName || event.provenance.workspaceId)
    }
    return { ...eventStats(events), items: items.map(event => ({ ...event, displayTitle: displayTitle(event) })),
      workspaces: [...workspaces].map(([id, name]) => ({ id, name })),
      nextCursor: remaining.length > items.length && last ? Buffer.from(JSON.stringify({ v: 1, scope, end, digest: previous?.digest ?? digest(prefix), time: eventTime(last), id: last.id })).toString('base64url') : undefined }
  }
}

export const knowledgeAuditService = new KnowledgeAuditService()
