import React from 'react'
import ReactDOM from 'react-dom/client'
import { ProductWorkspacePanel } from '../../../src/renderer/src/components/product-workspace/ProductWorkspacePanel'
import { useProductWorkspaceStore, type ProductWorkspaceTab } from '../../../src/renderer/src/stores/productWorkspace'
import { applyThemeToDocument } from '../../../src/renderer/src/services/theme'
import { installElectronApiFallback } from '../../../src/renderer/src/lib/electron-api-fallback'
import { initI18n, changeLanguage } from '../../../src/renderer/src/i18n'
import '../../../src/renderer/src/styles/globals.css'
import '../../../src/renderer/src/styles/themes.generated.css'
import '../../../src/renderer/src/components/viewers/markdown-preview.css'

installElectronApiFallback()
Object.assign(window.electron.office, { onWatchEvicted: () => () => {} })
Object.assign(window.electron.file, {
  readBinary: async () => ({ base64: btoa('<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="3600"><rect width="100%" height="100%" fill="orange"/></svg>'), mimeType: 'image/svg+xml', size: 200 }),
  read: async (path: string) => {
    if (path.endsWith('loading.txt')) return new Promise(() => {})
    if (path.endsWith('error.txt')) return { error: 'Fixture read failure' }
    if (path.endsWith('page.html')) return { content: '<body style="background:#123456;color:white">Original document</body>' }
    if (path.endsWith('notes.md')) return { content: '# Preview heading\n\nReadable paragraph\n\n```js\nconst answer = 42\n```\n\n' + 'More content\n\n'.repeat(80) }
    return { content: 'Plain text preview\n'.repeat(40) }
  },
})
const tabs: ProductWorkspaceTab[] = [
  { tabId: 'image', workspaceId: 'fixture', relPath: 'image.svg', kind: 'image', status: 'ready' },
  ...['notes.md', 'data.txt', 'loading.txt', 'error.txt', 'page.html'].map((relPath) => ({
    tabId: relPath, workspaceId: 'fixture', relPath,
    kind: (relPath.endsWith('.md') ? 'markdown' : relPath.endsWith('.html') ? 'html' : 'text') as ProductWorkspaceTab['kind'],
    status: 'ready' as const,
  })),
  { tabId: 'office', workspaceId: 'fixture', relPath: 'report.docx', kind: 'office', status: 'error', errorCode: 'UNAVAILABLE' },
]
useProductWorkspaceStore.setState({ tabs, activeTabIds: { fixture: 'notes.md' } })
applyThemeToDocument(new URLSearchParams(location.search).get('theme') ?? 'planche')
await initI18n()
await changeLanguage('zh-CN')
ReactDOM.createRoot(document.getElementById('root')!).render(
  <main style={{ width: 480, height: 620, margin: 20 }}>
    <button onClick={() => applyThemeToDocument(document.documentElement.dataset.theme === 'dark' ? 'planche' : 'dark')}>切换主题</button>
    <ProductWorkspacePanel workspaceId="fixture" workspacePath="C:/fixture" onClose={() => {}} />
  </main>,
)
