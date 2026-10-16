import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserSurface } from '../../../src/renderer/src/components/browser/BrowserSurface'
import { installElectronApiFallback } from '../../../src/renderer/src/lib/electron-api-fallback'
import { useBrowserStore } from '../../../src/renderer/src/stores/browser'
import { useThemeStore } from '../../../src/renderer/src/stores/theme'
import { changeLanguage, initI18n } from '../../../src/renderer/src/i18n'
import type { BrowserBounds, BrowserSurfaceState } from '../../../src/shared/ipc/browser'
import '../../../src/renderer/src/styles/globals.css'
import '../../../src/renderer/src/styles/themes.generated.css'

installElectronApiFallback()
const params = new URLSearchParams(location.search)
useThemeStore.getState().applyExternal(params.get('theme') ?? 'dark')
Object.assign(window.electron.system, { getLanguage: async () => 'en', setLanguage: async () => undefined })
let sequence = 1
let bounds: BrowserBounds | null = null
let state: BrowserSurfaceState = {
  surfaceId: 'fixture', carrier: params.get('carrier') === 'window' ? 'window' : 'pane',
  activeTabId: 'one', agentControlled: false,
  tabs: [{ tabId: 'one', url: 'about:blank', title: '', isLoading: false, canGoBack: false, canGoForward: false }],
}
const publish = () => useBrowserStore.getState().applySurfaceState({ ...state, tabs: [...state.tabs] })
Object.assign(window.electron.browser, {
  getState: async () => state,
  setBounds: async (_id: string, value: BrowserBounds) => { bounds = value },
  openTab: async (_id: string, url = '') => {
    const tabId = `tab-${++sequence}`
    state = { ...state, activeTabId: tabId, tabs: [...state.tabs,
      { tabId, url, title: url ? 'Local preview' : '', isLoading: false, canGoBack: false, canGoForward: false }] }
    publish()
    return { success: true, data: { tabId } }
  },
  activateTab: async (_id: string, tabId: string) => { state = { ...state, activeTabId: tabId }; publish() },
  closeTab: async (_id: string, tabId: string) => {
    const tabs = state.tabs.filter((tab) => tab.tabId !== tabId)
    state = { ...state, tabs, activeTabId: state.activeTabId === tabId ? tabs.at(-1)?.tabId ?? null : state.activeTabId }
    publish()
  },
  navigate: async (_id: string, tabId: string, url: string) => {
    state = { ...state, tabs: state.tabs.map((tab) => tab.tabId === tabId ? { ...tab, url, title: 'Local preview', canGoBack: true } : tab) }
    publish()
  },
})
publish()
Object.assign(window, { browserFixture: {
  state: () => ({ ...state, bounds }),
  fail: () => {
    state = { ...state, tabs: state.tabs.map((tab) => tab.tabId === state.activeTabId ? { ...tab, loadError: 'ERR_CONNECTION_REFUSED' } : tab) }
    publish()
  },
} })
await initI18n()
await changeLanguage('en')
createRoot(document.getElementById('root')!).render(<div style={{ height: '100vh' }}>
  <BrowserSurface surfaceId="fixture" carrier={state.carrier} visible onRequestPopOut={() => {}} onRequestEmbed={() => {}} />
</div>)
