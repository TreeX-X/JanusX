// Note: scorer advice never grants truth or source authority — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import { createHash } from 'node:crypto'
import type { CandidateFact, FactKind, MemoryScope, MemorySourceEvidence } from '../../shared/knowledge'
import type { MemoryDecisionAnnotation, MemoryDecisionAnswer, MemoryScorerIdentity } from '../../shared/memory-decision'

export const DECISION_TEMPLATE_VERSION = 'memory-decision/1'
const KINDS = ['fact', 'decision', 'preference', 'procedure'] as const
const QUESTIONS = ['retention', 'kind', 'support', 'duplicate', 'supersede', 'conflict'] as const

export interface MemoryDecisionInput {
  candidateId: string
  candidateHash: string
  scope: MemoryScope
  workspaceId: string
  content: string
  kind?: FactKind
  evidence: Array<{ observationId: string; start: number; end: number; text: string; source: MemorySourceEvidence }>
  relatedFacts: Array<{ id: string; version: number; content: string }>
  truncated: boolean
}

export interface DecisionScorer {
  readonly identity: MemoryScorerIdentity
  score(input: MemoryDecisionInput, signal: AbortSignal): Promise<unknown>
}

export class NoopScorer implements DecisionScorer {
  readonly identity: MemoryScorerIdentity = {
    provider: 'noop', modelRevision: 'none', templateVersion: DECISION_TEMPLATE_VERSION, calibrationId: null,
  }
  async score(): Promise<unknown> { return { status: 'unavailable', reason: 'not-configured' } }
}

export function candidateDecisionHash(candidate: CandidateFact): string {
  return createHash('sha256').update(JSON.stringify([
    candidate.id, candidate.fact, candidate.evidence, candidate.conflicts ?? [], candidate.derivation,
  ])).digest('hex')
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function probability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

function parseAnswers(value: unknown): MemoryDecisionAnswer[] | null {
  if (!Array.isArray(value) || value.length !== QUESTIONS.length) return null
  const answers: MemoryDecisionAnswer[] = []
  for (const question of QUESTIONS) {
    const matches = value.filter((answer: unknown) => record(answer) && answer.question === question)
    if (matches.length !== 1) return null
    const raw: unknown = matches[0]
    if (!record(raw) || !record(raw.distribution) || !probability(raw.answer_confidence)) return null
    const rawDistribution = raw.distribution
    const options: readonly string[] = question === 'kind' ? KINDS : ['true', 'false']
    if (Object.keys(rawDistribution).length !== options.length
      || !options.every((option) => probability(rawDistribution[option]))) return null
    if (question === 'kind' ? typeof raw.answer !== 'string' || !options.includes(raw.answer) : typeof raw.answer !== 'boolean') return null
    const distribution = Object.fromEntries(options.map((option) => [option, rawDistribution[option] as number]))
    const selected = distribution[String(raw.answer)]!
    if (Math.abs(Object.values(distribution).reduce((sum, p) => sum + p, 0) - 1) > 1e-6
      || Math.abs(selected - raw.answer_confidence) > 1e-6
      || selected + 1e-6 < Math.max(...Object.values(distribution))) return null
    if (question !== 'kind' && (!probability(raw.noul) || Math.abs(raw.noul - distribution.true!) > 1e-6)) return null
    answers.push({ question, answer: raw.answer as string | boolean, distribution,
      answer_confidence: selected, ...(question !== 'kind' ? { noul: distribution.true! } : {}) })
  }
  return answers
}

/** A bounded, fail-closed adapter; malformed or unavailable scoring never invokes LLM. */
export async function scoreMemoryDecision(
  input: MemoryDecisionInput,
  scorer: DecisionScorer = new NoopScorer(),
  timeoutMs = 2000,
): Promise<MemoryDecisionAnnotation> {
  const identity = { ...scorer.identity }
  const annotation: MemoryDecisionAnnotation = {
    version: 1, scorer: identity,
    inputHash: createHash('sha256').update(JSON.stringify([identity, input])).digest('hex'),
    candidateHash: input.candidateHash, createdAt: new Date().toISOString(),
    status: 'unavailable', route: 'review', reason: 'not-configured', answers: [],
    evidenceRanges: input.evidence.map(({ observationId, start, end }) => ({ observationId, start, end })),
    relatedFactIds: input.relatedFacts.map((fact) => fact.id), truncated: input.truncated,
  }
  if (!input.evidence.length) return { ...annotation, reason: 'missing-evidence' }
  if (input.truncated) return { ...annotation, reason: 'incomplete-context' }
  if (identity.templateVersion !== DECISION_TEMPLATE_VERSION) return { ...annotation, reason: 'template-mismatch' }
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const raw = await Promise.race([
      Promise.resolve().then(() => scorer.score(structuredClone(input), controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('scorer-timeout')) }, timeoutMs)
      }),
    ])
    if (!record(raw)) return { ...annotation, reason: 'invalid-output' }
    if (raw.status === 'unavailable') return { ...annotation, reason: 'scorer-unavailable' }
    const answers = parseAnswers(raw.answers)
    if (raw.status !== 'ready' || !answers || identity.provider === 'noop') return { ...annotation, reason: 'invalid-output' }
    const expected: Record<string, string | boolean> = {
      retention: true, kind: input.kind ?? 'fact', support: true, duplicate: false, supersede: false, conflict: false,
    }
    const needsRefinement = answers.some((answer) => answer.answer_confidence < 0.9 || answer.answer !== expected[answer.question])
    return { ...annotation, status: 'ready', answers, route: needsRefinement ? 'refine' : 'review',
      reason: needsRefinement ? 'needs-refinement' : 'consistent-review' }
  } catch {
    return { ...annotation, reason: controller.signal.aborted ? 'scorer-timeout' : 'scorer-error' }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
