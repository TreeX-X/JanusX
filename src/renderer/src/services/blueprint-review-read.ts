// Note: list refreshes have a bounded wait — see .agents/notes/blueprint/navigation/note-updates-and-suggestion-navigation.md
import i18n from '@/i18n'

export const REVIEW_READ_TIMEOUT_MS = 15_000

/** A late IPC response cannot publish after this attempt has timed out. */
export function readReviewWithDeadline<T>(read: () => Promise<T>, timeoutMs = REVIEW_READ_TIMEOUT_MS, signal?: AbortSignal): Promise<T> {
  if (timeoutMs <= 0) return Promise.reject(new Error(i18n.t('blueprint:attention.refreshTimeout')))
  let cleanup = () => {}
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal?.reason ?? new Error('Reading cancelled'))
    const timer = setTimeout(() => reject(new Error(i18n.t('blueprint:attention.refreshTimeout'))), timeoutMs)
    cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
    signal?.addEventListener('abort', abort, { once: true })
    Promise.resolve().then(() => { signal?.throwIfAborted(); return read() }).then(resolve, error => {
      reject(String(error).includes('BLUEPRINT_SYNC_TIMEOUT') ? new Error(i18n.t('blueprint:attention.refreshTimeout')) : error)
    })
    if (signal?.aborted) abort()
  }).finally(() => cleanup())
}
