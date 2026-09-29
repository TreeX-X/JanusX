import { reviewCandidateSnapshot, type ReviewCandidate } from '../../shared/review-candidate-snapshot'
import { prepareFactReview, recoverPendingFactReview } from './fact-review-recovery'
import { factSlotFields } from '../../shared/fact-slot'
import { factReviewContext, replacementHash, sameFactDomain } from './fact-conflicts'
import { readPersonalForgettingBarrier } from './personal-forgetting-barrier'
import { readObservationRevocationBarrier } from './observation-revocation-barrier'
/**
 * @file KnowledgeReviewService —— 候选审核 / 应用闭环（MVP）
 * @description
 *  - 唯一入口：rejectCandidate / applyCandidate（approve+apply 合并）。
 *  - 仅处理 status === 'proposed' 的 fact / wiki-patch / graph-edge。
 *  - 落真相层：facts/facts.jsonl、graph/edges.jsonl、wiki/pages + pages-index.json。
 *  - 候选 JSONL 小体量：整文件读 → 改 status → 原子 rewrite。
 *  - 不触碰 extract 提示词、search 算法、vector/MCP。
 */
import { rename, writeFile, mkdir, readFile, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
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
import { factScope, isMemoryScope, isSourceEvidence } from './memory-evidence'
import { candidateDecisionHash } from './decision-scorer'
import { reviewedFactHash } from './profile-projection'
import { readLegacyJsonl, validateLegacyCandidate } from './legacy-memory-source'
import { validatePersonalCorrection } from './personal-correction-source'
import type { MemoryDecisionAnnotation } from '../../shared/memory-decision'
import type {
  ReviewCandidateInput,
  ReviewCandidateType,
  ReviewResult,
} from '../../shared/ipc/knowledge'
export type {
  ReviewCandidateInput,
  ReviewCandidateType,
  ReviewResult,
} from '../../shared/ipc/knowledge'

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
  sourceNoteRefs?: WikiPage['sourceNoteRefs']
  workspacePath?: string
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

// Strict reads preserve damaged or inaccessible stores instead of rewriting partial snapshots.
const readJsonl = readLegacyJsonl

function assertReviewedSnapshot(candidate: ReviewCandidate, input: ReviewCandidateInput): void {
  const hash = createHash('sha256').update(reviewCandidateSnapshot(candidate)).digest('hex')
  if (!/^[a-f0-9]{64}$/.test(input.candidateHash ?? '') || hash !== input.candidateHash) {
    throw new Error('Candidate changed or review snapshot missing; refresh before reviewing')
  }
}

export async function proposeDerivedCandidates(candidates: Array<CandidateWikiPatch | CandidateGraphEdge>): Promise<void> {
  for (const type of ['wiki-patch', 'graph-edge'] as const) {
    const incoming = candidates.filter(candidate => candidate.type === type)
    if (!incoming.length) continue
    const path = candidateRelativePath(type)
    await withMutationLock(path, async () => {
      const records = await readJsonl<CandidateWikiPatch | CandidateGraphEdge>(path)
      const revocations = await readObservationRevocationBarrier()
      const ids = new Set(records.map(candidate => candidate.id))
      const fresh = incoming.filter(candidate => {
        if (revocations.blocksCandidate(candidate)) return false
        if (candidate.status !== 'proposed') throw new Error('Candidates require review before applying')
        if (ids.has(candidate.id)) return false
        ids.add(candidate.id)
        return true
      })
      if (fresh.length) await writeJsonlAtomic(path, [...records, ...fresh])
    })
  }
}

async function writeJsonlAtomic(relativePath: string, records: unknown[]): Promise<void> {
  const filePath = absolute(relativePath)
  await ensureParent(filePath)
  const body = records.map((record) => JSON.stringify(record)).join('\n')
  const next = body.length > 0 ? `${body}\n` : ''
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(tempPath, next, 'utf8')
    await rename(tempPath, filePath)
  } catch (error) {
    await unlink(tempPath).catch(() => undefined)
    throw error
  }
}

const mutationQueues = new Map<string, Promise<void>>()

async function withMutationLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = mutationQueues.get(key) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  const queued = previous.then(() => current)
  mutationQueues.set(key, queued)
  await previous
  try {
    if (key === FACT_CANDIDATES_FILE) await recoverPendingFactReview()
    return await operation()
  } finally {
    release()
    if (mutationQueues.get(key) === queued) mutationQueues.delete(key)
  }
}

