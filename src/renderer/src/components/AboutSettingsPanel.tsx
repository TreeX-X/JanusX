import { useState } from 'react'
import { ArrowUpRight, Star } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { UpdaterSettings } from './UpdaterSettings'
import styles from './AboutSettingsPanel.module.css'

// Note: product identity, updates and support share one page — see .agents/notes/workbench/settings-layout.md
export function AboutSettingsPanel() {
  const { t } = useI18n('settings')
  const [linkError, setLinkError] = useState(false)
  const [opening, setOpening] = useState(false)

  const openRepository = async () => {
    if (opening) return
    setOpening(true)
    setLinkError(false)
    try {
      await window.electron.updater.openRepository()
    } catch {
      setLinkError(true)
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className={styles.panel}>
      <section className={styles.identity} aria-label="JanusX">
        <h3 className={styles.productName}>JanusX</h3>
        <p className={styles.description}>{t('settings:about.description')}</p>
      </section>

      <section className={styles.updates} aria-labelledby="about-updates-title">
        <h3 id="about-updates-title" className={styles.sectionTitle}>{t('settings:updater.title')}</h3>
        <UpdaterSettings />
      </section>

      <footer className={styles.support}>
        <div className={styles.supportCopy}>
          <h3 className={styles.supportTitle}>{t('settings:about.support.title')}</h3>
          <p className={styles.description}>{t('settings:about.support.description')}</p>
        </div>
        <button type="button" className={styles.supportButton} disabled={opening} onClick={() => void openRepository()}>
          <Star size={14} strokeWidth={1.7} aria-hidden="true" />
          {t('settings:about.support.action')}
          <ArrowUpRight size={13} strokeWidth={1.7} aria-hidden="true" />
        </button>
        {linkError && <p className={styles.error} role="alert">{t('settings:about.support.error')}</p>}
      </footer>
    </div>
  )
}
