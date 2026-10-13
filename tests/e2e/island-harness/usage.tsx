import React from 'react'
import { createRoot } from 'react-dom/client'
import { UsageStatsPanel } from '../../../src/renderer/src/components/UsageStatsPanel'
import { useThemeStore } from '../../../src/renderer/src/stores/theme'
import { installElectronApiFallback } from '../../../src/renderer/src/lib/electron-api-fallback'
import { initI18n, changeLanguage } from '../../../src/renderer/src/i18n'
import type { UsageRecord } from '../../../src/shared/usage'
import '../../../src/renderer/src/styles/globals.css'
import '../../../src/renderer/src/styles/themes.generated.css'

installElectronApiFallback()
await initI18n()
await changeLanguage('zh-CN')
useThemeStore.getState().applyExternal(new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'planche')
document.body.style.background = 'var(--shell-canvas)'
const now = new Date()
const records: UsageRecord[] = [
  { id: '1', engine: 'codex', sessionId: 'codex', at: now.getTime(), timeBasis: 'sample', totalTokens: 12000, inputTokens: 2000, outputTokens: 1000, cacheReadTokens: 8000, cacheWriteTokens: 1000, model: 'gpt-5.4' },
  { id: '2', engine: 'claude', sessionId: 'claude', at: Math.min(now.getTime(), new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8).getTime()), timeBasis: 'event', totalTokens: 4000, inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 2000, model: 'claude-sonnet-4-6' },
]
if (new URLSearchParams(location.search).get('mix') === 'all') records.push(
  { id: '3', engine: 'opencode', sessionId: 'opencode', at: now.getTime(), timeBasis: 'sample', totalTokens: 6000, inputTokens: 2000, outputTokens: 1000, cacheReadTokens: 3000, model: 'glm-5.2' },
  { id: '4', engine: 'pi', sessionId: 'pi', at: now.getTime(), timeBasis: 'event', totalTokens: 3000, inputTokens: 1000, outputTokens: 500, cacheReadTokens: 1500, model: 'gemini-3.1-pro' },
)
window.electron.system.listUsageLedger = async () => ({ records, sessions: [], throughId: 2 })
createRoot(document.getElementById('root')!).render(<main style={{ maxWidth: 800, padding: 24, margin: 'auto' }}><UsageStatsPanel /></main>)
