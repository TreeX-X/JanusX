// Note: queue scoring filters evidence before refinement — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import type { CandidateFact, MemoryFact, Observation } from '../../shared/knowledge'
import type { MemoryDecisionAnnotation } from '../../shared/memory-decision'
import type { DeterministicBatch } from './processing-queue'
import { candidateDecisionHash, NoopScorer, scoreMemoryDecision, type DecisionScorer, type MemoryDecisionInput } from './decision-scorer'
import { factScope, isActiveObservation, isUserStatement, observationScope, sourceEvidence } from './memory-evidence'
import { knowledgeExtractService } from './extract-service'
import { knowledgeObservationService } from './observation-service'
import { knowledgeTruthService } from './truth-service'
import { annotateFactDecisions } from './review-service'
import { Bm25Index } from './search/bm25'

const MAX_CANDIDATES = 20
const MAX_RELATED_CORPUS = 200
const MAX_EVIDENCE_RECORDS = 8
const MAX_EVIDENCE_CHARS = 12000
export const REFINEMENT_CHAR_BUDGET = 60000
export const REFINEMENT_OBSERVATION_CHARS = 6000

export interface RefinementPlan {
  observations: Observation[]
  candidateHashes: Record<string, string>
}

export interface DecisionStageDeps {
  listCandidates(): Promise<CandidateFact[]>
  listObservations(): Promise<Observation[]>
  listTruth(): Promise<MemoryFact[]>
  resolveContent(observation: Observation): Promise<string>
  annotate(updates: Map<string, MemoryDecisionAnnotation>): Promise<string[]>
}

function defaultDeps(): DecisionStageDeps {
  return {
    listCandidates: () => knowledgeExtractService.listFactCandidates(),
    listObservations: () => knowledgeObservationService.listAll(),
    listTruth: async () => (await knowledgeTruthService.list()).facts,
    resolveContent: (observation) => knowledgeObservationService.resolveContent(observation),
    annotate: annotateFactDecisions,
  }
}

export class MemoryDecisionStage {
  private scorer: DecisionScorer = new NoopScorer()
  constructor(private readonly deps: DecisionStageDeps = defaultDeps()) {}

  /** Host composition only; model output and IPC input cannot select the scorer. */
  configureScorer(scorer: DecisionScorer | null): void { this.scorer = scorer ?? new NoopScorer() }

