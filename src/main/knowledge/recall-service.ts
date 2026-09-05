import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import type {
  CandidateFact,
  CandidateGraphEdge,
  CandidateWikiPatch,
  GraphEdge,
  KnowledgeContextItem,
  KnowledgeSearchHit,
  KnowledgeSearchIndexStats,
  KnowledgeSearchQuery,
  KnowledgeTruthSnapshot,
  MemoryFact,
  Observation,
  WikiPage,
} from '../../shared/knowledge'
import { knowledgeRootPath } from './constants'
import { knowledgeObservationService } from './observation-service'
import { Bm25Index } from './search/bm25'
import { knowledgeTruthService } from './truth-service'
import { readDerivedObservation, type DerivedObservation } from './deterministic-extractor'

/**
 * Phase 3 (§8): per-workspace observation cap. Replaces the old global
 * `OBSERVATION_INDEX_LIMIT = 200` (which starved workspaces whose evidence
 * fell outside the newest 200 records globally). Documents are grouped by
 * workspace, newest-first, and capped per workspace so every workspace keeps
 * a fair recall share. Backed by `listAllObservations` when available.
 */
export const OBSERVATION_INDEX_PER_WORKSPACE_LIMIT = 500

/** Phase 3: confidence weight — (confidence ?? 0.5) * CONFIDENCE_WEIGHT. */
export const RECALL_CONFIDENCE_WEIGHT = 0.5
/** Phase 3: freshness weight — FRESHNESS_WEIGHT * 0.5^(ageDays / HALF_LIFE). */
export const RECALL_FRESHNESS_WEIGHT = 0.5
/** Phase 3: freshness half-life in days. */
export const RECALL_FRESHNESS_HALF_LIFE_DAYS = 180
/** Phase 3: embedding is interface-only; recall always ranks with BM25. */
export const RECALL_RANKER = 'bm25' as const

export type KnowledgeRecallLayer = 'truth' | 'governance'

export interface KnowledgeRecallRequest extends Omit<KnowledgeSearchQuery, 'limit'> {
  layer: KnowledgeRecallLayer
  allowGlobal?: boolean
  requireWorkspace?: boolean
}

export interface KnowledgeRecallDocument {
  key: string
  hit: KnowledgeSearchHit
  contextItem?: Omit<KnowledgeContextItem, 'score'>
}

export interface KnowledgeRecallResult {
  documents: Array<KnowledgeRecallDocument & {
    score: number
    scoreExplanation: NonNullable<KnowledgeSearchHit['scoreExplanation']>
  }>
  indexStats: KnowledgeSearchIndexStats
  degraded?: { reason: 'empty-query' | 'missing-workspace' }
}

interface RecallSources {
  listTruth(): Promise<KnowledgeTruthSnapshot>
  listObservations(): Promise<Observation[]>
  /**
   * Phase 3: full ledger scan for per-workspace paging. Production provides
   * `observationService.listAll`; hermetic test stubs may omit it (falls back
   * to `listObservations`).
   */
  listAllObservations?: () => Promise<Observation[]>
  resolveObservationContent(observation: Observation): Promise<string>
  readCandidates<T>(relativePath: string): Promise<T[]>
  /** Phase 1-2: derived index artifacts; absent in hermetic test stubs → skipped. */
  readDerived?: (observationId: string) => Promise<DerivedObservation | null>
}

/** Phase 3: pure confidence boost, exported for unit tests. */
export function confidenceBoostFor(confidence?: number): number {
  const value = typeof confidence === 'number' && Number.isFinite(confidence)
    ? Math.min(1, Math.max(0, confidence))
    : 0.5
  return value * RECALL_CONFIDENCE_WEIGHT
}

