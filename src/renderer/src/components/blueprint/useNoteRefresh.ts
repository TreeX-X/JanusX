import { useEffect } from 'react'
import { getIndexRev, onHarnessChanged } from '@/services/harness'
import { useBlueprintStore } from '@/stores/blueprint'

// Note: refresh is owned by the mounted view — see .agents/notes/2026-09-25-note-blueprint-r2-read--fa17e06b.md
export function useNoteRefresh(blueprintId: string | undefined, root: string | undefined): void {
  useEffect(() => {
    if (!blueprintId || !root) return
    return subscribeNoteRefresh(blueprintId, root)
  }, [blueprintId, root])
}

const key = (path: string): string => path.replaceAll('\\', '/').replace(/[/]$/, '').toLowerCase()

/** Last watcher-reported rev per checkout root; feeds the focus short-circuit. */
const lastRevByRoot = new Map<string, number>()

function displayedRevs(blueprintId: string, root: string): Array<{ path: string; real: string; rev: number }> | null {
  const active = useBlueprintStore.getState().currentBlueprint
  if (!active || active.id !== blueprintId) return null
  const rows: Array<{ path: string; real: string; rev: number }> = [{ path: key(root), real: root, rev: active.contentRevision }]
  for (const row of active.composition?.checkouts ?? []) {
    if (row.path && typeof row.revision === 'number') rows.push({ path: key(row.path), real: row.path, rev: row.revision })
  }
  return rows
}

export function subscribeNoteRefresh(blueprintId: string, root: string): () => void {
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
      lastRevByRoot.set(key(event.root), event.rev)
      const active = useBlueprintStore.getState().currentBlueprint
      const dependency = active?.id === blueprintId && active.composition?.checkouts.some(row => key(row.path) === key(event.root))
      if (key(event.root) !== key(root) && !dependency) return
      if (event.error) { useBlueprintStore.setState({ error: event.error, loadState: 'error' }); return }
      // Note: same-rev heartbeats carry no file changes — skipping the reload
      // turns focus returns and unrelated writes into no-ops instead of full
      // projection rebuilds. Any listed kind, or a trigger outside the notes
      // corpus (receipts, bindings, identity, HEAD), still reloads.
      if (!event.external && (event.kinds?.length ?? 0) === 0) {
        const want = displayedRevs(blueprintId, root)?.find((row) => row.path === key(event.root))?.rev
        if (want !== undefined && want === event.rev) return
      }
      schedule()
    })
    // Focus returns reload only when a tracked rev moved under us; untracked
    // roots fail open to a cheap rev check, and only a real mismatch reloads.
    // Nothing here parses notes: getRev is a cache lookup in the main process.
    const onFocus = (): void => {
      const rows = displayedRevs(blueprintId, root)
      if (!rows) return
      const unknown: Array<{ path: string; real: string; rev: number }> = []
      for (const row of rows) {
        const seen = lastRevByRoot.get(row.path)
        if (seen === undefined) unknown.push(row)
        else if (seen !== row.rev) { schedule(); return }
      }
      if (unknown.length === 0) return
      void (async () => {
        for (const { path, real, rev } of unknown) {
          try {
            const current = await getIndexRev(real)
            lastRevByRoot.set(path, current)
            if (current !== rev) { schedule(); return }
          } catch {
            schedule(); return
          }
        }
      })()
    }
    window.addEventListener('focus', onFocus)
    return () => { disposed = true; off(); if (timer) clearTimeout(timer); window.removeEventListener('focus', onFocus) }
}
