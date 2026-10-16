import { create } from 'zustand'
import type { CpaSettings, CpaStatus } from '../../../shared/ipc/cpa'

interface CpaStore {
  settings: CpaSettings | null
  status: CpaStatus | null
  shouldOpen: boolean
  revision: number
  load: () => Promise<void>
  save: (settings: CpaSettings) => Promise<void>
  refreshStatus: () => Promise<void>
  operate: (action: 'start' | 'stop' | 'restart' | 'update') => Promise<void>
}

export const useCpaStore = create<CpaStore>((set) => ({
  settings: null,
  status: null,
  shouldOpen: true,
  revision: 0,
  load: async () => { set({ settings: await window.electron.cpa.getSettings() }) },
  save: async (settings) => {
    try { set({ settings: await window.electron.cpa.saveSettings(settings), shouldOpen: true }) }
    catch (error) {
      // The configuration may have persisted before a download or restart failed.
      set({ settings: await window.electron.cpa.getSettings() })
      throw error
    }
  },
  refreshStatus: async () => { set({ status: await window.electron.cpa.status() }) },
  operate: async (action) => {
    if (action === 'stop') set({ shouldOpen: false })
    await window.electron.cpa[action]()
    set((state) => ({ shouldOpen: action !== 'stop', revision: state.revision + 1 }))
    set({ status: await window.electron.cpa.status() })
  },
}))
