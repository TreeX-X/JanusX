// Note: independent memory controls preserve domain ownership — see .agents/notes/knowledge/memory-domain-controls.md
export interface PersonalMemorySettings {
  captureConversations: boolean
  inferEngineeringHabits: boolean
  useInChat: boolean
  episodeTtlDays: number
}

export const DEFAULT_PERSONAL_MEMORY_SETTINGS: PersonalMemorySettings = {
  captureConversations: true,
  inferEngineeringHabits: false,
  useInChat: true,
  episodeTtlDays: 60,
}

export function normalizePersonalMemorySettings(input?: Partial<PersonalMemorySettings> | null): PersonalMemorySettings {
  const value = input ?? {}
  return {
    captureConversations: typeof value.captureConversations === 'boolean' ? value.captureConversations : true,
    inferEngineeringHabits: value.inferEngineeringHabits === true,
    useInChat: typeof value.useInChat === 'boolean' ? value.useInChat : true,
    episodeTtlDays: Number.isFinite(value.episodeTtlDays)
      ? Math.max(30, Math.min(90, Math.trunc(value.episodeTtlDays!))) : 60,
  }
}
