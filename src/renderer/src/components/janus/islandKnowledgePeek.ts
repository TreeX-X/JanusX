import type { KnowledgeRecallTrace } from '../../../../shared/knowledge'

export const KNOWLEDGE_PEEK_TIMEOUT_MS = 4200

export type KnowledgePeekPresentation = 'hidden' | 'empty' | 'knowledge'

export interface IslandKnowledgePeekState {
  trace: KnowledgeRecallTrace | null
  presentation: KnowledgePeekPresentation
  version: number
}

export const EMPTY_ISLAND_KNOWLEDGE_PEEK: IslandKnowledgePeekState = {
  trace: null,
  presentation: 'hidden',
  version: 0,
}

export function isEligibleKnowledgeTrace(trace: KnowledgeRecallTrace | null): trace is KnowledgeRecallTrace {
  return trace?.status === 'recalled' && trace.recalledCount > 0 && !!trace.topHit
}

export function receiveKnowledgeTrace(
  state: IslandKnowledgePeekState,
  trace: KnowledgeRecallTrace | null,
  stage: 'collapsed' | 'peek' | 'expanded',
): IslandKnowledgePeekState {
  if (!trace || !isEligibleKnowledgeTrace(trace) || trace.requestId === state.trace?.requestId) return state
  return {
    trace,
    presentation: stage === 'collapsed' || (stage === 'peek' && state.presentation !== 'hidden')
      ? 'knowledge'
      : 'hidden',
    version: state.version + 1,
  }
}

export function replayKnowledgePeek(
  state: IslandKnowledgePeekState,
  stage: 'collapsed' | 'peek' | 'expanded',
): IslandKnowledgePeekState {
  if (stage !== 'collapsed') return state
  return {
    ...state,
    presentation: isEligibleKnowledgeTrace(state.trace) ? 'knowledge' : 'empty',
    version: state.version + 1,
  }
}

export function dismissKnowledgePeek(
  state: IslandKnowledgePeekState,
  version: number,
  stage: 'collapsed' | 'peek' | 'expanded',
): IslandKnowledgePeekState {
  if (version !== state.version || stage !== 'peek') return state
  return { ...state, presentation: 'hidden' }
}

export function hideKnowledgePeek(state: IslandKnowledgePeekState): IslandKnowledgePeekState {
  if (state.presentation === 'hidden') return state
  return { ...state, presentation: 'hidden', version: state.version + 1 }
}

export function invalidateKnowledgePeek(state: IslandKnowledgePeekState): IslandKnowledgePeekState {
  return { ...EMPTY_ISLAND_KNOWLEDGE_PEEK, version: state.version + 1 }
}

export function formatKnowledgeMatch(score: number): string {
  if (!Number.isFinite(score)) return 'MATCHED'
  if (score >= 0.75) return 'STRONG MATCH'
  if (score >= 0.45) return 'GOOD MATCH'
  return 'RELATED'
}
