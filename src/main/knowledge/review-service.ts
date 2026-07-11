/**
 * @file KnowledgeReviewService —— 候选审核 / 应用闭环（MVP）
 * @description
 *  - 唯一入口：rejectCandidate / applyCandidate（approve+apply 合并）。
 *  - 仅处理 status === 'proposed' 的 fact / wiki-patch / graph-edge。
 *  - 落真相层：facts/facts.jsonl、graph/edges.jsonl、wiki/pages + pages-index.json。
 *  - 候选 JSONL 小体量：整文件读 → 改 status → 原子 rewrite。
 *  - 不触碰 extract 提示词、search 算法、vector/MCP。
 */
import { rename, writeFile, mkdir, readFile, appendFile } from 'fs/promises'
import { dirname, join } from 'path'
import type {
  AuditEvent,
  CandidateFact,
  CandidateGraphEdge,
  CandidateStatus,
  CandidateWikiPatch,
  GraphEdge,
  KnowledgeProvenance,
  MemoryFact,
  WikiPage,
  WikiPageStatus,
} from '../../shared/knowledge'
import { knowledgeRootPath } from './constants'
import { knowledgeAuditService } from './audit-service'

export type ReviewCandidateType = 'fact' | 'wiki-patch' | 'graph-edge'

export interface ReviewCandidateInput {
  type: ReviewCandidateType
  id: string
  reviewNotes?: string
}

export interface ReviewResult {
  candidate: CandidateFact | CandidateWikiPatch | CandidateGraphEdge
  auditEvents: AuditEvent[]
  applied?: {
    fact?: MemoryFact
    edge?: GraphEdge
    page?: WikiPage
  }
}

const FACT_CANDIDATES_FILE = join('facts', 'candidates.jsonl')
const FACTS_FILE = join('facts', 'facts.jsonl')
const GRAPH_CANDIDATES_FILE = join('graph', 'candidates.jsonl')
const EDGES_FILE = join('graph', 'edges.jsonl')
const WIKI_PATCHES_FILE = join('wiki', 'patches.jsonl')
const WIKI_PAGES_INDEX = join('wiki', 'pages-index.json')

interface WikiPagesIndex {
  version: 1
  pages: WikiPageIndexEntry[]
}

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

function candidateRelativePath(type: ReviewCandidateType): string {
  switch (type) {
    case 'fact':
      return FACT_CANDIDATES_FILE
    case 'wiki-patch':
      return WIKI_PATCHES_FILE
    case 'graph-edge':
      return GRAPH_CANDIDATES_FILE
  }
}

function auditTargetType(
  type: ReviewCandidateType,
): 'fact' | 'wiki' | 'graph' {
  switch (type) {
    case 'fact':
      return 'fact'
    case 'wiki-patch':
      return 'wiki'
    case 'graph-edge':
      return 'graph'
  }
}

function absolute(relativePath: string): string {
  return join(knowledgeRootPath(), relativePath)
}

async function ensureParent(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
}

async function readJsonl<T>(relativePath: string): Promise<T[]> {
  const filePath = absolute(relativePath)
  let content: string
  try {
    content = await readFile(filePath, 'utf8')
  } catch {
    return []
  }
  const results: T[] = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      results.push(JSON.parse(trimmed) as T)
    } catch {
      // skip malformed
    }
  }
  return results
}

async function writeJsonlAtomic(relativePath: string, records: unknown[]): Promise<void> {
  const filePath = absolute(relativePath)
  await ensureParent(filePath)
  const body = records.map((record) => JSON.stringify(record)).join('\n')
  const next = body.length > 0 ? `${body}\n` : ''
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tempPath, next, 'utf8')
  await rename(tempPath, filePath)
}

async function appendJsonl(relativePath: string, record: unknown): Promise<void> {
  const filePath = absolute(relativePath)
  await ensureParent(filePath)
  await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8')
}

function findCandidateIndex(
  records: Array<{ id: string }>,
  id: string,
): number {
  return records.findIndex((record) => record.id === id)
}

function requireProposed(status: CandidateStatus, id: string): void {
  if (status !== 'proposed') {
    throw new Error(`Candidate ${id} is not proposed (status=${status})`)
  }
}