/**
 * Phase 2: serializes fact-candidate file rewrites from outside the review
 * loop (the LLM merge step) with review apply/reject on the same lock.
 */
export function withFactCandidatesLock<T>(operation: () => Promise<T>): Promise<T> {
  return withMutationLock(FACT_CANDIDATES_FILE, operation)
}

/** Single fact admission path: producers propose, explicit review applies. */
export async function proposeFactCandidates(candidates: CandidateFact[]): Promise<CandidateFact[]> {
  if (candidates.length === 0) return []
  return withFactCandidatesLock(async () => {
    const file = absolute(FACT_CANDIDATES_FILE)
    await ensureParent(file)
    let content = ''
    try { content = await readFile(file, 'utf8') } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const ids = new Set(content.split('\n').filter((line) => line.trim()).map((line) => (JSON.parse(line) as CandidateFact).id))
    const barrier = await readPersonalForgettingBarrier()
    const revocations = await readObservationRevocationBarrier()
    const fresh = candidates.filter((candidate) => {
      if (revocations.blocksCandidate(candidate)) return false
      if (barrier.blocksCandidate(candidate)) return false
      if (candidate.status !== 'proposed' || candidate.fact.status !== 'proposed') throw new Error('Candidates require review before applying')
      if (ids.has(candidate.id)) return false
      ids.add(candidate.id)
      return true
    })
    if (fresh.length) {
      const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : ''
      await writeTextAtomic(FACT_CANDIDATES_FILE, content + separator + fresh.map((candidate) => JSON.stringify(candidate)).join('\n') + '\n')
    }
    return fresh
  })
}

export function withWikiCandidatesLock<T>(operation: () => Promise<T>): Promise<T> {
  return withMutationLock(WIKI_PATCHES_FILE, operation)
}

export function withGraphCandidatesLock<T>(operation: () => Promise<T>): Promise<T> {
  return withMutationLock(GRAPH_CANDIDATES_FILE, operation)
}

/** Attach advice only if the candidate still matches the scored snapshot. */
export async function annotateFactDecisions(updates: Map<string, MemoryDecisionAnnotation>): Promise<string[]> {
  if (!updates.size) return []
  return withFactCandidatesLock(async () => {
    let content: string
    try { content = await readFile(absolute(FACT_CANDIDATES_FILE), 'utf8') } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const records = content.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line) as CandidateFact)
    const barrier = await readPersonalForgettingBarrier()
    const attached: string[] = []
    for (const candidate of records) {
      if (barrier.blocksCandidate(candidate)) continue
      const decision = updates.get(candidate.id)
      if (!decision || candidate.status !== 'proposed' || candidateDecisionHash(candidate) !== decision.candidateHash) continue
      candidate.decision = decision
      attached.push(candidate.id)
    }
    if (attached.length) await writeJsonlAtomic(FACT_CANDIDATES_FILE, records)
    return attached
  })
}

/**
 * User memory closeout: the single reader for proposed person-scope fact
 * candidates. The glance overview reads through here instead of parsing the
 * candidate file itself, so a future queue-shape change lands in one place.
 */
export async function listProposedUserFactCandidates(): Promise<CandidateFact[]> {
  const records = await readJsonl<CandidateFact>(FACT_CANDIDATES_FILE)
  const barrier = await readPersonalForgettingBarrier()
  const revocations = await readObservationRevocationBarrier()
  return records.map(candidate => revocations.candidate(barrier.candidate(candidate))).filter((candidate) =>
    candidate?.type === 'fact'
    && candidate.status === 'proposed'
    && (candidate.fact.scope === 'user' || candidate.fact.provenance.workspaceId === 'user'),
  )
}

async function restoreJsonl(relativePath: string, records: unknown[]): Promise<void> {
  await writeJsonlAtomic(relativePath, records)
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
    if (part === '.' || part === '..' || /[<>:"|?*]/.test(part) || /[. ]$/.test(part) || [...part].some(char => char.charCodeAt(0) < 32)) {
      throw new Error(`Invalid wiki page slug: ${slug}`)
    }
  }
  return parts.join('/')
}

function wikiPageRelativePath(slug: string, workspaceId: string): string {
  slug = createHash('sha256').update(workspaceId).digest('hex') + '/' + slug
  return join('wiki', 'pages', `${sanitizePageSlug(slug)}.md`)
}

async function readWikiIndex(): Promise<WikiPagesIndex> {
  const filePath = absolute(WIKI_PAGES_INDEX)
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as WikiPagesIndex
    if (!parsed || !Array.isArray(parsed.pages)) {
      throw new Error('Invalid wiki index; restore it before review')
    }
    return { version: 1, pages: parsed.pages }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, pages: [] }
    throw error
  }
}

