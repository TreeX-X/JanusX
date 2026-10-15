import React from 'react'
import ReactDOM from 'react-dom/client'
import { AppSettingsModal, type SettingsTab } from '../../../src/renderer/src/components/AppSettingsModal'
import { installElectronApiFallback } from '../../../src/renderer/src/lib/electron-api-fallback'
import { initI18n, changeLanguage } from '../../../src/renderer/src/i18n'
import { useThemeStore } from '../../../src/renderer/src/stores/theme'
import { normalizeAppTheme } from '../../../src/shared/ipc/theme'
import { DEFAULT_AGENT_NOTIFICATION_SETTINGS, normalizeAgentNotificationSettings } from '../../../src/shared/notifications'
import type { AgentNotificationSettingsView } from '../../../src/shared/notifications'
import type { UpdaterEvent, UpdaterState } from '../../../src/shared/ipc/updater'
import '../../../src/renderer/src/styles/globals.css'
import '../../../src/renderer/src/styles/themes.generated.css'

installElectronApiFallback()
const params = new URLSearchParams(location.search)
const language = params.has('en') ? 'en' : 'zh-CN'
if (params.has('updater')) {
  let autoCheck = true
  let listener: ((event: UpdaterEvent) => void) | undefined
  let state: UpdaterState = {
    phase: 'idle', supported: true, unsupportedReason: null, currentVersion: '1.0.0',
    availableVersion: null, downloadPercent: null, releaseNotes: null, error: null,
  }
  Object.assign(window.electron.updater, {
    getState: async () => state,
    getSettings: async () => ({ autoCheck }),
    updateSettings: async (next: { autoCheck: boolean }) => { autoCheck = next.autoCheck; return { autoCheck } },
    onEvent: (callback: (event: UpdaterEvent) => void) => { listener = callback; return () => { listener = undefined } },
    check: async () => {
      state = { ...state, phase: 'downloaded', availableVersion: '1.1.0', releaseNotes: 'A more focused workspace.' }
      listener?.({ type: 'downloaded', version: '1.1.0' })
      return state
    },
    install: async () => { document.documentElement.dataset.updateInstalled = 'true'; return { ok: true } },
    openRepository: async () => {
      if (params.has('linkFail')) throw new Error('Browser unavailable')
      document.documentElement.dataset.repositoryOpened = 'true'
    },
  })
}
let theme = normalizeAppTheme(params.get('theme'))
Object.assign(window.electron.system, { getLanguage: async () => language, setLanguage: async () => undefined })
Object.assign(window.electron.theme, { get: async () => theme, update: async (id: string) => { theme = normalizeAppTheme(id); return theme } })
let settings = structuredClone(DEFAULT_AGENT_NOTIFICATION_SETTINGS)
const toView = (): AgentNotificationSettingsView => {
  const { appSecret, ...feishu } = settings.remote.providers.feishu
  return { ...settings, remote: { ...settings.remote, providers: { feishu: { ...feishu, appSecretConfigured: Boolean(appSecret) } } } }
}
Object.assign(window.electron.notificationSettings, {
  get: async () => toView(),
  update: async (next: typeof settings) => {
    if (params.has('fail')) throw new Error('Fixture save failed')
    settings = normalizeAgentNotificationSettings(next)
    return toView()
  },
  getFeishuControlStatus: async () => ({ state: 'disabled', enabled: false, configured: false, updatedAt: 0 }),
  testFeishu: async () => ({ providerId: 'feishu', ok: true }),
})
await initI18n()
await changeLanguage(language)
await useThemeStore.getState().load()
const root = ReactDOM.createRoot(document.getElementById('root')!)
root.render(
  <AppSettingsModal isOpen initialTab={(params.get('tab') ?? 'general') as SettingsTab} onClose={() => root.unmount()} />,
)
