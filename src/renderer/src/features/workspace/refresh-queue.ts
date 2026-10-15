// Note: .agents/notes/workbench/file-tree-reveal-race.md
/** One active refresh and one merged trailing refresh, regardless of event volume. */
export function createWorkspaceRefreshQueue(
  refresh: (root: string, changedPath: string | null) => Promise<unknown>,
): { enqueue: (root: string, changedPath: string | null) => void; dispose: () => void } {
  let pending: { root: string; changedPath: string | null } | null = null
  let running = false
  let disposed = false
  const drain = async () => {
    running = true
    try {
      while (pending && !disposed) {
        const next = pending
        pending = null
        try { await refresh(next.root, next.changedPath) } catch { /* Next change retries. */ }
      }
    } finally { running = false }
  }
  return {
    enqueue(root, changedPath) {
      if (disposed) return
      // Multiple changed files require revalidating all open editors.
      if (pending?.root === root && pending.changedPath !== changedPath) changedPath = null
      pending = { root, changedPath }
      if (!running) void drain()
    },
    dispose() { disposed = true; pending = null },
  }
}