/** Phase 3: pure freshness boost, exported for unit tests. */
export function freshnessBoostFor(createdAt: string, nowMs: number): number {
  const parsed = Date.parse(createdAt)
  if (!Number.isFinite(parsed)) return 0
  // Whole-day granularity: millisecond wall-clock jitter between two
  // consecutive recalls must not change ranking (deterministic tie-breaks).
  const ageDays = Math.max(0, Math.floor((nowMs - parsed) / 86_400_000))
  return RECALL_FRESHNESS_WEIGHT * Math.pow(0.5, ageDays / RECALL_FRESHNESS_HALF_LIFE_DAYS)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function normalizeList(values?: string[]): string[] {
  if (!values?.length) return []
  const seen = new Set<string>()
  return values.flatMap((value) => {
    const trimmed = value.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) return []
    seen.add(key)
    return [trimmed]
  })
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/^#/, '')
}

function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function documentKey(hit: Pick<KnowledgeSearchHit, 'workspaceId' | 'type' | 'id'>): string {
  return JSON.stringify([hit.workspaceId, hit.type, hit.id])
}

function searchText(hit: KnowledgeSearchHit): string {
  return [
    hit.title,
    hit.content,
    hit.tags.join(' '),
    hit.fileRefs.join(' '),
    hit.sourceObservationIds.join(' '),
  ].join('\n')
}

function normalizedPhrase(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Query terms for term-level boosts: split on whitespace/punctuation runs. */
export function recallQueryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,，、。；;：:·\-_/\\|()（）【】[\]{}"'“”‘’]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
}

/** Fraction of substantive query terms appearing in the title (0..1 scaled). */
function titleTermBoost(hit: KnowledgeSearchHit, query: string): number {
  const terms = recallQueryTerms(query).filter((term) => term.length > 1)
  if (terms.length === 0) return 0
  const title = normalizedPhrase(hit.title)
  const matched = terms.filter((term) => title.includes(term)).length
  return (matched / terms.length) * 1.2
}

/** Wiki slug boost: ids ARE slugs for wiki-page docs, but slugs are never
 * part of the indexed text, so slug hits need an explicit part. */
function slugBoost(hit: KnowledgeSearchHit, query: string): number {
  if (hit.type !== 'wiki-page') return 0
  const slug = hit.id.toLowerCase().replace(/[-_]+/g, ' ').trim()
  const phrase = normalizedPhrase(query).replace(/[-_]+/g, ' ').trim()
  if (!slug || !phrase) return 0
  if (slug === phrase) return 2
  if (slug.includes(phrase) || phrase.includes(slug)) return 1
  return 0
}

/** Query-centered excerpt for long wiki pages: keeps the match in view so
 * one long page no longer eats the whole context budget. */
export const WIKI_EXCERPT_MAX_CHARS = 1500

export function excerptAroundQuery(content: string, query: string, maxChars: number = WIKI_EXCERPT_MAX_CHARS): string {
  const budget = Math.max(0, Math.floor(maxChars))
  if (content.length <= budget) return content
  if (budget <= 4) return budget <= 1 ? content.slice(0, budget) : `${content.slice(0, budget - 1)}…`
  const lowered = content.toLowerCase()
  const terms = recallQueryTerms(query).sort((a, b) => b.length - a.length)
  let at = -1
  for (const term of terms) {
    at = lowered.indexOf(term)
    if (at >= 0) break
  }
  if (at < 0) return `${content.slice(0, maxChars - 1)}…`
  // Reserve both cut markers, then reclaim whichever side is uncut.
  const span = maxChars - 2
  const half = Math.floor(span / 2)
  let start = Math.max(0, at - half)
  let end = Math.min(content.length, start + span)
  if (end - start < span) start = Math.max(0, end - span)
  if (start === 0) end = Math.min(content.length, end + 1)
  if (end === content.length) start = Math.max(0, start - 1)
  const head = start > 0 ? '…' : ''
  const tail = end < content.length ? '…' : ''
  return `${head}${content.slice(start, end)}${tail}`
}

function lexicalExplanation(hit: KnowledgeSearchHit, query: string, bm25: number, nowMs: number) {
  const phrase = normalizedPhrase(query)
  const title = normalizedPhrase(hit.title)
  const body = normalizedPhrase(hit.content)
  return {
    bm25,
    exactTitle: title === phrase ? 3 : 0,
    titlePhrase: title !== phrase && title.includes(phrase) ? 1.5 : 0,
    titleTerm: titleTermBoost(hit, query),
    slugMatch: slugBoost(hit, query),
    bodyPhrase: body.includes(phrase) ? 0.5 : 0,
    confidenceBoost: confidenceBoostFor(hit.confidence),
    freshnessBoost: freshnessBoostFor(hit.createdAt, nowMs),
  }
}

