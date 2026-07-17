import { randomUUID } from 'crypto'
import { appendFile, mkdir, readFile, rename, writeFile, unlink } from 'fs/promises'
import { dirname, join } from 'path'
import type { AuditEvent, KnowledgeProvenance } from '../../shared/knowledge'
import type { AuditQuery, AuditStats } from '../../shared/ipc/knowledge'
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
  } catch {
    await appendFile(absolutePath, '', 'utf8')
  }
  return absolutePath
}

function parseAuditLine(line: string): AuditEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as AuditEvent
  } catch {
    return null
  }
}

/**
 * Append-only audit trail for the JanusX knowledge engine.
 * Mirrors the JSONL + singleton service pattern of observation-service.
 */
export class KnowledgeAuditService {
  async record(input: AuditEventInput): Promise<AuditEvent> {
    return (await this.recordBatch([input]))[0]!
  }

  async recordBatch(inputs: AuditEventInput[]): Promise<AuditEvent[]> {
    if (!inputs.length) return []
    return serialized(async () => {
      const events = inputs.map((input): AuditEvent => ({ id: randomUUID(), ...input }))
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
    const absolutePath = await ensureAuditFile()
    let content: string
    try {
      content = await readFile(absolutePath, 'utf8')
    } catch {
      return []
    }

    const events: AuditEvent[] = []
    for (const line of content.split('\n')) {
      const event = parseAuditLine(line)
      if (!event) continue
      if (query.action && event.action !== query.action) continue
      if (query.targetType && event.targetType !== query.targetType) continue
      if (query.targetId && event.targetId !== query.targetId) continue
      events.push(event)
    }

    events.sort((left, right) =>
      (right.provenance as KnowledgeProvenance).createdAt.localeCompare(
        (left.provenance as KnowledgeProvenance).createdAt,
      ),
    )
    return events.slice(0, clampLimit(query.limit))
  }

  async stats(): Promise<AuditStats> {
    const absolutePath = await ensureAuditFile()
    let content: string
    try {
      content = await readFile(absolutePath, 'utf8')
    } catch {
      return { total: 0, byAction: {} }
    }

    const byAction: Record<string, number> = {}
    let total = 0
    for (const line of content.split('\n')) {
      const event = parseAuditLine(line)
      if (!event) continue
      total++
      byAction[event.action] = (byAction[event.action] ?? 0) + 1
    }
    return { total, byAction }
  }
}

export const knowledgeAuditService = new KnowledgeAuditService()
