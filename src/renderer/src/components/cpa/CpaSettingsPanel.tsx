import { useEffect, useState } from 'react'
import { useCpaStore } from '@/stores/cpa'
import { openExtensionView } from '@/extensions/workbench'
import { CPA_VIEW_ID } from '@/extensions/cpa'
import { useI18n } from '@/i18n/useI18n'
import { normalizeCpaManagementUrl } from '../../../../shared/ipc/cpa'
import styles from './Cpa.module.css'

export function CpaSettingsPanel({ onOpened }: { onOpened?: () => void }) {
  const { t } = useI18n('common')
  const settings = useCpaStore((state) => state.settings)
  const [draft, setDraft] = useState(settings?.managementUrl ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let disposed = false
    void useCpaStore.getState().load().catch(() => { if (!disposed) setError(t('common:cpa.settingsFailed')) })
    return () => { disposed = true }
  }, [t])
  useEffect(() => { if (settings) setDraft(settings.managementUrl) }, [settings])

  const save = async (open: boolean) => {
    setError(null)
    setSaved(false)
    let managementUrl: string
    try { managementUrl = normalizeCpaManagementUrl(draft) } catch { setError(t('common:cpa.invalidUrl')); return }
    setBusy(true)
    try {
      await useCpaStore.getState().save({ managementUrl })
      setSaved(true)
      if (open) {
        if (!openExtensionView(CPA_VIEW_ID)) throw new Error('cpa-unavailable')
        onOpened?.()
      }
    } catch { setError(t('common:cpa.settingsFailed')) }
    finally { setBusy(false) }
  }

  return <section className={styles.settings} aria-label={t('common:cpa.title')}>
    <h3>CPA · CLIProxyAPI</h3>
    <p>{t('common:cpa.description')}</p>
    <label className={styles.field}>
      <span>{t('common:cpa.managementUrl')}</span>
      <input value={draft} spellCheck={false} placeholder="http://127.0.0.1:8317/management.html"
        disabled={busy} onChange={(event) => { setDraft(event.target.value); setSaved(false) }} />
    </label>
    <p>{t('common:cpa.addressHelp')}</p>
    <p>{t('common:cpa.loginHelp')}</p>
    <p>{t('common:cpa.quotaHelp')}</p>
    <div className={styles.actions}>
      <button type="button" disabled={busy || !settings} onClick={() => void save(false)}>{t('common:action.save')}</button>
      <button type="button" disabled={busy || !settings} onClick={() => void save(true)}>{t('common:cpa.saveAndOpen')}</button>
    </div>
    {saved && <p role="status">{t('common:cpa.saved')}</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
