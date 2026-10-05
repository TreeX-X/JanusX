import React from 'react'
import { createRoot } from 'react-dom/client'
import { UsageStatsPanel } from '../../../src/renderer/src/components/UsageStatsPanel'
import { useWorkspaceStore } from '../../../src/renderer/src/stores/workspace'
import { useThemeStore } from '../../../src/renderer/src/stores/theme'
import { installElectronApiFallback } from '../../../src/renderer/src/lib/electron-api-fallback'
import { initI18n, changeLanguage } from '../../../src/renderer/src/i18n'
import type { Terminal } from '../../../src/renderer/src/types'
import '../../../src/renderer/src/styles/globals.css'
import '../../../src/renderer/src/styles/themes.generated.css'

installElectronApiFallback()
await initI18n()
await changeLanguage('zh-CN')
useThemeStore.getState().applyExternal(new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'planche')
document.body.style.background = 'var(--shell-canvas)'
const now = new Date()
const terminal = (id: string, preset: Terminal['preset'], overrides: Partial<Terminal>): Terminal => ({
  id, preset, workspaceId: 'fixture', name: id, cwd: '', shell: '', pid: 1, status: 'running',
  telemetryUpdatedAt: now.getTime(), ...overrides,
})
useWorkspaceStore.setState({ terminals: [
  terminal('codex', 'codex', { totalTokens: 12000, inputTokens: 2000, outputTokens: 1000, cacheReadTokens: 8000, cacheWriteTokens: 1000, detectedModel: 'gpt-5.4' }),
  terminal('claude', 'claude', { totalTokens: 4000, inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 2000, detectedModel: 'claude-sonnet-4-6', telemetryUpdatedAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8).getTime() }),
] })
createRoot(document.getElementById('root')!).render(<main style={{ maxWidth: 800, padding: 24, margin: 'auto' }}><UsageStatsPanel /></main>)
