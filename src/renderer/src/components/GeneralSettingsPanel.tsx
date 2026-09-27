import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from '@/i18n/config'
import { Select } from './ui/Select'
import { LanguageServiceManager } from './LanguageServiceManager'
import { EXTERNAL_CLI_TOOL_ORDER } from '../../../shared/ipc/external-cli'
import { ExternalCliManager } from './ExternalCliManager'
import { UpdaterSettings } from './UpdaterSettings'
import { useThemeStore } from '@/stores/theme'
import { listThemeDefinitions } from '../../../shared/theme/registry'
import type { AppTheme } from '../../../shared/ipc/theme'
import styles from './AppSettingsModal.module.css'

export function GeneralSettingsPanel() {
  const { t, currentLanguage, setLanguage } = useI18n('settings')
  const theme = useThemeStore((s) => s.theme)
  const themeLoaded = useThemeStore((s) => s.loaded)
  const loadTheme = useThemeStore((s) => s.load)
  const setTheme = useThemeStore((s) => s.setTheme)
  const [themeError, setThemeError] = useState<string | null>(null)

  useEffect(() => {
    void loadTheme()
  }, [loadTheme])

  const languageOptions = SUPPORTED_LANGUAGES.map((lang) => ({
    value: lang,
    label: LANGUAGE_LABELS[lang],
  }))

  // 下拉选项读主题注册表：新增主题注册后自动出现，无需改组件。
  // 已有 key 走 i18n（settings:general.theme.<id>），未知 id 回落 definition.label。
  const themeOptions: { value: AppTheme; label: string }[] = listThemeDefinitions().map((definition) => ({
    value: definition.id,
    label: t(`settings:general.theme.${definition.id}`, { defaultValue: definition.label }),
  }))

  const handleThemeChange = (value: string) => {
    setThemeError(null)
    void setTheme(value as AppTheme).catch(() => {
      setThemeError(t('settings:general.theme.saveError'))
    })
  }

  return (
    <div className={styles.generalPanel}>
      <div className={styles.generalRow}>
        <div className={styles.generalLabelCol}>
          <div className={styles.generalLabel}>{t('settings:general.theme.label')}</div>
          <div className={styles.generalHelp}>{t('settings:general.theme.help')}</div>
          {themeError && <div className={styles.generalHelp}>{themeError}</div>}
        </div>
        <div className={styles.generalControlCol}>
          <Select
            value={themeLoaded ? theme : 'dark'}
            onChange={handleThemeChange}
            options={themeOptions}
            className={styles.generalSelect}
            ariaLabel={t('settings:general.theme.label')}
          />
        </div>
      </div>
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
          <div className={styles.generalLabel}>{t('settings:cliTools.title')}</div>
          <div className={styles.generalHelp}>{t('settings:cliTools.subtitle')}</div>
        </div>
        <div className={styles.generalControlCol}>
          <div className={styles.lsCard}>
            {EXTERNAL_CLI_TOOL_ORDER.map((toolId) => (
              <ExternalCliManager key={toolId} toolId={toolId} />
            ))}
          </div>
        </div>
      </div>

      <div className={styles.generalRow}>
        <div className={styles.generalLabelCol}>
          <div className={styles.generalLabel}>{t('settings:updater.title')}</div>
          <div className={styles.generalHelp}>{t('settings:updater.subtitle')}</div>
        </div>
        <div className={styles.generalControlCol}>
          <UpdaterSettings />
        </div>
      </div>
    </div>
  )
}