function provenanceFromCandidate(
  candidate: CandidateFact | CandidateWikiPatch | CandidateGraphEdge,
  actor = 'knowledge-review',
): KnowledgeProvenance {
  if (candidate.type === 'fact') {
    return {
      ...candidate.fact.provenance,
      actor,
      createdAt: new Date().toISOString(),
    }
  }
  if (candidate.type === 'wiki-patch') {
    return {
      ...candidate.provenance,
      actor,
      createdAt: new Date().toISOString(),
    }
  }
  // graph-edge: edge has workspaceId/createdAt but not full provenance
  return {
    workspaceId: candidate.edge.workspaceId,
    workspaceName: candidate.edge.workspaceId,
    workspacePath: '',
    source: 'system',
    sourceObservationIds: [],
    fileRefs: [],
    actor,
    createdAt: new Date().toISOString(),
  }
}

function sanitizePageSlug(slug: string): string {
  const trimmed = slug.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!trimmed) throw new Error('Wiki page slug is empty')
  const parts = trimmed.split('/').filter(Boolean)
  for (const part of parts) {
    if (part === '.' || part === '..') {
      throw new Error(`Invalid wiki page slug: ${slug}`)
    }
  }
  return parts.join('/')
}

function wikiPageRelativePath(slug: string): string {
  return join('wiki', 'pages', `${sanitizePageSlug(slug)}.md`)
}

async function readWikiIndex(): Promise<WikiPagesIndex> {
  const filePath = absolute(WIKI_PAGES_INDEX)
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as WikiPagesIndex
    if (!parsed || !Array.isArray(parsed.pages)) {
      return { version: 1, pages: [] }
    }
    return { version: 1, pages: parsed.pages }
  } catch {
    return { version: 1, pages: [] }
  }
}

async function writeWikiIndex(index: WikiPagesIndex): Promise<void> {
  const filePath = absolute(WIKI_PAGES_INDEX)
  await ensureParent(filePath)
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tempPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
  await rename(tempPath, filePath)
}

async function readWikiMarkdown(relativePath: string): Promise<string | null> {
  try {
    return await readFile(absolute(relativePath), 'utf8')
  } catch {
    return null
  }
}

function mergeWikiMarkdown(existing: string | null, title: string, patchMarkdown: string): string {
  const patch = patchMarkdown.trim()
  if (!existing || !existing.trim()) {
    return `# ${title}\n\n${patch}\n`
  }
  const body = existing.trimEnd()
  return `${body}\n\n${patch}\n`
}

export class KnowledgeReviewService {
  async rejectCandidate(input: ReviewCandidateInput): Promise<ReviewResult> {
    const { type, id, reviewNotes } = input
    const relativePath = candidateRelativePath(type)
    const records = await readJsonl<CandidateFact | CandidateWikiPatch | CandidateGraphEdge>(
      relativePath,
    )
    const index = findCandidateIndex(records, id)
    if (index < 0) {
      throw new Error(`Candidate not found: type=${type} id=${id}`)
    }

    const current = records[index]!
    requireProposed(current.status, id)

    const updated = {
      ...current,
      status: 'rejected' as const,
      ...(reviewNotes !== undefined ? { reviewNotes } : {}),
    }
    records[index] = updated
    await writeJsonlAtomic(relativePath, records)

    const provenance = provenanceFromCandidate(updated)
    const audit = await knowledgeAuditService.record({
      action: 'candidate_rejected',
      targetType: auditTargetType(type),
      targetId: id,
      before: { status: current.status },
      after: { status: 'rejected', reviewNotes: reviewNotes ?? null },
      provenance,
    })

    return { candidate: updated, auditEvents: [audit] }
  }

