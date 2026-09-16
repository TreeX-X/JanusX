/**
 * @file Harness Store — project scope, bindings, share, conflict notices
 * @description Thin state over services/harness.ts. The canvas keeps reading
 *  the Blueprint projection through stores/blueprint.ts; this store owns only
 *  the S4 additions: which repo is bound, share previews, and save conflicts.
 */
import { create } from 'zustand'
import {
  getBindings,
  projectGraph,
  rescanProject,
  resolveProject,
  setBinding,
  shareExport,
  sharePreview,
  type HarnessBinding,
  type HarnessResolveResult,
} from '@/services/harness'

interface HarnessStore {
  scope: HarnessResolveResult | null
  bindings: HarnessBinding[]
  shareJson: string | null
  shareNotes: number
  conflict: string | null
  loading: boolean
  error: string | null

  /** Resolve the current checkout: repo identity, project id, binding state. */
  resolveScope: (cwd: string) => Promise<void>
  refreshGraph: (cwd: string) => Promise<void>
  saveBinding: (cwd: string, binding: HarnessBinding) => Promise<void>
  previewShare: (cwd: string) => Promise<void>
  exportShare: (cwd: string, outPath: string) => Promise<boolean>
  noticeConflict: (message: string) => void
  dismissConflict: () => void
}

export const useHarnessStore = create<HarnessStore>((set) => ({
  scope: null,
  bindings: [],
  shareJson: null,
  shareNotes: 0,
  conflict: null,
  loading: false,
  error: null,

  resolveScope: async (cwd) => {
    set({ loading: true, error: null })
    try {
      const scope = await resolveProject(cwd)
      const bindings = scope.ok ? await getBindings(cwd) : []
      set({ scope, bindings, loading: false })
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false })
    }
  },

  refreshGraph: async (cwd) => {
    try {
      await rescanProject(cwd)
      await projectGraph(cwd)
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  saveBinding: async (cwd, binding) => {
    try {
      const bindings = await setBinding(cwd, binding)
      set({ bindings, error: null })
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  previewShare: async (cwd) => {
    try {
      const preview = await sharePreview(cwd, {})
      set({ shareJson: preview.json, shareNotes: preview.notes, error: null })
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  exportShare: async (cwd, outPath) => {
    try {
      await shareExport(cwd, {}, outPath)
      set({ error: null })
      return true
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) })
      return false
    }
  },

  noticeConflict: (message) => set({ conflict: message }),
  dismissConflict: () => set({ conflict: null }),
}))