function parseTimeBound(value?: string): number | undefined {
  const t = value?.trim()
  if (!t) return undefined
  const p = Date.parse(t)
  return Number.isFinite(p) ? p : undefined
}

export function recallFilterKey(request: KnowledgeRecallRequest): string {
  const tags = normalizeList(request.tags).map(normalizeTag).sort()
  const files = normalizeList(request.files).map(normalizePath).sort()
  const types = [...(request.types ?? [])].sort()
  return JSON.stringify([request.layer, request.allowGlobal === true, request.workspaceId?.trim() ?? '', request.workspaceName?.trim() ?? '', request.workspacePath?.trim().toLowerCase() ?? '', request.source ?? '', types, tags, files, request.agentId?.trim() ?? '', request.sessionId?.trim() ?? '', request.since?.trim() ?? '', request.until?.trim() ?? ''])
}

function matchesFilters(document: KnowledgeRecallDocument, request: KnowledgeRecallRequest): boolean {
  const { hit } = document
  if (!request.allowGlobal) {
    if (request.workspaceId && hit.workspaceId !== request.workspaceId) return false
    if (request.workspaceName && hit.workspaceName !== request.workspaceName) return false
    if (request.workspacePath && normalizePath(hit.workspacePath) !== normalizePath(request.workspacePath)) {
      return false
    }
  }
  if (request.source && hit.source !== request.source) return false
  if (request.types?.length && !request.types.includes(hit.type)) return false
  const agentId = request.agentId?.trim()
  if (agentId && hit.type === 'observation' && (hit.agentId ?? '') !== agentId) return false
  const sessionId = request.sessionId?.trim()
  if (sessionId && hit.type === 'observation' && (hit.sessionId ?? '') !== sessionId) return false
  const sinceMs = parseTimeBound(request.since)
  if (sinceMs !== undefined) {
    const created = Date.parse(hit.createdAt)
    if (!Number.isFinite(created) || created < sinceMs) return false
  }
  const untilMs = parseTimeBound(request.until)
  if (untilMs !== undefined) {
    const created = Date.parse(hit.createdAt)
    if (!Number.isFinite(created) || created > untilMs) return false
  }

  const tags = normalizeList(request.tags).map(normalizeTag)
  const availableTags = new Set(hit.tags.map(normalizeTag))
  if (!tags.every((tag) => availableTags.has(tag))) return false

  const files = normalizeList(request.files).map(normalizePath)
  const availableFiles = hit.fileRefs.map(normalizePath)
  return files.every((file) =>
    availableFiles.some((available) =>
      available === file || available.endsWith(file) || available.includes(file),
    ),
  )
}

function observationDocument(
  observation: Observation,
  content: string,
  derived?: DerivedObservation | null,
): KnowledgeRecallDocument {
  const tags = derived ? Array.from(new Set([...observation.tags, ...derived.entities])) : observation.tags
  const fileRefs = derived ? Array.from(new Set([...observation.fileRefs, ...derived.fileRefs])) : observation.fileRefs
  const hit: KnowledgeSearchHit = {
    id: observation.id,
    type: 'observation',
    title: observation.summary ?? content.split('\n')[0] ?? observation.id,
    content: derived && derived.summary ? `${derived.summary}\n${content}` : content,
    score: 0,
    bm25Score: 0,
    workspaceId: observation.workspaceId,
    workspaceName: observation.workspaceName,
    workspacePath: observation.workspacePath,
    source: observation.source,
    tags,
    fileRefs,
    sourceObservationIds: [observation.id],
    createdAt: observation.createdAt,
    status: 'active',
    ...(observation.agentId ? { agentId: observation.agentId } : {}),
    ...(observation.sessionId ? { sessionId: observation.sessionId } : {}),
  }
  return { key: documentKey(hit), hit }
}

