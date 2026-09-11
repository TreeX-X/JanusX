import { useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAppStore } from '@/stores/app'
import { useRemoteStore } from '@/stores/remote'
import { useTeamStore } from '@/stores/team'
import { useI18n } from '@/i18n/useI18n'
import { RemoteModal } from '@/components/remote/RemoteModal'

export function StatusBar() {
  const { t } = useI18n()
  const terminals = useWorkspaceStore((s) => s.terminals)
  const activeTerminalId = useWorkspaceStore((s) => s.activeTerminalId)
  const loadState = useAppStore((s) => s.loadState)
  const blueprintMode = useAppStore((s) => s.blueprintMode)

  const focusedTerminal = activeTerminalId ? terminals.find((terminal) => terminal.id === activeTerminalId) ?? null : null
  const remoteStatus = useRemoteStore((s) => s.status)
  const remotePeerName = useRemoteStore((s) => s.peerName)
  const remoteHosting = useRemoteStore((s) => s.hostService.running)
  const teamStatus = useTeamStore((s) => s.status)
  const [remoteOpen, setRemoteOpen] = useState(false)

  const statusText: Record<string, string> = {
    'no-workspace': t('common:statusBar.waitingWorkspace'),
    'workspace-loaded': t('common:statusBar.workspaceLoaded'),
    'no-terminal': t('common:statusBar.waitingTerminal'),
    'terminal-active': focusedTerminal
      ? t('common:statusBar.terminalActiveFocused', { name: focusedTerminal.name, status: focusedTerminal.status })
      : t('common:statusBar.terminalActiveNoFocus', { count: terminals.length }),
  }

  const remoteConnected = remoteStatus === 'connected'
  const remoteDotColor = remoteConnected ? '#58c98d' : remoteHosting ? '#ff7830' : '#55555b'
  const remoteLabel =
    teamStatus !== 'authed'
      ? t('team:remote.title')
      : remoteConnected
        ? `${t('team:remote.connected')}${remotePeerName ? ` · ${remotePeerName}` : ''}`
        : remoteHosting
          ? `${t('team:remote.title')} · ${t('team:remote.hostServiceTitle')}`
          : t('team:remote.title')

  return (
    <footer
      className="col-span-3 flex items-center justify-between px-3.5 text-[10px]"
      style={{
        background: 'var(--shell-chrome)',
        borderTop: '1px solid var(--shell-border)',
        color: 'var(--shell-dim)',
      }}
    >
      <div className="flex items-center gap-1.5">
        <div
          className="h-[5px] w-[5px] rounded-full animate-pulse"
          style={{
            background: '#ff7830',
            boxShadow: '0 0 6px rgba(255, 120, 48, 0.6)',
          }}
        />
        <span>{blueprintMode ? t('common:statusBar.blueprintRunning') : (statusText[loadState] ?? t('common:statusBar.ready'))}</span>
      </div>
      {/* 远控入口：搬离侧栏左下角后唯一的常驻入口（左下角只留 TeamFooter）。 */}
      <button
        type="button"
        onClick={() => setRemoteOpen(true)}
        title={t('team:remote.title')}
        aria-label={t('team:remote.title')}
        className="flex h-6 items-center gap-1.5 rounded-[4px] border border-transparent px-2 transition-colors hover:bg-white/[0.06]"
        style={{ color: 'var(--shell-dim)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,120,48,0.28)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'transparent'
        }}
      >
        <span
          className="h-[6px] w-[6px] rounded-full"
          style={{
            background: remoteDotColor,
            boxShadow: remoteConnected || remoteHosting ? `0 0 6px ${remoteDotColor}` : 'none',
          }}
        />
        <span className="max-w-[260px] truncate font-mono">{remoteLabel}</span>
      </button>
      <RemoteModal open={remoteOpen} onClose={() => setRemoteOpen(false)} />
    </footer>
  )
}
