import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { WindowControls } from '../../../src/renderer/src/components/WindowControls'
import { FloatingPanel } from '../../../src/renderer/src/components/FloatingPanel'
import { ModalCloseButton } from '../../../src/renderer/src/components/ModalCloseButton'
import { installElectronApiFallback } from '../../../src/renderer/src/lib/electron-api-fallback'
import { initI18n, changeLanguage } from '../../../src/renderer/src/i18n'
import '../../../src/renderer/src/styles/globals.css'
import '../../../src/renderer/src/styles/themes.generated.css'

const params = new URLSearchParams(location.search)
installElectronApiFallback()
Object.assign(window.electron, { platform: params.get('platform') ?? 'win32' })
document.documentElement.dataset.theme = params.get('theme') ?? 'planche'
let maximized = false
let listener: ((value: boolean) => void) | undefined
const calls: string[] = []
Object.assign(window.electron.window, {
  getMaximized: async () => maximized,
  onMaximizedChanged: (callback: (value: boolean) => void) => {
    listener = callback
    return () => { listener = undefined }
  },
  maximize: async () => { calls.push('maximize'); maximized = !maximized; listener?.(maximized) },
  minimize: async () => { calls.push('minimize') },
  close: async () => { calls.push('native-close') },
})
Object.assign(window, { controlCalls: calls })

function Harness() {
  const [panel, setPanel] = useState(true)
  const [dialog, setDialog] = useState(true)
  return <>
    <header className="flex h-[38px] items-center px-3" style={{ background: 'var(--chrome-bg)', color: 'var(--shell-text)' }}>
      <span>JanusX</span><span className="ml-auto">Workspace tools</span>
      <WindowControls onClose={() => { calls.push('confirmed-close') }} />
    </header>
    {dialog && <div data-dialog-header className="m-8 flex w-[360px] items-center gap-3 p-3" style={{ background: 'var(--shell-pane-chrome)', color: 'var(--shell-text)' }}>
      <ModalCloseButton onClose={() => setDialog(false)} /><span>Dialog title</span>
    </div>}
    <FloatingPanel visible={panel} title="Preview panel" onClose={() => setPanel(false)}>
      <div className="p-4" style={{ color: 'var(--shell-text)' }}>Panel content</div>
    </FloatingPanel>
  </>
}
void initI18n().then(() => changeLanguage('en')).then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />)
})