function factCandidateDocument(candidate: CandidateFact): KnowledgeRecallDocument {
  const { fact } = candidate
  const { provenance } = fact
  const hit: KnowledgeSearchHit = {
    id: candidate.id,
    type: 'fact-candidate',
    title: fact.content,
    content: fact.concepts.join(' / '),
    score: 0,
    bm25Score: 0,
    workspaceId: provenance.workspaceId,
    workspaceName: provenance.workspaceName,
    workspacePath: provenance.workspacePath,
    source: provenance.source,
    tags: fact.tags,
    fileRefs: Array.from(new Set([...fact.files, ...provenance.fileRefs])),
    sourceObservationIds: provenance.sourceObservationIds,
    createdAt: provenance.createdAt,
    confidence: fact.confidence,
    status: candidate.status,
    derivation: candidate.derivation,
  }
  return { key: documentKey(hit), hit }
}

function wikiPatchDocument(patch: CandidateWikiPatch): KnowledgeRecallDocument {
  const { provenance } = patch
  const hit: KnowledgeSearchHit = {
    id: patch.id,
    type: 'wiki-patch',
    title: patch.title,
    content: `${patch.pageSlug}\n${patch.rationale}\n${patch.patchMarkdown}`,
    score: 0,
    bm25Score: 0,
    workspaceId: provenance.workspaceId,
    workspaceName: provenance.workspaceName,
    workspacePath: provenance.workspacePath,
    source: provenance.source,
    tags: [patch.pageSlug],
    fileRefs: provenance.fileRefs,
    sourceObservationIds: provenance.sourceObservationIds,
    createdAt: provenance.createdAt,
    confidence: patch.confidence,
    status: patch.status,
    derivation: patch.derivation,
  }
  return { key: documentKey(hit), hit }
}

function graphCandidateDocument(candidate: CandidateGraphEdge): KnowledgeRecallDocument {
  const { edge } = candidate
  const hit: KnowledgeSearchHit = {
    id: candidate.id,
    type: 'graph-candidate',
    title: `${edge.from} -> ${edge.to}`,
    content: edge.type,
    score: 0,
    bm25Score: 0,
    workspaceId: edge.workspaceId,
    workspaceName: edge.workspaceId,
    workspacePath: '',
    source: 'system',
    tags: [edge.type],
    fileRefs: [],
    sourceObservationIds: edge.sourceFactIds,
    createdAt: edge.createdAt,
    confidence: edge.confidence,
    status: candidate.status,
    derivation: candidate.derivation,
  }
  return { key: documentKey(hit), hit }
}

function factDocument(fact: MemoryFact): KnowledgeRecallDocument {
  const { provenance } = fact
  const hit: KnowledgeSearchHit = {
    id: fact.id,
    type: 'memory-fact',
    title: fact.content,
    content: fact.concepts.join(' / '),
    score: 0,
    bm25Score: 0,
    workspaceId: provenance.workspaceId,
    workspaceName: provenance.workspaceName,
    workspacePath: provenance.workspacePath,
    source: provenance.source,
    tags: fact.tags,
    fileRefs: Array.from(new Set([...fact.files, ...provenance.fileRefs])),
    sourceObservationIds: provenance.sourceObservationIds,
    createdAt: provenance.createdAt,
    confidence: fact.confidence,
    status: fact.status,
  }
  return {
    key: documentKey(hit),
    hit,
    contextItem: {
      id: fact.id,
      kind: 'fact',
      title: fact.concepts.join(' / ') || 'Fact',
      content: fact.content,
      workspaceId: provenance.workspaceId,
      workspacePath: provenance.workspacePath,
      provenance: {
        observationIds: provenance.sourceObservationIds,
        factIds: [fact.id],
        fileRefs: provenance.fileRefs,
        source: provenance.source,
        actor: provenance.actor,
        createdAt: provenance.createdAt,
      },
    },
  }
}