  async applyCandidate(input: ReviewCandidateInput): Promise<ReviewResult> {
    const { type, id, reviewNotes } = input
    const relativePath = candidateRelativePath(type)
    const records = await readJsonl<CandidateFact | CandidateWikiPatch | CandidateGraphEdge>(
      relativePath,
    )
    const index = findCandidateIndex(records, id)
    if (index < 0) {
      throw new Error(`Candidate not found: type=${type} id=${id}`)
    }

    const current = records[index]!
    requireProposed(current.status, id)

    let applied: ReviewResult['applied']
    if (type === 'fact') {
      applied = { fact: await this.applyFact(current as CandidateFact) }
    } else if (type === 'graph-edge') {
      applied = { edge: await this.applyGraphEdge(current as CandidateGraphEdge) }
    } else {
      applied = { page: await this.applyWikiPatch(current as CandidateWikiPatch) }
    }

    const updated = {
      ...current,
      status: 'applied' as const,
      ...(reviewNotes !== undefined ? { reviewNotes } : {}),
    }
    records[index] = updated
    await writeJsonlAtomic(relativePath, records)

    const provenance = provenanceFromCandidate(updated)
    const targetType = auditTargetType(type)
    const approved = await knowledgeAuditService.record({
      action: 'candidate_approved',
      targetType,
      targetId: id,
      before: { status: current.status },
      after: { status: 'applied', reviewNotes: reviewNotes ?? null },
      provenance,
    })

    const auditEvents: AuditEvent[] = [approved]

    if (type === 'wiki-patch' && applied?.page) {
      const wikiAudit = await knowledgeAuditService.record({
        action: 'wiki_updated',
        targetType: 'wiki',
        targetId: applied.page.slug,
        before: null,
        after: {
          slug: applied.page.slug,
          version: applied.page.version,
          title: applied.page.title,
        },
        provenance,
      })
      auditEvents.push(wikiAudit)
    }

    const appliedAudit = await knowledgeAuditService.record({
      action: 'candidate_applied',
      targetType,
      targetId: id,
      before: { status: current.status },
      after: {
        status: 'applied',
        appliedId:
          applied?.fact?.id ??
          applied?.edge?.id ??
          applied?.page?.slug ??
          id,
      },
      provenance,
    })
    auditEvents.push(appliedAudit)

    return { candidate: updated, auditEvents, applied }
  }

  private async applyFact(candidate: CandidateFact): Promise<MemoryFact> {
    const fact: MemoryFact = {
      ...candidate.fact,
      status: 'active',
      version: candidate.fact.version || 1,
    }
    await appendJsonl(FACTS_FILE, fact)
    return fact
  }

  private async applyGraphEdge(candidate: CandidateGraphEdge): Promise<GraphEdge> {
    const edge: GraphEdge = { ...candidate.edge }
    await appendJsonl(EDGES_FILE, edge)
    return edge
  }

  private async applyWikiPatch(candidate: CandidateWikiPatch): Promise<WikiPage> {
    const slug = sanitizePageSlug(candidate.pageSlug)
    const relativePath = wikiPageRelativePath(slug)
    const existingMarkdown = await readWikiMarkdown(relativePath)
    const markdown = mergeWikiMarkdown(existingMarkdown, candidate.title, candidate.patchMarkdown)
    const filePath = absolute(relativePath)
    await ensureParent(filePath)
    await writeFile(filePath, markdown, 'utf8')

    const index = await readWikiIndex()
    const now = new Date().toISOString()
    const existingEntry = index.pages.find((page) => page.slug === slug)
    const version = (existingEntry?.version ?? 0) + 1
    const entry: WikiPageIndexEntry = {
      slug,
      title: candidate.title || existingEntry?.title || slug,
      relativePath: relativePath.replace(/\\/g, '/'),
      tags: existingEntry?.tags ?? [],
      status: 'published',
      sourceFactIds: existingEntry?.sourceFactIds ?? [],
      updatedAt: now,
      version,
      workspaceId: candidate.provenance.workspaceId,
    }
    index.pages = [...index.pages.filter((page) => page.slug !== slug), entry]
    await writeWikiIndex(index)

    return {
      slug,
      title: entry.title,
      markdown,
      tags: entry.tags,
      status: entry.status,
      sourceFactIds: entry.sourceFactIds,
      updatedAt: entry.updatedAt,
      version: entry.version,
      workspaceId: entry.workspaceId,
    }
  }
}

export const knowledgeReviewService = new KnowledgeReviewService()
