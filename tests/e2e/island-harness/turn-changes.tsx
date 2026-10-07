import React from 'react'
import ReactDOM from 'react-dom/client'
import { TurnChangeIsland } from '../../../src/renderer/src/components/TurnChangeIsland'
import { useWorkspaceStore } from '../../../src/renderer/src/stores/workspace'
import { useTurnChangesStore } from '../../../src/renderer/src/stores/turn-changes'
import { installElectronApiFallback } from '../../../src/renderer/src/lib/electron-api-fallback'
import { initI18n, changeLanguage } from '../../../src/renderer/src/i18n'
import type { TerminalTurnChangesEvent } from '../../../src/shared/ipc/terminal'
import '../../../src/renderer/src/styles/globals.css'
import '../../../src/renderer/src/styles/themes.generated.css'

installElectronApiFallback()
const handlers = new Set<(event: TerminalTurnChangesEvent) => void>()
Object.assign(window.electron.system, { getLanguage: async () => 'en', setLanguage: async () => undefined })
Object.assign(window.electron.terminal, { onTurnChanges: (handler: (event: TerminalTurnChangesEvent) => void) => {
  handlers.add(handler)
  return () => handlers.delete(handler)
} })
useWorkspaceStore.setState({ terminals: ['a', 'b'].map(id => ({
  id, cwd: 'C:/project', workspaceId: 'fixture', preset: 'codex', status: 'wait', name: id,
})) })
let sequence = 0
function emit(fileCount: number) {
  const event: TerminalTurnChangesEvent = {
    id: 'a', sequence: ++sequence, turnId: String(sequence), checkpointId: null, kind: 'done',
    endedAt: new Date(Date.UTC(2026, 9, 7, 8, sequence)).toISOString(),
    fileCount, additions: fileCount ? 128 : 0, deletions: fileCount ? 24 : 0,
    files: fileCount ? [
      { path: 'src/main/terminal/turn-change-tracker.ts', status: 'modified', additions: 108, deletions: 20, size: 6500 },
      { path: 'src/renderer/components/TurnChangeIsland.tsx', status: 'modified', additions: 20, deletions: 4, size: 3200 },
    ] : [],
  }
  handlers.forEach(handler => handler(event))
}
Object.assign(window, { turnFixture: {
  listeners: () => handlers.size,
  state: () => useTurnChangesStore.getState(),
} })
document.documentElement.dataset.theme = new URLSearchParams(location.search).get('theme') ?? 'planche'
void initI18n().then(async () => {
  await changeLanguage(new URLSearchParams(location.search).has('zh') ? 'zh-CN' : 'en')
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <div style={{ padding: 32, color: 'var(--shell-text)', background: 'var(--shell-bg)', minHeight: '100vh' }}>
      <div style={{ display: 'flex', gap: 20, marginBottom: 22 }}>
        <button onClick={() => emit(2)}>Change two files</button>
        <button onClick={() => emit(0)}>No changes</button>
        <button onClick={() => emit(120)}>Many files</button>
      </div>
      <div style={{ display: 'flex', gap: 24 }}>
        {['a', 'b'].map(id => <div key={id} data-testid={`pane-${id}`} style={{
          position: 'relative', width: 520, height: 520, background: 'var(--shell-chrome)',
          border: '1px solid var(--shell-border-soft)', padding: 20,
        }}>
          <div style={{ color: 'var(--shell-muted)', fontSize: 12 }}>CODEX · {id === 'a' ? 'JanusX' : 'Second terminal'}</div>
          <TurnChangeIsland terminalId={id} focused={false} />
        </div>)}
      </div>
    </div>,
  )
})
