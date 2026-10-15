import React from 'react'
import { createRoot } from 'react-dom/client'
import { Sidebar } from '../../../src/renderer/src/components/Sidebar'
import { RightDock } from '../../../src/renderer/src/components/right-tools/RightDock'
import { ThemedTooltip } from '../../../src/renderer/src/components/ui/ThemedTooltip'
import { useWorkspaceStore } from '../../../src/renderer/src/stores/workspace'
import { useRightToolStore } from '../../../src/renderer/src/stores/right-tools'
import { installElectronApiFallback } from '../../../src/renderer/src/lib/electron-api-fallback'
import { useThemeStore } from '../../../src/renderer/src/stores/theme'
import { initI18n, changeLanguage } from '../../../src/renderer/src/i18n'
import '../../../src/renderer/src/styles/globals.css'
import '../../../src/renderer/src/styles/themes.generated.css'

installElectronApiFallback()
const theme = new URLSearchParams(location.search).get('theme') ?? 'planche'
useThemeStore.getState().applyExternal(theme)
Object.assign(window.electron.worktree, { list: async () => [] })
Object.assign(window.electron.git, {
  log: async () => [{ hash: 'palette-commit', shortHash: 'abc1234', message: 'Tooltip preview commit', author: 'JanusX', date: new Date().toISOString() }],
  commitChanges: async () => [{ path: 'tooltip-preview.txt', status: 'M', additions: 2, deletions: 1 }],
})
Object.assign(window.electron.session, { list: async () => [{
  id: 'session-palette', workspaceId: 'palette', engine: 'codex', cwd: 'C:/palette',
  firstPrompt: '优化文件管理和工作区菜单的视觉层级', turnCount: 3, checkpointCount: 0,
  status: 'completed', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), archived: false,
}] })
useWorkspaceStore.setState({
  workspaces: [{ id: 'palette', name: 'JanusX', path: 'C:/palette', clis: [], layout: { mode: 'tabs', positions: [] }, createdAt: '', updatedAt: '' }],
  activeWorkspaceId: 'palette', terminals: [],
  fileTree: [{ name: 'README.md', path: 'README.md', type: 'file' }, { name: 'src', path: 'src', type: 'directory', children: [] }],
  fileTreeLoadState: 'idle',
})
useRightToolStore.setState({ openToolIds: ['files', 'sessions', 'git'], activeToolId: 'files' })
await initI18n()
await changeLanguage('zh-CN')
createRoot(document.getElementById('root')!).render(
  <main style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr) 420px', height: '100vh', background: 'var(--shell-canvas)' }}>
    <Sidebar />
    <section style={{ padding: 32, color: 'var(--shell-text)', position: 'relative' }}>
      <h1 style={{ fontSize: 20 }}>JanusX</h1><p style={{ marginTop: 12 }}>中央内容保留暖纸色，工具与菜单使用更浅的中性色。</p>
      <button id="preview-underlay" style={{ position: 'absolute', right: 0, top: 80, bottom: 0, width: 288 }} onClick={(event) => { event.currentTarget.textContent = 'Underlay clicked' }}>Preview underlay</button>
      <div style={{ position: 'fixed', left: 0, bottom: 0 }}>
        <ThemedTooltip label={'Long edge tooltip '.repeat(30)} placement="bottom"><button id="edge-tooltip">Edge tooltip</button></ThemedTooltip>
      </div>
    </section>
    <RightDock effectiveCollapsed={false} effectiveMaxWidth={420} forcedCollapsed={false} onResizingChange={() => {}} />
  </main>,
)
