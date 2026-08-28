import { useI18n } from '@/i18n/useI18n'
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from '@/i18n/config'
import { Select } from './ui/Select'
import { LanguageServiceManager } from './LanguageServiceManager'
import { OfficeCliManager } from './OfficeCliManager'
import styles from './AppSettingsModal.module.css'

export function GeneralSettingsPanel() {
  const { t, currentLanguage, setLanguage } = useI18n('settings')

  const languageOptions = SUPPORTED_LANGUAGES.map((lang) => ({
    value: lang,
    label: LANGUAGE_LABELS[lang],
  }))

  return (
    <div className={styles.generalPanel}>
      <div className={styles.generalRow}>
        <div className={styles.generalLabelCol}>
          <div className={styles.generalLabel}>{t('settings:general.language.label')}</div>
          <div className={styles.generalHelp}>{t('settings:general.language.help')}</div>
        </div>
        <div className={styles.generalControlCol}>
          <Select
            value={currentLanguage}
            onChange={(value) => setLanguage(value as typeof SUPPORTED_LANGUAGES[number])}
            options={languageOptions}
            className={styles.generalSelect}
            ariaLabel={t('settings:general.language.label')}
          />
        </div>
      </div>

      <div className={styles.generalRow}>
        <div className={styles.generalLabelCol}>
          <div className={styles.generalLabel}>{t('settings:languageService.title')}</div>
          <div className={styles.generalHelp}>{t('settings:languageService.subtitle')}</div>
        </div>
        <div className={styles.generalControlCol}>
          <LanguageServiceManager />
        </div>
      </div>

      <div className={styles.generalRow}>
        <div className={styles.generalLabelCol}>
          <div className={styles.generalLabel}>{t('settings:officeCli.title')}</div>
          <div className={styles.generalHelp}>{t('settings:officeCli.subtitle')}</div>
        </div>
        <div className={styles.generalControlCol}>
          <OfficeCliManager />
        </div>
      </div>
    </div>
  )
}
