import type { KnowledgeProcessingStats } from '../../../../shared/ipc/knowledge'

/**
 * Status-bar tone derivation for the knowledge pipeline (§6 metrics).
 * Pure and unit-tested; the component only formats text around it.
 */
export type ProcessingTone = 'idle' | 'working' | 'attention' | 'offline'

export function processingTone(stats: KnowledgeProcessingStats | null): ProcessingTone {
  if (!stats) return 'offline'
  if (!stats.handlerConfigured) return 'attention'
  if (stats.failures > 0) return 'attention'
  if (stats.llmConfigured && stats.llmFailed > 0) return 'attention'
  if (stats.pendingTotal > 0) return 'working'
  return 'idle'
}
