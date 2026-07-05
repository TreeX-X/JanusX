import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { DesktopToastApp } from './components/DesktopToastApp'
import { StandaloneFileEditor } from './components/StandaloneFileEditor'
import './styles/globals.css'
import './components/janus/janus-island.css'

const searchParams = new URLSearchParams(window.location.search)
const isEditorWindow = searchParams.get('editorWindow') === '1'
const isDesktopToast = searchParams.get('desktopToast') === '1'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isDesktopToast ? <DesktopToastApp /> : isEditorWindow ? <StandaloneFileEditor /> : <App />}
  </React.StrictMode>
)