function wikiDocument(page: WikiPage, facts: MemoryFact[]): KnowledgeRecallDocument {
  // Pages carry no file/observation provenance of their own; inherit it from
  // the settled facts they summarize so filters and context stay truthful.
  // Bonus: a real workspacePath makes path-scoped queries match wiki hits.
  const linked = facts.filter((fact) => page.sourceFactIds.includes(fact.id))
  const fileRefs = [...new Set(linked.flatMap((fact) => [...fact.files, ...fact.provenance.fileRefs]))]
  const sourceObservationIds = [...new Set(linked.flatMap((fact) => fact.provenance.sourceObservationIds))]
  const workspacePath = linked.find((fact) => fact.provenance.workspaceId === page.workspaceId)
    ?.provenance.workspacePath ?? ''
  const hit: KnowledgeSearchHit = {
    id: page.slug,
    type: 'wiki-page',
    title: page.title,
    content: page.markdown,
    score: 0,
    bm25Score: 0,
    workspaceId: page.workspaceId,
    workspaceName: page.workspaceId,
    workspacePath,
    source: 'system',
    tags: page.tags,
    fileRefs,
    sourceObservationIds,
    createdAt: page.updatedAt,
    status: 'active',
  }
  return {
    key: documentKey(hit),
    hit,
    contextItem: {
      id: page.slug,
      kind: 'wiki',
      title: page.title,
      content: page.markdown,
      workspaceId: page.workspaceId,
      provenance: {
        observationIds: sourceObservationIds,
        factIds: page.sourceFactIds,
        fileRefs,
        createdAt: page.updatedAt,
      },
    },
  }
}

function graphDocument(edge: GraphEdge): KnowledgeRecallDocument {
  const hit: KnowledgeSearchHit = {
    id: edge.id,
    type: 'graph-edge',
    title: `${edge.from} -> ${edge.to}`,
    content: `${edge.from} ${edge.type} ${edge.to}`,
    score: 0,
    bm25Score: 0,
    workspaceId: edge.workspaceId,
    workspaceName: edge.workspaceId,
    workspacePath: '',
    source: 'system',
    tags: [edge.type],
    fileRefs: [],
    sourceObservationIds: [],
    createdAt: edge.createdAt,
    confidence: edge.confidence,
    status: 'active',
  }
  return {
    key: documentKey(hit),
    hit,
    contextItem: {
      id: edge.id,
      kind: 'graph',
      title: `${edge.from} -> ${edge.to}`,
      content: `${edge.from} ${edge.type} ${edge.to}`,
      workspaceId: edge.workspaceId,
      provenance: {
        observationIds: [],
        factIds: edge.sourceFactIds,
        fileRefs: [],
        createdAt: edge.createdAt,
      },
    },
  }
}

/**
 * Phase 3: newest-first per-workspace cap. Workspaces are independent recall
 * scopes; capping globally would hide a quiet workspace behind a noisy one.
 */
export function capObservationsPerWorkspace(
  observations: Observation[],
  perWorkspaceLimit: number,
): Observation[] {
  const byWorkspace = new Map<string, Observation[]>()
  for (const observation of observations) {
    const list = byWorkspace.get(observation.workspaceId) ?? []
    list.push(observation)
    byWorkspace.set(observation.workspaceId, list)
  }
  const capped: Observation[] = []
  for (const list of byWorkspace.values()) {
    list
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .slice(0, Math.max(0, perWorkspaceLimit))
      .forEach((observation) => capped.push(observation))
  }
  return capped
}

function truthDocuments(snapshot: KnowledgeTruthSnapshot): KnowledgeRecallDocument[] {
  const documents = [
    ...snapshot.facts.map(factDocument),
    ...snapshot.wikiPages.map((page) => wikiDocument(page, snapshot.facts)),
    ...snapshot.graphEdges.filter((edge) => (edge.status ?? 'active') === 'active').map(graphDocument),
  ].sort((left, right) => {
    const keyOrder = compareText(left.key, right.key)
    if (keyOrder !== 0) return keyOrder
    const newestFirst = compareText(right.hit.createdAt, left.hit.createdAt)
    if (newestFirst !== 0) return newestFirst
    return compareText(left.hit.content, right.hit.content)
  })
  const unique = new Map<string, KnowledgeRecallDocument>()
  for (const document of documents) {
    if (!unique.has(document.key)) unique.set(document.key, document)
  }
  return [...unique.values()]
}