  async run(batch: DeterministicBatch): Promise<RefinementPlan> {
    const batchIds = new Set(batch.observations.map((observation) => observation.id))
    const candidates = (await this.deps.listCandidates()).filter((candidate) => candidate.status === 'proposed'
      && candidate.derivation === 'deterministic'
      && candidate.evidence.observationIds.some((id) => batchIds.has(id)))
      .sort((left, right) => left.id.localeCompare(right.id)).slice(0, MAX_CANDIDATES)
    if (!candidates.length) return { observations: [], candidateHashes: {} }
    const [observations, truths] = await Promise.all([this.deps.listObservations(), this.deps.listTruth()])
    const byId = new Map(observations.map((observation) => [observation.id, observation]))
    const updates = new Map<string, MemoryDecisionAnnotation>()
    const scoredInputs = new Map<string, MemoryDecisionInput>()
    const domainSnapshots = new Map<string, string>()
    const refinementInputs = new Map<string, Observation[]>()
    const scorer = this.scorer
    for (const candidate of candidates) {
      const scope = factScope(candidate.fact)
      const owner = candidate.fact.provenance.workspaceId
      const evidenceIds = [...new Set(candidate.evidence.observationIds)]
      const input: MemoryDecisionInput = {
        candidateId: candidate.id, candidateHash: candidateDecisionHash(candidate), scope, workspaceId: owner,
        content: candidate.fact.content.slice(0, 6000), kind: candidate.fact.kind, evidence: [], relatedFacts: [],
        truncated: candidate.fact.content.length > 6000 || evidenceIds.length > MAX_EVIDENCE_RECORDS,
      }
      let evidenceChars = 0
      const eligible: Observation[] = []
      let explicitRemember = false
      for (const id of evidenceIds.slice(0, MAX_EVIDENCE_RECORDS)) {
        const observation = byId.get(id)
        const sameOwner = observation && observationScope(observation) === scope && observation.workspaceId === owner
        if (!observation || !isActiveObservation(observation)
          || (scope === 'user' ? !sameOwner && !isUserStatement(observation) : !sameOwner)) {
          input.truncated = true
          continue
        }
        explicitRemember ||= observation.memoryIntent === 'remember'
        let text: string
        try { text = await this.deps.resolveContent(observation) } catch { input.truncated = true; continue }
        const excerpt = text.slice(0, Math.min(REFINEMENT_OBSERVATION_CHARS, MAX_EVIDENCE_CHARS - evidenceChars))
        input.truncated ||= excerpt.length !== text.length
        evidenceChars += excerpt.length
        input.evidence.push({ observationId: id, start: 0, end: excerpt.length, text: excerpt, source: sourceEvidence(observation) })
        if (sameOwner && observation.memoryIntent !== 'remember'
          && (scope !== 'user' || isUserStatement(observation))) eligible.push({ ...observation, content: text })
      }
      const sameDomain = truths.filter((fact) => fact.status === 'active' && factScope(fact) === scope
        && fact.provenance.workspaceId === owner && (!fact.ttl || Date.parse(fact.ttl) > Date.now()))
      domainSnapshots.set(candidate.id, JSON.stringify(sameDomain))
      input.truncated ||= sameDomain.length > MAX_RELATED_CORPUS
      const corpus = sameDomain.slice(0, MAX_RELATED_CORPUS)
      const relatedIds = new Bm25Index(corpus.map((fact) => ({ id: fact.id, text: fact.content })))
        .search(input.content).slice(0, 5).map((hit) => hit.id)
      input.relatedFacts = corpus.filter((fact) => relatedIds.includes(fact.id)).map((fact) => {
        input.truncated ||= fact.content.length > 2000
        return { id: fact.id, version: fact.version, content: fact.content.slice(0, 2000) }
      })
      const annotation = await scoreMemoryDecision(input, scorer)
      if (explicitRemember || eligible.length !== evidenceIds.length || owner !== batch.workspaceId) {
        annotation.route = 'review'
        annotation.reason = explicitRemember ? 'explicit-memory-review' : 'evidence-review'
      }
      updates.set(candidate.id, annotation)
      scoredInputs.set(candidate.id, input)
      if (annotation.route === 'refine') refinementInputs.set(candidate.id, eligible)
    }
    // Scoring is asynchronous: do not act on evidence or truth invalidated while it ran.
    const [currentObservations, currentTruths] = await Promise.all([this.deps.listObservations(), this.deps.listTruth()])
    const currentById = new Map(currentObservations.map((observation) => [observation.id, observation]))
    for (const [id, annotation] of updates) {
      if (annotation.status !== 'ready') continue
      const input = scoredInputs.get(id)!
      let changed = scorer !== this.scorer || JSON.stringify(annotation.scorer) !== JSON.stringify(this.scorer.identity)
      for (const evidence of input.evidence) {
        const current = currentById.get(evidence.observationId)
        if (!current || !isActiveObservation(current) || JSON.stringify(sourceEvidence(current)) !== JSON.stringify(evidence.source)) {
          changed = true
          break
        }
        try { changed ||= await this.deps.resolveContent(current) !== evidence.text } catch { changed = true }
      }
      const currentDomain = currentTruths.filter((fact) => fact.status === 'active' && factScope(fact) === input.scope
        && fact.provenance.workspaceId === input.workspaceId && (!fact.ttl || Date.parse(fact.ttl) > Date.now()))
      changed ||= JSON.stringify(currentDomain) !== domainSnapshots.get(id)
      if (changed) {
        annotation.status = 'unavailable'
        annotation.route = 'review'
        annotation.reason = 'context-changed'
        refinementInputs.delete(id)
      }
    }
    const attached = new Set(await this.deps.annotate(updates))
    const selected = new Map<string, Observation>()
    const candidateHashes: Record<string, string> = {}
    let remaining = REFINEMENT_CHAR_BUDGET
    for (const [id, records] of refinementInputs) {
      if (!attached.has(id)) continue
      const fresh = records.filter((record) => !selected.has(record.id))
      const cost = fresh.reduce((sum, record) => sum + record.content.length, 0)
      if (cost > remaining) continue
      for (const record of fresh) selected.set(record.id, record)
      candidateHashes[id] = updates.get(id)!.candidateHash
      remaining -= cost
    }
    return { observations: [...selected.values()], candidateHashes }
  }
}

export const knowledgeDecisionStage = new MemoryDecisionStage()
