import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { DesktopToastApp } from './components/DesktopToastApp'
import { StandaloneFileEditor } from './components/StandaloneFileEditor'
import { StandaloneBrowser } from './components/browser/StandaloneBrowser'
import { installElectronApiFallback } from './lib/electron-api-fallback'
import { initBrowserEventSubscriptions } from './stores/browser'
import './styles/globals.css'
import './components/janus/janus-island.css'

installElectronApiFallback()

/*-- browser 事件订阅：主窗口与独立浏览器窗口共用此入口，各窗口各自订阅一份 --*/
initBrowserEventSubscriptions()

const searchParams = new URLSearchParams(window.location.search)
const isEditorWindow = searchParams.get('editorWindow') === '1'
const isDesktopToast = searchParams.get('desktopToast') === '1'
const isBrowserWindow = searchParams.get('browserWindow') === '1'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isDesktopToast ? <DesktopToastApp /> : isEditorWindow ? <StandaloneFileEditor /> : isBrowserWindow ? <StandaloneBrowser /> : <App />}
  </React.StrictMode>
)
