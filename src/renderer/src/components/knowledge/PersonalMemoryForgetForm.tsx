import { useEffect, useRef, useState } from 'react'
import type { UserMemoryOverviewHabit } from '../../../../shared/knowledge'
import { useI18n } from '@/i18n/useI18n'
import styles from './MemoryReviewTool.module.css'

export function PersonalMemoryForgetForm({ memory, onClose, onForgotten }: {
  memory: Pick<UserMemoryOverviewHabit, 'id' | 'content' | 'contentHash'> & { kind?: 'episode' }; onClose: () => void; onForgotten: () => void
}) {
  const { t } = useI18n('knowledge')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const forget = async () => {
    if (pending.current || !memory.contentHash) return
    pending.current = true; setBusy(true); setError(false)
    try {
      await window.electron.knowledge.forgetPersonalMemory({ targetId: memory.id, targetHash: memory.contentHash, ...(memory.kind ? { kind: memory.kind } : {}) })
      if (mounted.current) onForgotten()
    } catch { if (mounted.current) setError(true) }
    finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  return <section className={styles.body} aria-label={t('knowledge:persona.forgetMemory')}>
    <blockquote>{memory.content}</blockquote>
    <p>{t('knowledge:persona.forgetDetail')}</p>
    {error && <p role="alert">{t('knowledge:persona.forgetFailed')}</p>}
    <div className={styles.filters}>
      <button type="button" disabled={busy} onClick={() => void forget()}>{t('knowledge:persona.forgetConfirm')}</button>
      <button type="button" disabled={busy} onClick={onClose}>{t('knowledge:action.close')}</button>
    </div>
  </section>
}
