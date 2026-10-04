import { create } from 'zustand'

// Note: one assistant entry preserves independent domains — see .agents/notes/2026-10-04-assistant-persona-layout--6e9c114d.md
export type AssistantSection = 'engineering' | 'personal' | 'review'
export const useAssistantStore = create<{
  section: AssistantSection
  workbenchDomain: 'engineering' | 'personal'
  setSection: (section: AssistantSection) => void
  setWorkbenchDomain: (workbenchDomain: 'engineering' | 'personal') => void
}>(set => ({
  section: 'engineering', workbenchDomain: 'engineering',
  setSection: section => set({ section }),
  setWorkbenchDomain: workbenchDomain => set({ workbenchDomain }),
}))
