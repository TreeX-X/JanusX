import { useEffect, useRef, useState } from 'react'
import type { KnowledgeAPI } from '../../../../shared/ipc/knowledge'
import { useI18n } from '@/i18n/useI18n'

export function LegacyEpisodeMigrationControl() {
  const { t } = useI18n('knowledge')
  const [preview, setPreview] = useState<Awaited<ReturnType<KnowledgeAPI['migrateLegacyEpisodes']>> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const mounted = useRef(true)
  const pending = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const run = async (confirm: boolean) => {
    if (pending.current || (confirm && !preview)) return
    pending.current = true; setBusy(true); setError(false); setDone(null)
    try {
      const result = await window.electron.knowledge.migrateLegacyEpisodes(confirm ? { expectedHash: preview!.hash } : {})
      if (!mounted.current) return
      setPreview(confirm ? null : result)
      if (confirm) setDone(result.migrated)
    } catch {
      if (mounted.current) { setError(true); setPreview(null) }
    } finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  return <div>
    <button type="button" disabled={busy} onClick={() => void run(false)}>{t('knowledge:review.episodesPreview')}</button>
    {preview && <>
      <p>{t('knowledge:review.episodesDetail', preview)}</p>
      <button type="button" disabled={busy || preview.files === 0} onClick={() => void run(true)}>{t('knowledge:review.episodesConfirm')}</button>
    </>}
    {error && <p role="alert">{t('knowledge:review.episodesFailed')}</p>}
    {done !== null && <p role="status">{t('knowledge:review.episodesDone', { count: done })}</p>}
  </div>
}
