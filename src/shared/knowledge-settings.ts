export interface KnowledgeSettings {
  enabled: boolean
}

export const DEFAULT_KNOWLEDGE_SETTINGS: KnowledgeSettings = {
  enabled: true,
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
  }
}
