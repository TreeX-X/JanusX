import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { StandaloneFileEditor } from './components/StandaloneFileEditor'
import './styles/globals.css'
import './components/janus/janus-island.css'

const isEditorWindow = new URLSearchParams(window.location.search).get('editorWindow') === '1'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isEditorWindow ? <StandaloneFileEditor /> : <App />}
  </React.StrictMode>
)
