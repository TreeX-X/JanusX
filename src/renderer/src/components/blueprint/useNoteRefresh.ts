import { useEffect } from 'react'
import { onHarnessChanged } from '@/services/harness'
import { useBlueprintStore } from '@/stores/blueprint'

// Note: refresh is owned by the mounted view — see .agents/notes/2026-09-25-note-blueprint-r2-read--fa17e06b.md
export function useNoteRefresh(blueprintId: string | undefined, root: string | undefined): void {
  useEffect(() => {
    if (!blueprintId || !root) return
    return subscribeNoteRefresh(blueprintId, root)
  }, [blueprintId, root])
}

export function subscribeNoteRefresh(blueprintId: string, root: string): () => void {
    const key = (path: string): string => path.replaceAll('\\', '/').replace(/[/]$/, '').toLowerCase()
    let timer: ReturnType<typeof setTimeout> | undefined
    let disposed = false
    let pending = false
    let running = false
    const refresh = async (): Promise<void> => {
      pending = true
      if (running) return
      running = true
      try {
        while (pending && !disposed) {
          pending = false
          const state = useBlueprintStore.getState()
          if (state.currentBlueprint?.id !== blueprintId) break
          const alreadyLoading = state.loadingBlueprintId === blueprintId
          await state.loadBlueprint(blueprintId)
          if (alreadyLoading) pending = true
        }
      } catch (error) {
        if (!disposed) useBlueprintStore.setState({ error: error instanceof Error ? error.message : String(error), loadState: 'error' })
      } finally { running = false }
    }
    const schedule = (): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { void refresh() }, 150)
    }
    const off = onHarnessChanged((event) => {
      if (key(event.root) !== key(root)) return
      if (event.error) { useBlueprintStore.setState({ error: event.error, loadState: 'error' }); return }
      schedule()
    })
    window.addEventListener('focus', schedule)
    return () => { disposed = true; off(); if (timer) clearTimeout(timer); window.removeEventListener('focus', schedule) }
}
