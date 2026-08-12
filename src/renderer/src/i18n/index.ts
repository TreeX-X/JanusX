import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import {
  DEFAULT_LANGUAGE,
  NAMESPACE_LIST,
  type SupportedLanguage,
} from './config'
import { buildInitOptions, detectInitialLanguage, persistLanguage } from './LanguageDetector'

const localeModules = import.meta.glob<{ default: Record<string, unknown> }>('./locales/*/*.json')

async function loadLanguageResources(lang: SupportedLanguage): Promise<Record<string, Record<string, unknown>>> {
  const resources: Record<string, Record<string, unknown>> = {}
  await Promise.all(
    NAMESPACE_LIST.map(async (ns) => {
      const key = `./locales/${lang}/${ns}.json`
      const loader = localeModules[key]
      if (!loader) return
      const mod = await loader()
      resources[ns] = mod.default
    }),
  )
  return resources
}

let initialized = false

export async function initI18n(): Promise<void> {
  if (initialized) return
  initialized = true

  const initialLang = await detectInitialLanguage()
  const resources = await loadLanguageResources(initialLang)

  await i18n.use(initReactI18next).init({
    ...buildInitOptions(initialLang),
    resources: {
      [initialLang]: resources,
    },
  })

  i18n.on('languageChanged', (lng) => {
    if (lng === 'zh-CN' || lng === 'en') {
      void persistLanguage(lng)
    }
  })
}

export async function changeLanguage(lang: SupportedLanguage): Promise<void> {
  if (!i18n.hasResourceBundle(lang, 'common')) {
    const resources = await loadLanguageResources(lang)
    Object.entries(resources).forEach(([ns, bundle]) => {
      i18n.addResourceBundle(lang, ns, bundle, true, true)
    })
  }
  await i18n.changeLanguage(lang)
}

export { DEFAULT_LANGUAGE }
export default i18n