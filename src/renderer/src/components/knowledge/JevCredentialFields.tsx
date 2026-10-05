// Note: saved credentials use a mask and explicit reveal — see .agents/notes/2026-10-03-knowledge-accumulate-review-wiki-rereview--3944b368.md
import { useEffect, useId, useState } from 'react'
import { Check, Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import styles from '../KnowledgeSettingsPanel.module.css'
import automationStyles from '../KnowledgeAutomationPanel.module.css'

export function JevCredentialFields({ disabled }: { disabled: boolean }) {
  const { t } = useI18n('knowledge')
  const inputId = useId()
  const [configured, setConfigured] = useState(false)
  const [key, setKey] = useState('')
  const [dirty, setDirty] = useState(false)
  const [visible, setVisible] = useState(false)
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving' | 'clearing' | 'revealing' | 'saved' | 'cleared'>('loading')
  const [error, setError] = useState('')
  const busy = ['loading', 'saving', 'clearing', 'revealing'].includes(status)

  useEffect(() => {
    let alive = true
    window.electron.knowledge.jevCredentialStatus()
      .then(result => { if (alive) setConfigured(result.configured) })
      .catch(() => { if (alive) setError(t('knowledge:automation.credentialLoadFailed')) })
      .finally(() => { if (alive) setStatus('idle') })
    return () => { alive = false }
  }, [t])

  const save = async (clear = false) => {
    if (busy || disabled) return
    setStatus(clear ? 'clearing' : 'saving'); setError('')
    try {
      await window.electron.knowledge.setJevCredential(clear ? '' : key)
      setConfigured(!clear); setKey(''); setDirty(false); setVisible(false)
      setStatus(clear ? 'cleared' : 'saved')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ''
      setError(t(message.includes('credential-encryption-unavailable') ? 'knowledge:automation.credentialEncryptionFailed'
        : message.includes('knowledge-disabled') ? 'knowledge:automation.credentialDisabled'
          : message.includes('invalid-credential') ? 'knowledge:automation.credentialInvalid'
            : clear ? 'knowledge:automation.credentialClearFailed' : 'knowledge:automation.credentialFailed'))
      setStatus('idle')
    }
  }
  const toggleVisibility = async () => {
    if (busy || disabled) return
    setError('')
    if (visible) { setVisible(false); if (!dirty) setKey(''); return }
    if (dirty) { setVisible(true); return }
    setStatus('revealing')
    try {
      const saved = await window.electron.knowledge.revealJevCredential()
      setConfigured(Boolean(saved)); setKey(saved ?? ''); setVisible(Boolean(saved))
    } catch { setError(t('knowledge:automation.credentialRevealFailed')) }
    finally { setStatus('idle') }
  }

  return <fieldset className={automationStyles.credentialFields} disabled={disabled || busy} aria-busy={busy}>
    <div className={automationStyles.connectionField}>
      <label htmlFor={inputId}>{t('knowledge:automation.key')}</label>
      <div className={automationStyles.secretInput}>
        <input id={inputId} type={visible ? 'text' : 'password'} autoComplete="off" spellCheck={false}
          value={key} placeholder={configured ? '••••••••••••' : ''}
          onChange={event => { setKey(event.target.value); setDirty(true); setStatus('idle'); setError('') }} />
        <button type="button" className={styles.button} disabled={!key && !configured}
          aria-label={t(visible ? 'knowledge:automation.hideKey' : 'knowledge:automation.showKey')}
          aria-pressed={visible} onClick={() => void toggleVisibility()}>
          {visible ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
        </button>
      </div>
    </div>
    <div className={styles.actions}>
      <button type="button" className={`${styles.button} ${styles.primaryButton}`} disabled={!dirty || !key.trim()} onClick={() => void save()}>
        {status === 'saving' && <LoaderCircle size={13} aria-hidden />}
        {t(status === 'saving' ? 'knowledge:automation.keySaving' : 'knowledge:automation.saveKey')}
      </button>
      <button type="button" className={styles.button} disabled={!configured} onClick={() => void save(true)}>
        {t(status === 'clearing' ? 'knowledge:automation.keyClearing' : 'knowledge:automation.clearKey')}
      </button>
    </div>
    <p className={`${styles.status} ${configured && !dirty && !busy ? styles.statusSuccess : ''} ${automationStyles.credentialStatus}`} role="status" aria-live="polite">
      {configured && !dirty && !busy && <Check size={14} aria-hidden />}
      {t(status === 'loading' ? 'knowledge:automation.keyLoading'
        : status === 'saving' ? 'knowledge:automation.keySaving'
          : status === 'clearing' ? 'knowledge:automation.keyClearing'
            : status === 'revealing' ? 'knowledge:automation.keyRevealing'
              : status === 'saved' ? 'knowledge:automation.keySaved'
                : status === 'cleared' ? 'knowledge:automation.keyCleared'
                  : dirty ? 'knowledge:automation.keyUnsaved'
                    : configured ? 'knowledge:automation.keyConfigured' : 'knowledge:automation.keyMissing')}
    </p>
    {error && <p className={`${styles.status} ${styles.statusError}`} role="alert">{error}</p>}
  </fieldset>
}
