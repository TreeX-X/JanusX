import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from './index'
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, type SupportedLanguage } from './config'
import { changeLanguage } from './index'

export function useI18n(namespace?: string | string[]) {
  const { t, i18n: instance, ready } = useTranslation(namespace, { useSuspense: false })

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    void changeLanguage(lang)
  }, [])

  const getCurrentLanguage = useCallback<() => SupportedLanguage>(() => {
    const lng = i18n.language
    if (lng === 'zh-CN' || lng === 'en') return lng
    return 'zh-CN'
  }, [])

  return {
    t,
    i18n: instance,
    ready,
    supportedLanguages: SUPPORTED_LANGUAGES,
    languageLabels: LANGUAGE_LABELS,
    currentLanguage: getCurrentLanguage(),
    setLanguage,
    getCurrentLanguage,
  }
}