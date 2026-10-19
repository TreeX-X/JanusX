// Note: visible session panels pull changed provider files — see
// .agents/notes/sessions/records/external-session-backfill.md
export const EXTERNAL_SESSION_SYNC_MS = 5000

/** One request at a time; stop on unmount, pause hidden windows/panels.
 * Keep this scheduler mounted across tab switches so they do not restart it. */
export function startExternalSessionSync(
  scan: () => Promise<unknown>,
  surface: Pick<Window, 'document' | 'addEventListener' | 'removeEventListener'> = window,
  isActive: () => boolean = () => true,
): () => void {
  let disposed = false
  let running = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const run = async () => {
    if (disposed || running) return
    clearTimeout(timer)
    try {
      if (isActive() && surface.document.visibilityState !== 'hidden') {
        running = true
        await scan()
      }
    } catch {
      // A transient store/IPC failure retries on the next visible pass.
    } finally {
      running = false
      if (!disposed) timer = setTimeout(() => void run(), EXTERNAL_SESSION_SYNC_MS)
    }
  }
  const wake = () => { void run() }
  surface.addEventListener('focus', wake)
  surface.document.addEventListener('visibilitychange', wake)
  timer = setTimeout(wake, 120)
  return () => {
    disposed = true
    clearTimeout(timer)
    surface.removeEventListener('focus', wake)
    surface.document.removeEventListener('visibilitychange', wake)
  }
}
