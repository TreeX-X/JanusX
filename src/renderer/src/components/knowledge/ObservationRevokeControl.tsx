import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'

export function ObservationRevokeControl({ id, workspaceId, onRevoked }: { id: string; workspaceId: string; onRevoked: () => void }) {
  const { t } = useI18n('knowledge')
  const [preview, setPreview] = useState<{ sourceHash: string; revoked: boolean; content: string }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  const pending = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const run = async (confirm: boolean) => {
    if (pending.current) return
    pending.current = true; setBusy(true); setError('')
    try {
      if (confirm && preview) {
        await window.electron.knowledge.revokeObservation({ id, workspaceId, sourceHash: preview.sourceHash })
        if (mounted.current) onRevoked()
      } else {
        const result = await window.electron.knowledge.observationRevocationContext({ id, workspaceId })
        if (mounted.current) setPreview(result)
      }
    } catch (reason) {
      if (mounted.current) { setError(reason instanceof Error ? reason.message : t('knowledge:error.revokeFailed')); setPreview(undefined) }
    } finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  return <section>
    {preview && <><blockquote>{preview.content}</blockquote><p>{t('knowledge:observation.revokeDetail')}</p></>}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy || preview?.revoked} onClick={() => void run(!!preview)}>
      {busy ? t('knowledge:action.working') : preview?.revoked ? t('knowledge:observation.revoked') : preview ? t('knowledge:observation.confirmRevoke') : t('knowledge:observation.revoke')}
    </button>
    {preview && !busy && <button type="button" onClick={() => setPreview(undefined)}>{t('knowledge:action.close')}</button>}
  </section>
}
