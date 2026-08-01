import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { installElectronApiFallback } from './lib/electron-api-fallback'
import { initBrowserEventSubscriptions } from './stores/browser'
import './styles/globals.css'
import './components/janus/janus-island.css'

/*-- P4: 按窗口类型分包。四种窗口共用一个 HTML 入口，
     静态导入会让主窗口首屏背上编辑器/浏览器/Toast 三个用不到的根组件。 --*/
const App = lazy(() => import('./App'))
const DesktopToastApp = lazy(() =>
  import('./components/DesktopToastApp').then((m) => ({ default: m.DesktopToastApp }))
)
const StandaloneFileEditor = lazy(() =>
  import('./components/StandaloneFileEditor').then((m) => ({ default: m.StandaloneFileEditor }))
)
const StandaloneBrowser = lazy(() =>
  import('./components/browser/StandaloneBrowser').then((m) => ({ default: m.StandaloneBrowser }))
)

installElectronApiFallback()

/*-- browser 事件订阅：主窗口与独立浏览器窗口共用此入口，各窗口各自订阅一份 --*/
initBrowserEventSubscriptions()

const searchParams = new URLSearchParams(window.location.search)
const isEditorWindow = searchParams.get('editorWindow') === '1'
const isDesktopToast = searchParams.get('desktopToast') === '1'
const isBrowserWindow = searchParams.get('browserWindow') === '1'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      {isDesktopToast ? <DesktopToastApp /> : isEditorWindow ? <StandaloneFileEditor /> : isBrowserWindow ? <StandaloneBrowser /> : <App />}
    </Suspense>
  </React.StrictMode>
)
