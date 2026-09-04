import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type {
  GraphEdge,
  KnowledgeTruthSnapshot,
  MemoryFact,
  WikiPage,
  WikiPageStatus,
} from '../../shared/knowledge'
import { knowledgeRootPath } from './constants'
import { knowledgeAuditService } from './audit-service'

interface WikiPageIndexEntry {
  slug: string
  title: string
  relativePath: string
  tags: string[]
  status: WikiPageStatus
  sourceFactIds: string[]
  updatedAt: string
  version: number
  workspaceId: string
}

type JsonRecord = Record<string, unknown>

const KNOWLEDGE_SOURCES = new Set([
  'agent-stream', 'checkpoint', 'git-analyzer', 'janus-chat', 'manual', 'tool', 'system',
])
const GRAPH_RELATIONS = new Set([
  'mentions', 'derived_from', 'supersedes', 'depends_on', 'conflicts_with',
  'implemented_in', 'owned_by', 'used_by_agent',
])
// Phase 1 convergence: MemoryFact.kind is required; records without it are schema errors.
const FACT_KINDS = new Set(['fact', 'preference', 'decision', 'procedure'])

// Phase 1 convergence: invalid persisted records are reported once (per record)
// as schema_violation audits instead of being silently filtered.
const reportedTruthViolations = new Set<string>()
const TRUTH_VIOLATION_REPORT_LIMIT = 2000

function shortLineHash(line: string): string {
  return createHash('sha256').update(line, 'utf8').digest('hex').slice(0, 16)
}

function recordIdOf(value: unknown, line: string): string {
  if (isRecord(value) && typeof value.id === 'string' && value.id) return value.id
  return `line:${shortLineHash(line)}`
}

function reportTruthSchemaViolations(
  collection: string,
  targetType: 'fact' | 'wiki' | 'graph',
  violations: string[],
): void {
  // Audit ids must be stable across platforms: readJsonl callers build
  // `collection` with path.join, which yields backslashes on Windows.
  const collectionId = collection.replace(/\\/g, '/')
  const fresh = violations.filter((key) => !reportedTruthViolations.has(`${collectionId}:${key}`))
  if (fresh.length === 0) return
  for (const key of fresh) {
    if (reportedTruthViolations.size >= TRUTH_VIOLATION_REPORT_LIMIT) break
    reportedTruthViolations.add(`${collectionId}:${key}`)
  }
  void knowledgeAuditService.record({
    action: 'schema_violation',
    targetType,
    targetId: collectionId,
    before: null,
    after: {
      violationCount: fresh.length,
      samples: fresh.slice(0, 5),
    },
    provenance: {
      workspaceId: 'global',
      workspaceName: 'global',
      workspacePath: '',
      source: 'system',
      sourceObservationIds: [],
      fileRefs: [],
      actor: 'knowledge-schema-guard',
      createdAt: new Date().toISOString(),
    },
  }).catch((error: unknown) => {
    console.error(`[knowledge] schema_violation audit failed: ${error instanceof Error ? error.message : String(error)}`)
  })
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function hasString(record: JsonRecord, key: string): boolean {
  return typeof record[key] === 'string' && record[key].length > 0
}

function hasFiniteNumber(record: JsonRecord, key: string): boolean {
  return typeof record[key] === 'number' && Number.isFinite(record[key])
}

function isMemoryFact(value: unknown): value is MemoryFact {
  if (!isRecord(value) || !isRecord(value.provenance)) return false
  const provenance = value.provenance
  return hasString(value, 'id')
    && hasString(value, 'content')
    && isStringArray(value.concepts)
    && isStringArray(value.files)
    && isStringArray(value.tags)
    && hasFiniteNumber(value, 'confidence')
    && hasFiniteNumber(value, 'version')
    && value.status === 'active'
    && typeof value.kind === 'string'
    && FACT_KINDS.has(value.kind)
    && hasString(provenance, 'workspaceId')
    && hasString(provenance, 'workspaceName')
    && typeof provenance.workspacePath === 'string'
    && typeof provenance.source === 'string'
    && KNOWLEDGE_SOURCES.has(provenance.source)
    && isStringArray(provenance.sourceObservationIds)
    && isStringArray(provenance.fileRefs)
    && hasString(provenance, 'actor')
    && hasString(provenance, 'createdAt')
}

function isGraphEdge(value: unknown): value is GraphEdge {
  return isRecord(value)
    && hasString(value, 'id')
    && hasString(value, 'from')
    && hasString(value, 'to')
    && typeof value.type === 'string'
    && GRAPH_RELATIONS.has(value.type)
    && hasFiniteNumber(value, 'confidence')
    && isStringArray(value.sourceFactIds)
    && hasString(value, 'workspaceId')
    && hasString(value, 'createdAt')
}

function isPublishedWikiEntry(value: unknown): value is WikiPageIndexEntry {
  return isRecord(value)
    && hasString(value, 'slug')
    && hasString(value, 'title')
    && hasString(value, 'relativePath')
    && isStringArray(value.tags)
    && value.status === 'published'
    && isStringArray(value.sourceFactIds)
    && hasString(value, 'updatedAt')
    && hasFiniteNumber(value, 'version')
    && hasString(value, 'workspaceId')
}

async function readJsonl<T>(
  relativePath: string,
  isValid: (value: unknown) => value is T,
  targetType: 'fact' | 'wiki' | 'graph',
): Promise<T[]> {
  try {
    const content = await readFile(join(knowledgeRootPath(), relativePath), 'utf8')
    const violations: string[] = []
    const records = content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(line)
        } catch {
          violations.push(`line:${shortLineHash(line)} (malformed-json)`)
          return []
        }
        if (!isValid(parsed)) {
          violations.push(`${recordIdOf(parsed, line)} (schema-mismatch)`)
          return []
        }
        return [parsed]
      })
    reportTruthSchemaViolations(relativePath, targetType, violations)
    return records
  } catch {
    return []
  }
}

async function readPublishedWikiPages(): Promise<WikiPage[]> {
  let parsed: unknown
  try {
    parsed = JSON.parse(
      await readFile(join(knowledgeRootPath(), 'wiki', 'pages-index.json'), 'utf8'),
    )
  } catch {
    return []
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.pages)) return []

  const pages = await Promise.all(
    parsed.pages
      .filter(isPublishedWikiEntry)
      .map(async (page): Promise<WikiPage | null> => {
        try {
          const markdown = await readFile(join(knowledgeRootPath(), page.relativePath), 'utf8')
          return { ...page, markdown }
        } catch {
          return null
        }
      }),
  )
  return pages.filter((page): page is WikiPage => page !== null)
}

export class KnowledgeTruthService {
  async list(): Promise<KnowledgeTruthSnapshot> {
    const [facts, wikiPages, graphEdges] = await Promise.all([
      readJsonl(join('facts', 'facts.jsonl'), isMemoryFact, 'fact'),
      readPublishedWikiPages(),
      readJsonl(join('graph', 'edges.jsonl'), isGraphEdge, 'graph'),
    ])

    return {
      facts,
      wikiPages,
      graphEdges,
    }
  }
}

export const knowledgeTruthService = new KnowledgeTruthService()
