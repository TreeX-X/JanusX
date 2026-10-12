import { reviewCandidateSnapshot, type ReviewCandidate } from '../../shared/review-candidate-snapshot'
import { prepareFactReview, recoverPendingFactReview } from './fact-review-recovery'
import { factSlotFields } from '../../shared/fact-slot'
import { factReviewContext, replacementHash, sameFactDomain } from './fact-conflicts'
import { readPersonalForgettingBarrier } from './personal-forgetting-barrier'
import { readObservationRevocationBarrier } from './observation-revocation-barrier'
/** Personal candidate review: explicit confirmation, version checks and recoverable fact writes. */
import { rename, writeFile, mkdir, readFile, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import type {
  AuditEvent,
  CandidateFact,
  CandidateStatus,
  KnowledgeProvenance,
  MemoryFact,
} from '../../shared/knowledge'
import { knowledgeRootPath } from './constants'
import { knowledgeAuditService } from './audit-service'
import { factScope, isMemoryScope, isSourceEvidence } from './memory-evidence'
import { candidateDecisionHash } from './decision-scorer'
import { reviewedFactHash } from './profile-projection'
import { readLegacyJsonl, validateLegacyCandidate } from './legacy-memory-source'
import { validatePersonalCorrection } from './personal-correction-source'
import { isExactFactDuplicate, mergeFactEvidence, validateFactEvidence } from './fact-evidence-review'
import { isRawKnowledgeContent } from './knowledge-content'
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

function candidateRelativePath(type: ReviewCandidateType): string {
  if (type !== 'fact') throw new Error('Engineering knowledge review has been retired')
  return FACT_CANDIDATES_FILE
}
function auditTargetType(_type: ReviewCandidateType): 'fact' { return 'fact' }

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

let candidateAllowed: ((candidate: ReviewCandidate, operation: 'propose' | 'review') => Promise<boolean>) | undefined
export function configureCandidateDomainPolicy(policy: NonNullable<typeof candidateAllowed>): void { candidateAllowed = policy }
async function assertCandidateAllowed(candidate: ReviewCandidate, operation: 'propose' | 'review' = 'review'): Promise<void> {
  if (candidate.type !== 'fact' || factScope(candidate.fact) !== 'user') throw new Error('Engineering knowledge review has been retired')
  if (candidateAllowed && !await candidateAllowed(candidate, operation)) throw new Error('memory-domain-disabled')
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
    release(); if (mutationQueues.get(key) === queued) mutationQueues.delete(key)
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
export async function proposeFactCandidates(candidates: CandidateFact[], mergeExact = false): Promise<CandidateFact[]> {
  if (candidates.length === 0) return []
  if (candidates.some(candidate => isRawKnowledgeContent(candidate.fact.content))) throw new Error('Raw execution evidence cannot be proposed as knowledge')
  return withFactCandidatesLock(async () => {
    for (const candidate of candidates) await assertCandidateAllowed(candidate, 'propose')
    const file = absolute(FACT_CANDIDATES_FILE)
    await ensureParent(file)
    let content = ''
    try { content = await readFile(file, 'utf8') } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const existing = content.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line) as CandidateFact)
    const ids = new Set(existing.map(candidate => candidate.id))
    let merged = false
    const barrier = await readPersonalForgettingBarrier()
    const revocations = await readObservationRevocationBarrier()
    const fresh = candidates.filter((candidate) => {
      if (revocations.blocksCandidate(candidate)) return false
      if (barrier.blocksCandidate(candidate)) return false
      if (candidate.status !== 'proposed' || candidate.fact.status !== 'proposed') throw new Error('Candidates require review before applying')
      if (ids.has(candidate.id)) return false
      ids.add(candidate.id)
      if (mergeExact) {
        const target = existing.find(row => row.status === 'proposed' && isExactFactDuplicate(row.fact, candidate.fact))
        if (target) {
          target.fact = mergeFactEvidence(target.fact, candidate.fact)
          target.evidence = { observationIds: target.fact.provenance.sourceObservationIds, sources: target.fact.provenance.sourceEvidence,
            ...((target.evidence.contextSources || candidate.evidence.contextSources) ? { contextSources: [...new Map([
              ...(target.evidence.contextSources ?? []), ...(candidate.evidence.contextSources ?? []),
            ].map(source => [JSON.stringify([source.workspaceId, source.observationId]), source])).values()] } : {}),
            snippets: [...new Set([...(target.evidence.snippets ?? []), ...(candidate.evidence.snippets ?? [])])],
            quotes: [...new Map([...(target.evidence.quotes ?? []), ...(candidate.evidence.quotes ?? [])].map(quote => [JSON.stringify(quote), quote])).values()] }
          delete target.decision
          merged = true
          return false
        }
      }
      existing.push(candidate)
      return true
    })
    if (fresh.length || merged) {
      await writeTextAtomic(FACT_CANDIDATES_FILE, existing.map(candidate => JSON.stringify(candidate)).join('\n') + '\n')
    }
    return fresh
  })
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

function provenanceFromCandidate(candidate: ReviewCandidate, actor: string): KnowledgeProvenance {
  if (candidate.type !== 'fact') throw new Error('Personal fact required')
  return { ...candidate.fact.provenance, actor, createdAt: new Date().toISOString() }
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

export class KnowledgeReviewService {
  async factReviewContext(input: ReviewCandidateInput) {
    if (input.type !== 'fact') throw new Error('Fact review requires a fact candidate')
    return withFactCandidatesLock(async () => {
      const candidates = await readJsonl<CandidateFact>(FACT_CANDIDATES_FILE)
      const candidate = candidates.find(item => item.id === input.id)
      if (!candidate) throw new Error('Candidate not found')
      await assertCandidateAllowed(candidate)
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
    await assertCandidateAllowed(current)
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
        before: { status: current.status, ...(current.type === 'fact' ? { content: current.fact.content } : current.type === 'wiki-patch' ? { title: current.title, markdown: current.patchMarkdown } : {}) }, after: { status: 'rejected', reviewNotes: reviewNotes ?? null }, provenance,
      })
    } catch (error) {
      records[index] = current
      await writeJsonlAtomic(relativePath, records)
      throw error
    }

    return { candidate: updated, auditEvents: [audit] }
  }

  async applyCandidate(input: ReviewCandidateInput): Promise<ReviewResult> {
    // Note: offline candidates always require explicit review — see .agents/notes/knowledge/requirements/unified-memory-laya-primary.md
    if (input.actor === 'auto-policy') throw new Error('Automatic acceptance is unavailable; explicit review is required')
    const commit = () => withMutationLock(candidateRelativePath(input.type), async () => {
      try { return await this.applyLocked(input) }
      finally { if (input.type === 'fact') await recoverPendingFactReview() }
    })
    return commit()
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
    await assertCandidateAllowed(current)

    assertReviewedSnapshot(current, input)
    if (type === 'fact' && (await readPersonalForgettingBarrier()).blocksCandidate(current as CandidateFact)) {
      throw new Error('Personal memory has been forgotten')
    }
    if ((await readObservationRevocationBarrier()).blocksCandidate(current)) throw new Error('Observation source has been revoked')
    if (current.status === 'applied') {
      return { candidate: current, auditEvents: [] }
    }
    requireProposed(current.status, id)

    const nextCandidates = records.map((record, i) => i === index ? { ...record, status: 'applied', ...(reviewNotes !== undefined ? { reviewNotes } : {}) } : record)
    const transaction = await this.applyFact(current as CandidateFact, input, nextCandidates)
    const reviewId = transaction.reviewId
    const applied = { fact: transaction.value }
    const supersededFact = transaction.superseded

    const updated = {
      ...current,
      status: 'applied' as const,
      ...(reviewNotes !== undefined ? { reviewNotes } : {}),
    }
    records[index] = updated
    await writeJsonlAtomic(relativePath, records)

    const provenance = provenanceFromCandidate(updated, input.actor ?? 'knowledge-review')
    const targetType = auditTargetType(type)
    const auditInputs: Parameters<typeof knowledgeAuditService.recordBatch>[0] = [{
      action: 'candidate_approved',
      targetType,
      targetId: id,
      before: { status: current.status, ...(current.type === 'fact' ? { content: current.fact.content } : current.type === 'wiki-patch' ? { title: current.title, markdown: current.patchMarkdown } : {}) },
      after: { status: 'applied', reviewNotes: reviewNotes ?? null,
        ...(input.replacement ? { replacementId: input.replacement.id, replacementHash: input.replacement.hash } : {}) },
      provenance,
    }]


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
      before: { status: current.status, ...(current.type === 'fact' ? { content: current.fact.content } : current.type === 'wiki-patch' ? { title: current.title, markdown: current.patchMarkdown } : {}) },
      after: {
        status: 'applied',
        appliedId:
          applied.fact.id,
      },
      provenance,
    })
    const auditEvents: AuditEvent[] = await knowledgeAuditService.recordBatch(auditInputs, reviewId)

    return { candidate: updated, auditEvents, applied }
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
    await validateFactEvidence(candidate)
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
    let fact: MemoryFact = {
      ...candidateFact,
      ...fields,
      ...(targetId ? { supersedes: targetId } : {}),
      scope: factScope(candidate.fact),
      status: 'active',
      version,
    }
    const duplicates = targetId || candidate.legacySource || candidate.personalCorrection ? [] : base.filter(item =>
      item.status === 'active' && (!item.ttl || Date.parse(item.ttl) > Date.now())
      && !barrier.blocksFact(item) && !revocations.blocksFact(item) && isExactFactDuplicate(item, fact))
    if (duplicates.length > 1) throw new Error('Multiple identical facts already exist; resolve them before merging evidence')
    const duplicate = duplicates[0]
    if (duplicate) fact = mergeFactEvidence(duplicate, fact)
    fact.confirmation = { kind: 'human-review', contentHash: reviewedFactHash(fact), confirmedAt: new Date().toISOString() }
    const next = duplicate ? base.map(item => item === duplicate ? fact : item) : [...base, fact]
    const reviewId = await prepareFactReview(next, nextCandidates)
    await writeJsonlAtomic(FACTS_FILE, next)
    return {
      value: fact,
      reviewId,
      rollback: () => restoreJsonl(FACTS_FILE, previous),
      ...(superseded ? { superseded } : {}),
    }
  }
}

export const knowledgeReviewService = new KnowledgeReviewService()
