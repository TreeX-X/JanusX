// Note: one source-event subscription coordinates workspace consumers — see .agents/notes/blueprint/navigation/note-updates-and-suggestion-navigation.md
import { onHarnessChanged } from './harness'

type Change = Parameters<Parameters<typeof onHarnessChanged>[0]>[0]
const listeners = new Set<(event: Change) => void>()
const changes = new Map<string, Change>()
let unsubscribe: (() => void) | undefined
let scheduled = false

export function onBlueprintSourcesChanged(listener: (event: Change) => void): () => void {
  listeners.add(listener)
  if (!unsubscribe && typeof window.electron?.harness?.onChanged === 'function') unsubscribe = onHarnessChanged(event => {
    if (event.error) { for (const notify of listeners) notify(event); return }
    const key = event.root.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase(), previous = changes.get(key)
    changes.set(key, { ...event, external: Boolean(event.external || previous?.external), kinds: [...new Set([...(previous?.kinds ?? []), ...(event.kinds ?? [])])] })
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      const pending = [...changes.values()]; changes.clear()
      for (const change of pending) for (const notify of listeners) notify(change)
    })
  })
  return () => {
    listeners.delete(listener)
    if (!listeners.size) { unsubscribe?.(); unsubscribe = undefined; changes.clear() }
  }
}
