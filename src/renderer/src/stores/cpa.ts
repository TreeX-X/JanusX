import { create } from 'zustand'
import type { CpaSettings } from '../../../shared/ipc/cpa'

interface CpaStore {
  settings: CpaSettings | null
  load: () => Promise<void>
  save: (settings: CpaSettings) => Promise<void>
}

export const useCpaStore = create<CpaStore>((set) => ({
  settings: null,
  load: async () => { set({ settings: await window.electron.cpa.getSettings() }) },
  save: async (settings) => { set({ settings: await window.electron.cpa.saveSettings(settings) }) },
}))
