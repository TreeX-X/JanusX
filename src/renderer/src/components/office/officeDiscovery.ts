import type { OfficeFileEntry } from '../../../../shared/office'
import type { OfficeService } from '@/services/office'

interface OfficeDiscoveryHandlers {
  initialize: (entries: OfficeFileEntry[]) => void
  reconcile: (entries: OfficeFileEntry[]) => void
  isCurrent: () => boolean
}

export function startOfficeDiscovery(
  workspaceId: string,
  service: OfficeService,
  handlers: OfficeDiscoveryHandlers,
): () => void {
  let disposed = false
  let unsubscribe: (() => void) | undefined

  const current = () => !disposed && handlers.isCurrent()

  void (async () => {
    const baseline = await service.listFiles({ workspaceId }).catch(() => null)
    if (!current() || !baseline?.ok) return
    handlers.initialize(baseline.value)

    let catchupPending = true
    let queuedEntries: OfficeFileEntry[] | null = null
    unsubscribe = service.onFilesChanged((event) => {
      if (!current() || event.workspaceId !== workspaceId) return
      if (catchupPending) {
        queuedEntries = event.entries
        return
      }
      handlers.reconcile(event.entries)
    })

    const catchup = await service.listFiles({ workspaceId }).catch(() => null)
    if (!current()) return
    if (catchup?.ok) handlers.reconcile(catchup.value)
    catchupPending = false
    if (queuedEntries) handlers.reconcile(queuedEntries)
  })()

  return () => {
    disposed = true
    unsubscribe?.()
  }
}