async function writeWikiIndex(index: WikiPagesIndex): Promise<void> {
  const filePath = absolute(WIKI_PAGES_INDEX)
  await ensureParent(filePath)
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(tempPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
    await rename(tempPath, filePath)
  } catch (error) {
    await unlink(tempPath).catch(() => undefined)
    throw error
  }
}

async function writeTextAtomic(relativePath: string, content: string): Promise<void> {
  const filePath = absolute(relativePath)
  await ensureParent(filePath)
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(tempPath, content, 'utf8')
    await rename(tempPath, filePath)
  } catch (error) {
    await unlink(tempPath).catch(() => undefined)
    throw error
  }
}

async function readWikiMarkdown(relativePath: string): Promise<string | null> {
  try {
    return await readFile(absolute(relativePath), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
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
  async factReviewContext(input: ReviewCandidateInput) {
    if (input.type !== 'fact') throw new Error('Fact review requires a fact candidate')
    return withFactCandidatesLock(async () => {
      const candidates = await readJsonl<CandidateFact>(FACT_CANDIDATES_FILE)
      const candidate = candidates.find(item => item.id === input.id)
      if (!candidate) throw new Error('Candidate not found')
      assertReviewedSnapshot(candidate, input)
      requireProposed(candidate.status, candidate.id)
      const barrier = await readPersonalForgettingBarrier()
      if (barrier.blocksCandidate(candidate)) throw new Error('Personal memory has been forgotten')
      const revocations = await readObservationRevocationBarrier()
      if (revocations.blocksCandidate(candidate)) throw new Error('Observation source has been revoked')
      const facts = (await readJsonl<MemoryFact>(FACTS_FILE)).filter(fact => !barrier.blocksFact(fact) && !revocations.blocksFact(fact))
      return factReviewContext(candidate, facts, candidates.filter(item => !barrier.blocksCandidate(item)))
    })
  }

  async proposeNoteWiki(input: { draftId: string; title: string; markdown: string; rationale: string }): Promise<CandidateWikiPatch> {
    return withWikiCandidatesLock(async () => {
      const { buildNoteWikiCandidate } = await import('./note-sources')
      const candidate = await buildNoteWikiCandidate(input)
      sanitizePageSlug(candidate.pageSlug)
      const records = await readJsonl<CandidateWikiPatch>(WIKI_PATCHES_FILE)
      await writeJsonlAtomic(WIKI_PATCHES_FILE, [...records, candidate])
      return candidate
    })
  }

  async rejectCandidate(input: ReviewCandidateInput): Promise<ReviewResult> {
    return withMutationLock(candidateRelativePath(input.type), () => this.rejectLocked(input))
  }

  private async rejectLocked(input: ReviewCandidateInput): Promise<ReviewResult> {
    const { type, id, reviewNotes } = input
    const relativePath = candidateRelativePath(type)
    const records = await readJsonl<ReviewCandidate>(relativePath)
    const index = findCandidateIndex(records, id)
    if (index < 0) {
      throw new Error(`Candidate not found: type=${type} id=${id}`)
    }

    const current = records[index]!
    assertReviewedSnapshot(current, input)
    if (current.status === 'rejected') {
      return { candidate: current, auditEvents: [] }
    }
    requireProposed(current.status, id)

    const updated = {
      ...current,
      status: 'rejected' as const,
      ...(reviewNotes !== undefined ? { reviewNotes } : {}),
    }
    records[index] = updated
    await writeJsonlAtomic(relativePath, records)

    const provenance = provenanceFromCandidate(updated, input.actor ?? 'knowledge-review')
    let audit: AuditEvent
    try {
      audit = await knowledgeAuditService.record({
        action: 'candidate_rejected', targetType: auditTargetType(type), targetId: id,
        before: { status: current.status }, after: { status: 'rejected', reviewNotes: reviewNotes ?? null }, provenance,
      })
    } catch (error) {
      records[index] = current
      await writeJsonlAtomic(relativePath, records)
      throw error
    }

    return { candidate: updated, auditEvents: [audit] }
  }

  async applyCandidate(input: ReviewCandidateInput): Promise<ReviewResult> {
    // Note: offline candidates always require explicit review — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
    if (input.actor === 'auto-policy') throw new Error('Automatic acceptance is unavailable; explicit review is required')
    return withMutationLock(candidateRelativePath(input.type), async () => {
      try { return await this.applyLocked(input) }
      finally { if (input.type === 'fact') await recoverPendingFactReview() }
    })
  }

  private async applyLocked(input: ReviewCandidateInput): Promise<ReviewResult> {
    const { type, id, reviewNotes } = input
    const relativePath = candidateRelativePath(type)
    const records = await readJsonl<ReviewCandidate>(relativePath)
    const index = findCandidateIndex(records, id)
    if (index < 0) {
      throw new Error(`Candidate not found: type=${type} id=${id}`)
    }

    const current = records[index]!
    assertReviewedSnapshot(current, input)
    if (type === 'fact' && (await readPersonalForgettingBarrier()).blocksCandidate(current as CandidateFact)) {
      throw new Error('Personal memory has been forgotten')
    }
    if ((await readObservationRevocationBarrier()).blocksCandidate(current)) throw new Error('Observation source has been revoked')
    if (current.status === 'applied') {
      return { candidate: current, auditEvents: [] }
    }
    requireProposed(current.status, id)

    let applied: ReviewResult['applied']
    let rollback: () => Promise<void>
    let supersededFact: { id: string; version: number } | undefined
    let reviewId: string | undefined
    if (type === 'fact') {
      const nextCandidates = records.map((record, i) => i === index ? { ...record, status: 'applied', ...(reviewNotes !== undefined ? { reviewNotes } : {}) } : record)
      const transaction = await this.applyFact(current as CandidateFact, input, nextCandidates)
      reviewId = transaction.reviewId
      applied = { fact: transaction.value }
      rollback = transaction.rollback
      supersededFact = transaction.superseded
    } else if (type === 'graph-edge') {
      const transaction = await this.applyGraphEdge(current as CandidateGraphEdge)
      applied = { edge: transaction.value }
      rollback = transaction.rollback
    } else {
      const transaction = await this.applyWikiPatch(current as CandidateWikiPatch)
      applied = { page: transaction.value }
      rollback = transaction.rollback
    }

    const updated = {
      ...current,
      status: 'applied' as const,
      ...(reviewNotes !== undefined ? { reviewNotes } : {}),
    }
    records[index] = updated
    try {
      await writeJsonlAtomic(relativePath, records)
    } catch (error) {
      if (type !== 'fact') await rollback!()
      throw error
    }

    const provenance = provenanceFromCandidate(updated, input.actor ?? 'knowledge-review')
    const targetType = auditTargetType(type)
    try {
    const auditInputs: Parameters<typeof knowledgeAuditService.recordBatch>[0] = [{
      action: 'candidate_approved',
      targetType,
      targetId: id,
      before: { status: current.status },
      after: { status: 'applied', reviewNotes: reviewNotes ?? null,
        ...(input.replacement ? { replacementId: input.replacement.id, replacementHash: input.replacement.hash } : {}) },
      provenance,
    }]

    if (type === 'wiki-patch' && applied?.page) {
      auditInputs.push({
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
    }

    // Phase 2: supersede archives the old fact alongside the apply.
    if (type === 'fact' && supersededFact) {
      auditInputs.push({
        action: 'fact_superseded',
        targetType: 'fact',
        targetId: supersededFact.id,
        before: { status: 'active', version: supersededFact.version },
        after: { status: 'archived' },
        provenance,
      })
    }

    auditInputs.push({
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
    const auditEvents: AuditEvent[] = await knowledgeAuditService.recordBatch(auditInputs, reviewId)

    return { candidate: updated, auditEvents, applied }
    } catch (error) {
      if (type !== 'fact') {
        records[index] = current
        await writeJsonlAtomic(relativePath, records)
        await rollback!()
      }
      throw error
    }
  }

  private async applyFact(candidate: CandidateFact, input: ReviewCandidateInput, nextCandidates: unknown[]): Promise<{
    value: MemoryFact
    reviewId: string
    rollback: () => Promise<void>
    superseded?: { id: string; version: number }
  }> {
    if (candidate.fact.scope !== undefined && !isMemoryScope(candidate.fact.scope)) {
      throw new Error('Invalid fact memory scope')
    }
    if (candidate.fact.provenance.sourceEvidence !== undefined
      && (!Array.isArray(candidate.fact.provenance.sourceEvidence)
        || !candidate.fact.provenance.sourceEvidence.every(isSourceEvidence))) {
      throw new Error('Invalid fact source evidence')
    }
    if (candidate.id.startsWith('legacy-memory:') && !candidate.legacySource) throw new Error('Legacy memory source binding is missing')
    const previous = await readJsonl<MemoryFact>(FACTS_FILE)
    await validateLegacyCandidate(candidate, previous)
    validatePersonalCorrection(candidate, previous)
    if (previous.some(item => item.id === candidate.fact.id)) throw new Error('Fact ID already exists; create a distinct replacement candidate')
    const fields = factSlotFields(candidate.fact.content)
    for (const key of ['factKey', 'cardinality', 'polarity'] as const) {
      if (candidate.fact[key] !== undefined && candidate.fact[key] !== fields[key]) throw new Error('Fact slot metadata does not match content')
    }
    const barrier = await readPersonalForgettingBarrier()
    const revocations = await readObservationRevocationBarrier()
    const context = factReviewContext(candidate, previous.filter(fact => !barrier.blocksFact(fact) && !revocations.blocksFact(fact)), [])
    if (context.blocked === 'multiple-targets') throw new Error('Multiple current facts conflict; resolve them before replacement')
    if (candidate.fact.supersedes && input.replacement && candidate.fact.supersedes !== input.replacement.id) throw new Error('Replacement does not match the proposed target')
    // Phase 2 supersede: a candidate carrying `supersedes` archives the old
    // active fact and continues its version chain instead of forking a new one.
    let base = previous
    let version = candidate.fact.version || 1
    let superseded: { id: string; version: number } | undefined
    const targetId = candidate.fact.supersedes?.trim() || input.replacement?.id
    if (context.targets.length && !targetId) throw new Error('Single-value conflict requires explicit replacement')
    if (targetId) {
      const target = previous.find((item) => item.id === targetId)
      if (!target || target.status !== 'active' || previous.filter(item => item.id === targetId).length !== 1) {
        throw new Error(`Cannot supersede ${targetId}: no active truth fact with that id`)
      }
      if (target.provenance.workspaceId !== candidate.fact.provenance.workspaceId) {
        throw new Error(`Cannot supersede ${targetId}: workspace mismatch`)
      }
      if (factScope(target) !== factScope(candidate.fact)) {
        throw new Error(`Cannot supersede ${targetId}: memory scope mismatch`)
      }
      if (!sameFactDomain(target, candidate.fact)) throw new Error('Cannot supersede: ownership mismatch')
      if (barrier.blocksFact(target) || revocations.blocksFact(target) || target.ttl && !(Date.parse(target.ttl) > Date.now())) throw new Error('Replacement target is no longer eligible')
      if (!context.targets.some(item => item.id === targetId)) throw new Error('Replacement target is not a current conflict')
      if (!input.replacement || input.replacement.id !== targetId || input.replacement.hash !== replacementHash(target)) {
        throw new Error('Replacement target changed or was not explicitly reviewed; refresh before reviewing')
      }
      base = previous.map((item) =>
        item.id === targetId ? { ...item, status: 'archived' as const } : item,
      )
      version = target.version + 1
      superseded = { id: target.id, version: target.version }
    }
    const { recallState: _untrustedRecallState, ...candidateFact } = candidate.fact
    const fact: MemoryFact = {
      ...candidateFact,
      ...fields,
      ...(targetId ? { supersedes: targetId } : {}),
      scope: factScope(candidate.fact),
      status: 'active',
      version,
    }
    fact.confirmation = { kind: 'human-review', contentHash: reviewedFactHash(fact), confirmedAt: new Date().toISOString() }
    const next = [...base, fact]
    const reviewId = await prepareFactReview(next, nextCandidates)
    await writeJsonlAtomic(FACTS_FILE, next)
    return {
      value: fact,
      reviewId,
      rollback: () => restoreJsonl(FACTS_FILE, previous),
      ...(superseded ? { superseded } : {}),
    }
  }

  private async applyGraphEdge(candidate: CandidateGraphEdge): Promise<{
    value: GraphEdge
    rollback: () => Promise<void>
  }> {
    const edge: GraphEdge = { ...candidate.edge }
    const previous = await readJsonl<GraphEdge>(EDGES_FILE)
    const next = [...previous.filter((item) => item.id !== edge.id), edge]
    await writeJsonlAtomic(EDGES_FILE, next)
    return { value: edge, rollback: () => restoreJsonl(EDGES_FILE, previous) }
  }

  private async applyWikiPatch(candidate: CandidateWikiPatch): Promise<{
    value: WikiPage
    rollback: () => Promise<void>
  }> {
    const slug = sanitizePageSlug(candidate.pageSlug)
    const workspaceId = candidate.provenance.workspaceId
    const index = await readWikiIndex()
    const previousIndex = { version: 1 as const, pages: [...index.pages] }
    const samePage = (page: WikiPageIndexEntry) => page.slug === slug && page.workspaceId === workspaceId
    const existingEntry = index.pages.find(samePage)
    const fullReview = candidate.reviewMode === 'full-page'
    if ((fullReview || candidate.sourceNoteRefs?.length) && candidate.expectedVersion !== (existingEntry?.version ?? 0)) {
      throw new Error('Wiki page version changed; create a new proposal from the current full page')
    }
    const refs = new Map((existingEntry?.sourceNoteRefs ?? []).map(ref => [ref.uri, ref]))
    for (const ref of candidate.sourceNoteRefs ?? []) {
      const old = refs.get(ref.uri)
      if (old && old.sourceHash !== ref.sourceHash && !fullReview) throw new Error('Note source changed; full-page review is required: ' + ref.uri)
      refs.set(ref.uri, ref)
    }
    if (fullReview && (existingEntry?.sourceNoteRefs ?? []).some(ref => !candidate.sourceNoteRefs?.some(next => next.uri === ref.uri))) {
      throw new Error('Full-page review must include every recorded Note source')
    }
    if (candidate.sourceNoteRefs?.length) {
      const { assertWikiSources } = await import('./note-sources')
      await assertWikiSources(candidate.provenance.workspacePath, candidate.sourceNoteRefs)
    }
    const sharedPath = existingEntry && index.pages.some(page => !samePage(page) && page.relativePath === existingEntry.relativePath)
    const relativePath = existingEntry && !sharedPath ? existingEntry.relativePath : wikiPageRelativePath(slug, workspaceId)
    const existingMarkdown = existingEntry ? await readWikiMarkdown(existingEntry.relativePath) : null
    if (existingEntry && existingMarkdown === null) throw new Error('Existing wiki content is missing; restore it before review')
    const previousTarget = await readWikiMarkdown(relativePath)
    const patch = candidate.patchMarkdown.trim()
    if (!patch) throw new Error('Wiki content is empty')
    const alreadyMaterialized = !fullReview && (existingMarkdown?.includes(patch) ?? false)
    const markdown = fullReview ? patch + String.fromCharCode(10) : alreadyMaterialized && existingMarkdown !== null
      ? existingMarkdown
      : mergeWikiMarkdown(existingMarkdown, candidate.title, patch)
    await writeTextAtomic(relativePath, markdown)
    const now = new Date().toISOString()
    const version = (existingEntry?.version ?? 0) + 1
    const entry: WikiPageIndexEntry = {
      slug,
      title: candidate.title || existingEntry?.title || slug,
      relativePath: relativePath.replace(/\\/g, '/'),
      tags: existingEntry?.tags ?? [],
      status: 'published',
      // 沉淀 Wiki 与其总结的事实挂钩：新补丁带来的 sourceFactIds 并入已有集合。
      sourceFactIds: [...new Set([
        ...(existingEntry?.sourceFactIds ?? []),
        ...(candidate.sourceFactIds ?? []),
      ])],
      updatedAt: now,
      version,
      workspaceId,
      workspacePath: candidate.provenance.workspacePath || existingEntry?.workspacePath,
      ...(refs.size ? { sourceNoteRefs: [...refs.values()] } : {}),
    }
    index.pages = [...index.pages.filter((page) => !samePage(page)), entry]
    try {
      await writeWikiIndex(index)
    } catch (error) {
      if (previousTarget === null) {
        await unlink(absolute(relativePath)).catch(() => undefined)
      } else {
        await writeTextAtomic(relativePath, previousTarget)
      }
      throw error
    }

    const page = {
      slug,
      title: entry.title,
      markdown,
      tags: entry.tags,
      status: entry.status,
      sourceFactIds: entry.sourceFactIds,
      sourceNoteRefs: entry.sourceNoteRefs,
      workspacePath: entry.workspacePath,
      updatedAt: entry.updatedAt,
      version: entry.version,
      workspaceId: entry.workspaceId,
    }
    return {
      value: page,
      rollback: async () => {
        if (previousTarget === null) {
          await unlink(absolute(relativePath)).catch(() => undefined)
        } else {
          await writeTextAtomic(relativePath, previousTarget)
        }
        await writeWikiIndex(previousIndex)
      },
    }
  }
}

export const knowledgeReviewService = new KnowledgeReviewService()
