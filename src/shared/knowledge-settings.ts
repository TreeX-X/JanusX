/** Phase 1: deterministic pipeline always runs; this only tunes the LLM boost. */
export type KnowledgeProcessingMode = 'auto' | 'deterministic-only' | 'llm-preferred'

export interface KnowledgeSettings {
  enabled: boolean
  mode: KnowledgeProcessingMode
  /**
   * Phase 1 convergence (§4.6): auto-apply deterministic high-confidence facts
   * (derivation='deterministic', confidence>=0.9, kind='fact', source tool/checkpoint).
   * Off by default; audit actor is 'auto-policy'.
   */
  autoAcceptDeterministicFacts: boolean
}

const PROCESSING_MODES: ReadonlySet<KnowledgeProcessingMode> = new Set([
  'auto',
  'deterministic-only',
  'llm-preferred',
])

export const DEFAULT_KNOWLEDGE_SETTINGS: KnowledgeSettings = {
  enabled: true,
  mode: 'auto',
  autoAcceptDeterministicFacts: false,
}

export function normalizeKnowledgeSettings(
  input?: Partial<KnowledgeSettings> | null,
): KnowledgeSettings {
  const source = input ?? {}
  return {
    enabled:
      typeof source.enabled === 'boolean'
        ? source.enabled
        : DEFAULT_KNOWLEDGE_SETTINGS.enabled,
    mode:
      typeof source.mode === 'string' && PROCESSING_MODES.has(source.mode as KnowledgeProcessingMode)
        ? (source.mode as KnowledgeProcessingMode)
        : DEFAULT_KNOWLEDGE_SETTINGS.mode,
    autoAcceptDeterministicFacts:
      typeof source.autoAcceptDeterministicFacts === 'boolean'
        ? source.autoAcceptDeterministicFacts
        : DEFAULT_KNOWLEDGE_SETTINGS.autoAcceptDeterministicFacts,
  }
}
