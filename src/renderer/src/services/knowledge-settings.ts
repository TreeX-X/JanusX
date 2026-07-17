import type { KnowledgeSettings } from '../../../shared/knowledge-settings'

export type { KnowledgeSettings }

export async function getKnowledgeSettings(): Promise<KnowledgeSettings> {
  return window.electron.knowledge.getSettings()
}

export async function updateKnowledgeSettings(
  settings: Partial<KnowledgeSettings>,
): Promise<KnowledgeSettings> {
  return window.electron.knowledge.updateSettings(settings)
}
