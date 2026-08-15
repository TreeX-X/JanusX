import React, { lazy, Suspense, type ErrorInfo, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { installElectronApiFallback } from './lib/electron-api-fallback'
import { initBrowserEventSubscriptions } from './stores/browser'
import { initI18n } from './i18n'
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

/*-- i18n：异步初始化，语言探测 + 资源加载完成后 React 树挂载，避免首屏 fallback 闪烁 --*/
const i18nReady = initI18n()

const searchParams = new URLSearchParams(window.location.search)
const isEditorWindow = searchParams.get('editorWindow') === '1'
const isDesktopToast = searchParams.get('desktopToast') === '1'
const isBrowserWindow = searchParams.get('browserWindow') === '1'

function EditorWindowLoading() {
  return (
    <div
      data-editor-window-state="loading"
      className="flex h-screen flex-col overflow-hidden bg-[#151517] text-[#d4d4d4]"
      role="status"
      aria-label="Loading editor"
    >
      <div className="h-[38px] shrink-0 border-b border-white/[0.06] bg-[#060606] px-3">
        <div className="flex h-full items-center gap-2" aria-hidden="true">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center gap-2 text-xs text-[#666]">
        <span>Loading editor</span>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff7830]" aria-hidden="true" />
      </div>
    </div>
  )
}

class EditorWindowErrorBoundary extends React.Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Standalone editor failed to render:', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <div
        data-editor-window-state="error"
        className="flex h-screen items-center justify-center bg-[#151517] px-8 text-[#d4d4d4]"
        role="alert"
      >
        <div className="w-full max-w-md border border-white/[0.08] bg-[#191919] p-5">
          <div className="text-sm text-[#eee]">Editor failed to open</div>
          <div className="mt-2 break-words font-mono text-[11px] leading-5 text-[#777]">
            {this.state.error.message || 'The editor renderer could not be loaded.'}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="h-8 border border-[#ff7830]/40 bg-[#ff7830]/10 px-3 text-xs text-[#ff9b64] hover:bg-[#ff7830]/15"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
            <button
              type="button"
              className="h-8 border border-white/[0.08] bg-white/[0.04] px-3 text-xs text-[#999] hover:text-white"
              onClick={() => window.electron.window.close()}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }
}

const rootContent = isEditorWindow ? (
  <EditorWindowErrorBoundary>
    <Suspense fallback={<EditorWindowLoading />}>
      <StandaloneFileEditor />
    </Suspense>
  </EditorWindowErrorBoundary>
) : (
  <Suspense fallback={null}>
    {isDesktopToast ? <DesktopToastApp /> : isBrowserWindow ? <StandaloneBrowser /> : <App />}
  </Suspense>
)

const renderRoot = () => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      {rootContent}
    </React.StrictMode>,
  )
}

// Toasts do not use translations. Mount this lightweight surface immediately
// so it can acknowledge readiness before the notification timeout expires.
if (isDesktopToast) {
  renderRoot()
} else {
  void i18nReady.then(renderRoot)
}
