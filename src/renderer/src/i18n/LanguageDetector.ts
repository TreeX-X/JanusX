import type { InitOptions } from 'i18next'
import {
  DEFAULT_LANGUAGE,
  FALLBACK_LANGUAGE,
  DEFAULT_NAMESPACE,
  NAMESPACE_LIST,
  type SupportedLanguage,
} from './config'

interface LanguageStore {
  get(): Promise<string | null>
  set(lang: SupportedLanguage): Promise<void>
}

const memoryStore: LanguageStore = {
  get: async () => null,
  set: async () => {},
}

function resolveStore(): LanguageStore {
  const electron = (window as unknown as { electron?: { system?: { getLanguage?: () => Promise<string | null>; setLanguage?: (lang: string) => Promise<void> } } }).electron
  if (electron?.system?.getLanguage && electron?.system?.setLanguage) {
    return {
      get: () => electron.system!.getLanguage!(),
      set: (lang) => electron.system!.setLanguage!(lang),
    }
  }
  return memoryStore
}

export async function detectInitialLanguage(): Promise<SupportedLanguage> {
  const store = resolveStore()
  const stored = await store.get()
  if (stored === 'zh-CN' || stored === 'en') return stored

  const system = (navigator.language || 'zh').toLowerCase()
  return system.startsWith('zh') ? 'zh-CN' : 'en'
}

export async function persistLanguage(lang: SupportedLanguage): Promise<void> {
  await resolveStore().set(lang)
}

export function buildInitOptions(initialLanguage: SupportedLanguage): InitOptions {
  return {
    lng: initialLanguage,
    supportedLngs: ['zh-CN', 'en'],
    fallbackLng: FALLBACK_LANGUAGE,
    defaultNS: DEFAULT_NAMESPACE,
    ns: [...NAMESPACE_LIST],
    partialBundledLanguages: true,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
      bindI18n: 'languageChanged loaded',
    },
  }
}