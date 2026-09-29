export type MemoryDecisionQuestion = 'retention' | 'kind' | 'support' | 'duplicate' | 'supersede' | 'conflict'

export interface MemoryDecisionAnswer {
  question: MemoryDecisionQuestion
  answer: string | boolean
  distribution: Record<string, number>
  /** Selected-answer probability, never entropy confidence or act_probability. */
  answer_confidence: number
  /** For boolean questions this is P(true), including when the answer is false. */
  noul?: number
}

export interface MemoryScorerIdentity {
  provider: string
  modelRevision: string
  templateVersion: string
  calibrationId: string | null
}

export interface RefinementTaskStats {
  pending: number
  running: number
  succeeded: number
  cancelled: number
  failed: number
  nextRetryAt: number | null
}

export interface MemoryDecisionAnnotation {
  version: 1
  scorer: MemoryScorerIdentity
  inputHash: string
  candidateHash: string
  createdAt: string
  status: 'ready' | 'unavailable'
  route: 'review' | 'refine'
  reason: string
  answers: MemoryDecisionAnswer[]
  evidenceRanges: Array<{ observationId: string; start: number; end: number }>
  relatedFactIds: string[]
  truncated: boolean
  /** Per-window answers only. No window maximum represents whole-evidence support. */
  chunks?: Array<{ evidenceRanges: Array<{ observationId: string; start: number; end: number }>; answers: MemoryDecisionAnswer[] }>
  /** Optional on legacy advice; required before creating a durable refinement task. */
  evidenceHashes?: Record<string, string>
  contextHash?: string
}
