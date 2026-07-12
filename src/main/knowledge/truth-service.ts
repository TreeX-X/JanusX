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
): Promise<T[]> {
  try {
    const content = await readFile(join(knowledgeRootPath(), relativePath), 'utf8')
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const parsed: unknown = JSON.parse(line)
          return isValid(parsed) ? [parsed] : []
        } catch {
          return []
        }
      })
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
      readJsonl(join('facts', 'facts.jsonl'), isMemoryFact),
      readPublishedWikiPages(),
      readJsonl(join('graph', 'edges.jsonl'), isGraphEdge),
    ])

    return {
      facts,
      wikiPages,
      graphEdges,
    }
  }
}

export const knowledgeTruthService = new KnowledgeTruthService()
