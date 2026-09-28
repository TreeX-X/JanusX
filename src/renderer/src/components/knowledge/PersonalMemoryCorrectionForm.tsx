import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { UserMemoryOverviewHabit } from '../../../../shared/knowledge'
import { useI18n } from '@/i18n/useI18n'
import styles from './MemoryReviewTool.module.css'

export function PersonalMemoryCorrectionForm({ memory, onClose, onSubmitted }: {
  memory: UserMemoryOverviewHabit
  onClose: () => void
  onSubmitted: (status: 'proposed' | 'applied') => void
}) {
  const { t } = useI18n('knowledge')
  const [content, setContent] = useState(memory.content)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const valid = Boolean(memory.contentHash) && Boolean(content.trim()) && content.trim().length <= 4000 && content.trim() !== memory.content
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!valid || pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const result = await window.electron.knowledge.proposePersonalMemoryCorrection({ targetId: memory.id, targetHash: memory.contentHash!, content })
      if (!mounted.current) return
      if (result.status === 'proposed' || result.status === 'applied') onSubmitted(result.status)
      else setError(t('knowledge:persona.correctionRejected'))
    } catch (reason) {
      if (!mounted.current) return
      setError(t(reason instanceof Error && reason.message.includes('Personal correction')
        ? 'knowledge:persona.correctionStale' : 'knowledge:persona.correctionFailed'))
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return <form className={styles.body} onSubmit={event => void submit(event)} aria-label={t('knowledge:persona.correctMemory')}>
    <p>{t('knowledge:persona.correctionOriginal')}</p>
    <blockquote>{memory.content}</blockquote>
    <label>{t('knowledge:persona.correctionNew')}<textarea className={styles.editor} value={content} maxLength={4000} disabled={busy} onChange={event => setContent(event.target.value)} /></label>
    <p>{t('knowledge:persona.correctionPending')}</p>
    {error && <p role="alert">{error}</p>}
    <div className={styles.filters}>
      <button type="submit" disabled={!valid || busy}>{t('knowledge:persona.correctionSubmit')}</button>
      <button type="button" disabled={busy} onClick={onClose}>{t('knowledge:action.close')}</button>
    </div>
  </form>
}
