import { createHash } from 'crypto'
import type { KnowledgeSource, Observation, ObservationType, RetentionClass } from '../../shared/knowledge'

export interface RetentionClassification {
  retentionClass: RetentionClass
  retentionReason: string
  contentHash: string
  contentLength: number
}

export interface ClassifyRetentionInput {
  source: KnowledgeSource
  type: ObservationType
  content: string
  fileRefs?: string[]
  tags?: string[]
}

function hasNonEmpty(values?: string[]): boolean {
  return Boolean(values && values.some((value) => value.trim().length > 0))
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

const TOOL_TYPES: ReadonlySet<ObservationType> = new Set(['tool-call', 'tool-result'])

/**
 * Shapes retention policy per design doc §10. First match wins.
 * Default is 'evidence' — unknowns are never auto-pruned.
 */
export function classifyRetention(input: ClassifyRetentionInput): RetentionClassification {
  const content = input.content ?? ''
  const length = Buffer.byteLength(content, 'utf8')
  const hash = hashContent(content)

  // 1. noise: empty system-event
  if (content.trim().length === 0 && input.type === 'system-event') {
    return { retentionClass: 'noise', retentionReason: 'empty-system-event', contentHash: hash, contentLength: length }
  }

  // 2. evidence: conversation-turn
  if (input.type === 'conversation-turn') {
    return { retentionClass: 'evidence', retentionReason: 'conversation-turn', contentHash: hash, contentLength: length }
  }

  // 3. evidence: analysis-result
  if (input.type === 'analysis-result') {
    return { retentionClass: 'evidence', retentionReason: 'analysis-result', contentHash: hash, contentLength: length }
  }

  // 4. evidence: tool with file refs
  if (TOOL_TYPES.has(input.type) && hasNonEmpty(input.fileRefs)) {
    return { retentionClass: 'evidence', retentionReason: 'tool-with-file-refs', contentHash: hash, contentLength: length }
  }

  // 5. evidence: user-note
  if (input.type === 'user-note') {
    return { retentionClass: 'evidence', retentionReason: 'user-note', contentHash: hash, contentLength: length }
  }

  // 6. operational: lifecycle system events with content but no file refs
  if (input.type === 'system-event') {
    return { retentionClass: 'operational', retentionReason: 'lifecycle-event', contentHash: hash, contentLength: length }
  }

  // 7. operational: checkpoint-event
  if (input.type === 'checkpoint-event') {
    return { retentionClass: 'operational', retentionReason: 'checkpoint-event', contentHash: hash, contentLength: length }
  }

  // 8. operational: git-event
  if (input.type === 'git-event') {
    return { retentionClass: 'operational', retentionReason: 'git-event', contentHash: hash, contentLength: length }
  }

  // 9. evidence: tool event without file refs
  if (TOOL_TYPES.has(input.type)) {
    return { retentionClass: 'evidence', retentionReason: 'tool-event', contentHash: hash, contentLength: length }
  }

  // 10. default
  return { retentionClass: 'evidence', retentionReason: 'default-evidence', contentHash: hash, contentLength: length }
}

export const RETENTION_TTL_MS: Record<RetentionClass, number | null> = {
  noise: 24 * 60 * 60 * 1000, // 1 day
  operational: 7 * 24 * 60 * 60 * 1000, // 7 days
  evidence: null, // never auto-prune
  derived: null, // never auto-prune
}

const AUTO_PRUNABLE_CLASSES: ReadonlySet<RetentionClass> = new Set(['noise', 'operational'])

/**
 * Returns true only for noise/operational records past their TTL.
 * Evidence/derived/unknown records are never auto-pruned.
 */
export function isAutoPrunable(observation: Observation, nowMs: number): boolean {
  const retentionClass = observation.retentionClass
  if (!retentionClass || !AUTO_PRUNABLE_CLASSES.has(retentionClass)) return false

  const ttl = RETENTION_TTL_MS[retentionClass]
  if (ttl === null) return false

  const createdAtMs = Date.parse(observation.createdAt)
  if (!Number.isFinite(createdAtMs)) return false

  return nowMs - createdAtMs >= ttl
}