import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type {
  CandidateFact,
  CandidateGraphEdge,
  KnowledgeConflict,
  KnowledgeFeedbackInput,
  KnowledgeFeedbackSummary,
  KnowledgeProvenance,
  MemoryFact,
  GraphEdge,
} from '../../shared/knowledge'
import { knowledgeRootPath } from './constants'
import { knowledgeAuditService } from './audit-service'

export type TruthKind = 'fact' | 'graph' | 'wiki'
export interface RevokeTruthInput { kind: TruthKind; id: string; workspaceId: string }

const paths = {
  fact: join('facts', 'facts.jsonl'),
  graph: join('graph', 'edges.jsonl'),
  factCandidates: join('facts', 'candidates.jsonl'),
  graphCandidates: join('graph', 'candidates.jsonl'),
  feedback: join('metrics', 'feedback.jsonl'),
  wikiIndex: join('wiki', 'pages-index.json'),
}
const MAX_FEEDBACK_EVENTS = 1000
let operationQueue = Promise.resolve()

async function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const previous = operationQueue
  let release!: () => void
  operationQueue = new Promise<void>((resolve) => { release = resolve })
  await previous
  try { return await operation() } finally { release() }
}

function absolute(path: string): string { return join(knowledgeRootPath(), path) }

async function readJsonl<T>(path: string): Promise<T[]> {
  try {
    return (await readFile(absolute(path), 'utf8')).split('\n').filter(Boolean).flatMap((line) => {
      try { return [JSON.parse(line) as T] } catch { return [] }
    })
  } catch { return [] }
}

async function writeJsonl(path: string, records: unknown[]): Promise<void> {
  const file = absolute(path)
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temp, records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : ''), 'utf8')
  await rename(temp, file)
}

function provenanceForFact(fact: MemoryFact): KnowledgeProvenance { return fact.provenance }
function provenanceForEdge(edge: GraphEdge): KnowledgeProvenance {
  return {
    workspaceId: edge.workspaceId, workspaceName: edge.workspaceId, workspacePath: '',
    source: 'system', sourceObservationIds: [], fileRefs: [], actor: 'knowledge-operations',
    createdAt: new Date().toISOString(),
  }
}

export class KnowledgeOperationsService {
  async revoke(input: RevokeTruthInput): Promise<void> {
    return serialized(() => this.revokeLocked(input))
  }

