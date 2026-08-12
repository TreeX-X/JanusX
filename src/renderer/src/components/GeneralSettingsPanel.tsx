import { useI18n } from '@/i18n/useI18n'
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from '@/i18n/config'
import styles from './AppSettingsModal.module.css'

export function GeneralSettingsPanel() {
  const { t, currentLanguage, setLanguage } = useI18n('settings')

  return (
    <div className={styles.generalPanel}>
      <div className={styles.generalRow}>
        <div className={styles.generalLabelCol}>
          <div className={styles.generalLabel}>{t('settings:general.language.label')}</div>
          <div className={styles.generalHelp}>{t('settings:general.language.help')}</div>
        </div>
        <div className={styles.generalControlCol}>
          <select
            className={styles.generalSelect}
            value={currentLanguage}
            onChange={(e) => setLanguage(e.target.value as typeof SUPPORTED_LANGUAGES[number])}
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {LANGUAGE_LABELS[lang]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}