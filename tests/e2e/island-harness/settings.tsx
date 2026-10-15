import React from 'react'
import ReactDOM from 'react-dom/client'
import { AppSettingsModal, type SettingsTab } from '../../../src/renderer/src/components/AppSettingsModal'
import { installElectronApiFallback } from '../../../src/renderer/src/lib/electron-api-fallback'
import { initI18n, changeLanguage } from '../../../src/renderer/src/i18n'
import { useThemeStore } from '../../../src/renderer/src/stores/theme'
import { normalizeAppTheme } from '../../../src/shared/ipc/theme'
import { DEFAULT_AGENT_NOTIFICATION_SETTINGS, normalizeAgentNotificationSettings } from '../../../src/shared/notifications'
import type { AgentNotificationSettingsView } from '../../../src/shared/notifications'
import '../../../src/renderer/src/styles/globals.css'
import '../../../src/renderer/src/styles/themes.generated.css'

installElectronApiFallback()
const params = new URLSearchParams(location.search)
const language = params.has('en') ? 'en' : 'zh-CN'
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