async function readJsonl<T>(relativePath: string): Promise<T[]> {
  try {
    const content = await readFile(join(knowledgeRootPath(), relativePath), 'utf8')
    return content.split('\n').flatMap((line) => {
      try {
        return line.trim() ? [JSON.parse(line) as T] : []
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}

const defaultSources: RecallSources = {
  listTruth: () => knowledgeTruthService.list(),
  listObservations: () => knowledgeObservationService.list({ limit: OBSERVATION_INDEX_PER_WORKSPACE_LIMIT }),
  listAllObservations: () => knowledgeObservationService.listAll(),
  resolveObservationContent: (observation) => knowledgeObservationService.resolveContent(observation),
  readCandidates: readJsonl,
  readDerived: (observationId) => readDerivedObservation(observationId),
}

export class KnowledgeRecallService {
  /**
   * documents 构建缓存（audit P2）：recall 挂在 chat 首 token 前置路径，
   * 每次全量读盘 + 解析 + 解压 blob 是延迟大头。指纹取知识库文件的
   * mtime+size（blobs 内容按 hash 寻址不可变、audit 日志不进语料，均不参与指纹），
   * 任何写入改变指纹即失效重建。
   */
  private documentsCache = new Map<KnowledgeRecallLayer, { fingerprint: string; documents: KnowledgeRecallDocument[] }>()
  private indexCache = new Map<string, { fingerprint: string; index: Bm25Index }>()
  /**
   * Phase 5 (§6 索引更新时间)：最近一次成功重建索引的时间。缓存命中不算
   * 重建——指纹不变即数据不变，该时间仍是准确的新鲜度标记。
   */
  private lastBuiltAt: string | null = null

  constructor(
    private readonly sources: RecallSources = defaultSources,
    private readonly nowMs: () => number = Date.now,
  ) {}

  /** Phase 5 (§6): processingStats / diagnostics 的索引新鲜度来源。 */
  getLastIndexBuildAt(): string | null {
    return this.lastBuiltAt
  }

  private async computeFingerprint(): Promise<string> {
    const root = knowledgeRootPath()
    let names: string[]
    try {
      names = (await readdir(root, { recursive: true })) as string[]
    } catch {
      return 'absent'
    }
    const parts = await Promise.all(
      names
        .filter((name) => {
          const top = String(name).split(/[\\/]/)[0]
          return top !== 'blobs' && top !== 'audit'
        })
        .sort()
        .map(async (name) => {
          try {
            const info = await stat(join(root, String(name)))
            return info.isFile() ? `${name}:${info.mtimeMs}:${info.size}` : ''
          } catch {
            return ''
          }
        }),
    )
    return parts.filter(Boolean).join('|')
  }

  private async cachedDocuments(layer: KnowledgeRecallLayer): Promise<KnowledgeRecallDocument[]> {
    return (await this.cachedDocumentsWithFingerprint(layer)).documents
  }

  private async cachedDocumentsWithFingerprint(
    layer: KnowledgeRecallLayer,
  ): Promise<{ fingerprint: string; documents: KnowledgeRecallDocument[] }> {
    const fingerprint = await this.computeFingerprint()
    const cached = this.documentsCache.get(layer)
    if (cached && cached.fingerprint === fingerprint) return cached
    const documents = await this.buildDocuments(layer)
    const entry = { fingerprint, documents }
    this.documentsCache.set(layer, entry)
    this.lastBuiltAt = new Date(this.nowMs()).toISOString()
    return entry
  }

  private cachedIndex(filterKey: string, fingerprint: string, build: () => Bm25Index): Bm25Index {
    const key = `${filterKey}@@${fingerprint}`
    const cached = this.indexCache.get(key)
    if (cached) return cached.index
    const index = build()
    this.indexCache.set(key, { fingerprint, index })
    while (this.indexCache.size > 50) {
      const oldest = this.indexCache.keys().next()
      if (oldest.done) break
      this.indexCache.delete(oldest.value)
    }
    return index
  }

  async recall(request: KnowledgeRecallRequest): Promise<KnowledgeRecallResult> {
    const query = request.query.trim()
    if (!query) return this.emptyResult('empty-query')
    if (request.requireWorkspace && !request.allowGlobal && !request.workspaceId && !request.workspacePath) {
      return this.emptyResult('missing-workspace')
    }

    const { fingerprint, documents: allDocuments } = await this.cachedDocumentsWithFingerprint(request.layer)
    const documents = allDocuments.filter((document) => matchesFilters(document, request))
    const filterKey = recallFilterKey(request)
    const index = this.cachedIndex(filterKey, fingerprint, () => new Bm25Index(documents.map((document) => ({
      id: document.key,
      text: searchText(document.hit),
    }))))
    const byKey = new Map(documents.map((document) => [document.key, document]))
    const now = this.nowMs()
    const ranked = index.search(query)
      .sort((left, right) => right.score - left.score || compareText(left.id, right.id))
      .flatMap(({ id, score: bm25 }) => {
        const document = byKey.get(id)
        if (!document) return []
        const scoreExplanation = lexicalExplanation(document.hit, query, bm25, now)
        const score = Object.values(scoreExplanation).reduce((total, value) => total + value, 0)
        return [{ ...document, score, scoreExplanation }]
      })
      .sort((left, right) => right.score - left.score || compareText(left.key, right.key))
    return { documents: ranked, indexStats: index.stats() }
  }

  private emptyResult(
    reason: NonNullable<KnowledgeRecallResult['degraded']>['reason'],
  ): KnowledgeRecallResult {
    return {
      documents: [],
      indexStats: { documentCount: 0, termCount: 0, averageDocumentLength: 0 },
      degraded: { reason },
    }
  }

  private async buildDocuments(layer: KnowledgeRecallLayer): Promise<KnowledgeRecallDocument[]> {
    const truth = truthDocuments(await this.sources.listTruth())
    if (layer === 'truth') return truth

    const [loadedObservations, factCandidates, wikiPatches, graphCandidates] = await Promise.all([
      this.sources.listAllObservations
        ? this.sources.listAllObservations()
        : this.sources.listObservations(),
      this.sources.readCandidates<CandidateFact>('facts/candidates.jsonl'),
      this.sources.readCandidates<CandidateWikiPatch>('wiki/patches.jsonl'),
      this.sources.readCandidates<CandidateGraphEdge>('graph/candidates.jsonl'),
    ])
    // Phase 3 (§8): per-workspace paging — newest-first cap per workspace so
    // no workspace starves the index when the ledger grows beyond the old
    // global 200. Hermetic stubs without listAll keep their provided order.
    const observations = this.sources.listAllObservations
      ? capObservationsPerWorkspace(loadedObservations, OBSERVATION_INDEX_PER_WORKSPACE_LIMIT)
      : loadedObservations
    const observationDocuments = await Promise.all(observations.map(async (observation) => {
      let content: string
      if (!observation.blobRef) {
        content = observation.content
      } else {
        try {
          content = await this.sources.resolveObservationContent(observation)
        } catch {
          content = observation.contentPreview ?? observation.content
        }
      }
      // Phase 1-2: fold the deterministic derived artifact (summary/entities)
      // into the indexed text; hermetic stubs without a reader skip this.
      let derived: DerivedObservation | null = null
      if (this.sources.readDerived) {
        try {
          derived = await this.sources.readDerived(observation.id)
        } catch {
          derived = null
        }
      }
      return observationDocument(observation, content, derived)
    }))
    return [
      ...observationDocuments,
      ...factCandidates.filter((candidate) => candidate.status === 'proposed').map(factCandidateDocument),
      ...wikiPatches.filter((candidate) => candidate.status === 'proposed').map(wikiPatchDocument),
      ...graphCandidates.filter((candidate) => candidate.status === 'proposed').map(graphCandidateDocument),
      ...truth,
    ]
  }
}

export const knowledgeRecallService = new KnowledgeRecallService()
