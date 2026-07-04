import { useCallback } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAppStore } from '@/stores/app'
import type { TerminalPreset, Terminal } from '@/types'
import { getTerminalPresetMeta, resolveTerminalLaunchCommand } from '../../../shared/terminalLaunch'

import terminalIcon from '@/assets/icons/terminal.svg'
import claudeIcon from '@/assets/icons/claude.svg'
import codexIcon from '@/assets/icons/codex.svg'
import opencodeIcon from '@/assets/icons/opencode.svg'

const ICONS: Record<TerminalPreset, string> = {
  shell: terminalIcon,
  claude: claudeIcon,
  codex: codexIcon,
  opencode: opencodeIcon,
}

function waitForTerminalMount(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

interface TerminalOptionProps {
  preset: TerminalPreset
  name: string
  onClick: () => void
}

function TerminalOption({ preset, name, onClick }: TerminalOptionProps) {
  return (
    <div
      onClick={onClick}
      className="w-full rounded-lg cursor-pointer transition-all flex flex-col items-center justify-center gap-3 px-4 py-5 min-h-[132px]"
      style={{
        background: 'rgba(18, 18, 20, 0.85)',
        border: '1px solid var(--border)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
        e.currentTarget.style.borderColor = 'rgba(255, 120, 48, 0.3)'
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(18, 18, 20, 0.85)'
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.04)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <div className="w-12 h-12 flex items-center justify-center">
        <img src={ICONS[preset]} alt={name} className="w-9 h-9" />
      </div>
      <div className="text-[13px] font-medium text-[#d4d4d4] leading-none text-center">{name}</div>
    </div>
  )
}

export function TerminalSelector() {
  const { activeWorkspaceId, addTerminal, removeTerminal } = useWorkspaceStore()
  const setLoadState = useAppStore((s) => s.setLoadState)
  const setBlueprintMode = useAppStore((s) => s.setBlueprintMode)
  const setPanelCollapsed = useAppStore((s) => s.setPanelCollapsed)

  const handleSelect = useCallback(
    async (preset: TerminalPreset) => {
      if (!activeWorkspaceId) return

      const workspaces = useWorkspaceStore.getState().workspaces
      const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
      if (!workspace) return

      // 通过 IPC 获取系统默认 Shell
      const defaultShell = (await window.electron.invoke('system:getDefaultShell')) as string

      const terminalId = crypto.randomUUID()
      const presetMeta = getTerminalPresetMeta(preset)
      const autoCommand = resolveTerminalLaunchCommand(preset)
      const telemetryStartedAt = Date.now()
      const terminal: Terminal = {
        id: terminalId,
        workspaceId: activeWorkspaceId,
        name: presetMeta.name,
        preset,
        cwd: workspace.path,
        shell: defaultShell,
        autoCommand,
        pid: null,
        status: 'idle',
        updatedAt: telemetryStartedAt,
        telemetryStartedAt,
      }

      addTerminal(terminal)

      // 先切换视图并等待 TerminalArea/CLITerminal 挂载，避免 PTY 首屏输出在监听注册前丢失。
      setBlueprintMode(false)
      setPanelCollapsed(true)
      setLoadState('terminal-active')
      await waitForTerminalMount()

      try {
        const result = (await window.electron.invoke('terminal:create', {
          id: terminalId,
          workspaceId: activeWorkspaceId,
          cwd: workspace.path,
          shell: defaultShell,
          autoCommand,
          preset,
        })) as { pid: number }

        useWorkspaceStore.setState((s) => ({
          terminals: s.terminals.map((t) =>
            t.id === terminalId ? { ...t, pid: result.pid, status: 'running' as const } : t
          ),
        }))
      } catch (err) {
        console.error('Failed to create terminal:', err)
        removeTerminal(terminalId)
        if (useWorkspaceStore.getState().terminals.length === 0) {
          setLoadState('no-terminal')
        }
      }
    },
    [activeWorkspaceId, addTerminal, removeTerminal, setLoadState, setBlueprintMode, setPanelCollapsed]
  )

  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-6 px-4 py-8 sm:px-6 md:px-10"
      style={{
        background: 'var(--bg-deep)',
      }}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="text-sm text-[#8a8a8a] font-medium">选择终端类型</div>
        <div className="text-[11px] text-[#5f5f5f] max-w-[520px] leading-relaxed">
          选择一个类型后自动创建终端。
        </div>
      </div>
      <div
        className="grid w-full max-w-[880px] gap-3 sm:gap-4"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 148px), 1fr))',
        }}
      >
        <TerminalOption preset="shell" name="Shell" onClick={() => handleSelect('shell')} />
        <TerminalOption preset="claude" name="Claude" onClick={() => handleSelect('claude')} />
        <TerminalOption preset="codex" name="Codex" onClick={() => handleSelect('codex')} />
        <TerminalOption preset="opencode" name="OpenCode" onClick={() => handleSelect('opencode')} />
      </div>
    </div>
  )
}
