import type { KnowledgeSettings } from '../../../shared/knowledge-settings'

export type { KnowledgeSettings }

export async function getKnowledgeSettings(): Promise<KnowledgeSettings> {
  return window.electron.invoke('settings:knowledge:get') as Promise<KnowledgeSettings>
}

export async function updateKnowledgeSettings(
  settings: Partial<KnowledgeSettings>,
): Promise<KnowledgeSettings> {
  return window.electron.invoke(
    'settings:knowledge:update',
    settings,
  ) as Promise<KnowledgeSettings>
}