  private async revokeLocked(input: RevokeTruthInput): Promise<void> {
    if (input.kind === 'wiki') {
      let index: { version: 1; pages: Array<{ slug: string; status: string; workspaceId: string }> }
      try { index = JSON.parse(await readFile(absolute(paths.wikiIndex), 'utf8')) } catch { throw new Error(`Truth not found: wiki:${input.id}`) }
      const page = index.pages.find((item) => item.slug === input.id)
      if (!page) throw new Error(`Truth not found: wiki:${input.id}`)
      if (page.workspaceId !== input.workspaceId) throw new Error('Truth workspace mismatch')
      if (page.status === 'archived') return
      page.status = 'archived'
      const file = absolute(paths.wikiIndex)
      const temp = `${file}.tmp-${process.pid}-${Date.now()}`
      await writeFile(temp, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
      await rename(temp, file)
      try {
        await knowledgeAuditService.record({ action: 'truth_revoked', targetType: 'wiki', targetId: input.id, before: { status: 'published' }, after: { status: 'archived' }, provenance: { workspaceId: input.workspaceId, workspaceName: input.workspaceId, workspacePath: '', source: 'system', sourceObservationIds: [], fileRefs: [], actor: 'knowledge-operations', createdAt: new Date().toISOString() } })
      } catch (error) {
        page.status = 'published'
        await writeFile(temp, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
        await rename(temp, file)
        throw error
      }
      return
    }
    const path = paths[input.kind]
    const records = await readJsonl<MemoryFact | GraphEdge>(path)
    const index = records.findIndex((record) => record.id === input.id)
    if (index < 0) throw new Error(`Truth not found: ${input.kind}:${input.id}`)
    const current = records[index]!
    const currentWorkspaceId = input.kind === 'fact'
      ? (current as MemoryFact).provenance.workspaceId
      : (current as GraphEdge).workspaceId
    if (currentWorkspaceId !== input.workspaceId) {
      throw new Error('Truth workspace mismatch')
    }
    if (current.status === 'archived') return
    const updated = { ...current, status: 'archived' as const }
    records[index] = updated
    await writeJsonl(path, records)
    try { await knowledgeAuditService.record({
      action: 'truth_revoked', targetType: input.kind, targetId: input.id,
      before: { status: current.status ?? 'active' }, after: { status: 'archived' },
      provenance: input.kind === 'fact' ? provenanceForFact(updated as MemoryFact) : provenanceForEdge(updated as GraphEdge),
    }) } catch (error) {
      records[index] = current
      await writeJsonl(path, records)
      throw error
    }
  }

  async listConflicts(workspaceId: string): Promise<KnowledgeConflict[]> {
    const [facts, factCandidates, edges, edgeCandidates] = await Promise.all([
      readJsonl<MemoryFact>(paths.fact), readJsonl<CandidateFact>(paths.factCandidates),
      readJsonl<GraphEdge>(paths.graph), readJsonl<CandidateGraphEdge>(paths.graphCandidates),
    ])
    const conflicts: KnowledgeConflict[] = []
    for (const candidate of factCandidates.filter((item) => item.status === 'proposed' && item.fact.provenance.workspaceId === workspaceId)) {
      const truth = facts.find((item) => item.id === candidate.fact.id && item.status !== 'archived')
      if (truth && truth.content !== candidate.fact.content) conflicts.push({
        id: `fact:${candidate.id}:${truth.id}`, workspaceId, kind: 'fact', targetId: truth.id,
        candidateId: candidate.id, reason: 'content-mismatch', provenance: candidate.fact.provenance,
      })
    }
    for (const candidate of edgeCandidates.filter((item) => item.status === 'proposed' && item.edge.workspaceId === workspaceId)) {
      const truth = edges.find((item) => item.id === candidate.edge.id && item.status !== 'archived')
      if (truth) conflicts.push({
        id: `graph:${candidate.id}:${truth.id}`, workspaceId, kind: 'graph', targetId: truth.id,
        candidateId: candidate.id, reason: 'duplicate-id', provenance: provenanceForEdge(candidate.edge),
      })
    }
    return conflicts
  }

  async recordFeedback(input: KnowledgeFeedbackInput): Promise<void> {
    return serialized(() => this.recordFeedbackLocked(input))
  }

  private async recordFeedbackLocked(input: KnowledgeFeedbackInput): Promise<void> {
    if (!input.workspaceId.trim()) throw new Error('Feedback workspaceId is required')
    const records = await readJsonl<KnowledgeFeedbackInput & { createdAt: string }>(paths.feedback)
    const event = { ...input, createdAt: new Date().toISOString() }
    await writeJsonl(paths.feedback, [...records, event].slice(-MAX_FEEDBACK_EVENTS))
    try { await knowledgeAuditService.record({
      action: 'knowledge_feedback', targetType: 'index', targetId: `${input.resultKind}:${input.action}`,
      after: { action: input.action, resultKind: input.resultKind, outcome: input.outcome },
      provenance: { workspaceId: input.workspaceId, workspaceName: input.workspaceId, workspacePath: '', source: 'system', sourceObservationIds: [], fileRefs: [], actor: 'knowledge-feedback', createdAt: event.createdAt },
    }) } catch (error) {
      await writeJsonl(paths.feedback, records)
      throw error
    }
  }

  async feedbackSummary(workspaceId?: string): Promise<KnowledgeFeedbackSummary> {
    return serialized(() => this.feedbackSummaryLocked(workspaceId))
  }

  private async feedbackSummaryLocked(workspaceId?: string): Promise<KnowledgeFeedbackSummary> {
    const records = await readJsonl<KnowledgeFeedbackInput & { createdAt: string }>(paths.feedback)
    const summary: KnowledgeFeedbackSummary = {
      total: 0,
      byAction: { open: 0, copy: 0, apply: 0, reject: 0, dismiss: 0 },
      byOutcome: { success: 0, empty: 0, error: 0 },
      byKind: { fact: 0, wiki: 0, graph: 0, none: 0 },
    }
    for (const event of records) {
      if (workspaceId && event.workspaceId !== workspaceId) continue
      if (!(event.action in summary.byAction) || !(event.outcome in summary.byOutcome) || !(event.resultKind in summary.byKind)) continue
      summary.total++
      summary.byAction[event.action]++
      summary.byOutcome[event.outcome]++
      summary.byKind[event.resultKind]++
    }
    return summary
  }
}

export const knowledgeOperationsService = new KnowledgeOperationsService()
