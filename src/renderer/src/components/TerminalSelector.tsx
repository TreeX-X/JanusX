import { useCallback, useEffect } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAppStore } from '@/stores/app'
import type { TerminalPreset, Terminal } from '@/types'

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

interface TerminalOptionProps {
  preset: TerminalPreset
  name: string
  onClick: () => void
}

function TerminalOption({ preset, name, onClick }: TerminalOptionProps) {
  return (
    <div
      onClick={onClick}
      className="p-6 px-6 rounded-lg cursor-pointer transition-all flex flex-col items-center gap-3 min-w-[140px]"
      style={{
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
        e.currentTarget.style.borderColor = 'rgba(255, 120, 48, 0.3)'
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <div className="w-12 h-12 flex items-center justify-center">
        <img src={ICONS[preset]} alt={name} className="w-10 h-10" />
      </div>
      <div className="text-xs font-medium text-[#d4d4d4]">{name}</div>
    </div>
  )
}

export function TerminalSelector() {
  const { activeWorkspaceId, addTerminal, addLog } = useWorkspaceStore()
  const setLoadState = useAppStore((s) => s.setLoadState)

  // 监听 checkpoint 初始化事件（终端创建后由主进程发送）
  useEffect(() => {
    const unsub = window.electron.on('checkpoint:ready', (payload: unknown) => {
      const { terminalId, success, error } = payload as { terminalId: string; success: boolean; error?: string }
      if (success) {
        addLog('info', `[还原点] 终端 ${terminalId.slice(0, 8)} checkpoint 系统就绪`)
      } else {
        addLog('error', `[还原点] 终端 ${terminalId.slice(0, 8)} 初始化失败: ${error}`)
      }
    })
    return unsub
  }, [addLog])

  const handleSelect = useCallback(
    async (preset: TerminalPreset) => {
      if (!activeWorkspaceId) return

      const workspaces = useWorkspaceStore.getState().workspaces
      const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
      if (!workspace) return

      const autoCommands: Record<TerminalPreset, string | undefined> = {
        shell: undefined,
        claude: 'claude',
        codex: 'codex',
        opencode: 'opencode',
      }

      const presetNames: Record<TerminalPreset, string> = {
        shell: 'bash',
        claude: 'claude',
        codex: 'codex',
        opencode: 'opencode',
      }

      // 通过 IPC 获取系统默认 Shell
      const defaultShell = (await window.electron.invoke('system:getDefaultShell')) as string

      const terminalId = crypto.randomUUID()
      const terminal: Terminal = {
        id: terminalId,
        workspaceId: activeWorkspaceId,
        name: presetNames[preset],
        preset,
        cwd: workspace.path,
        shell: defaultShell,
        autoCommand: autoCommands[preset],
        pid: null,
        status: 'idle',
      }

      addTerminal(terminal)
      addLog('info', `[终端] 创建 ${presetNames[preset]} 终端 (${terminalId.slice(0, 8)})，等待 checkpoint 初始化...`)

      // 先切换视图 → TerminalArea 挂载并注册 checkpoint:ready 监听
      setLoadState('terminal-active')

      try {
        const result = (await window.electron.invoke('terminal:create', {
          id: terminalId,
          workspaceId: activeWorkspaceId,
          cwd: workspace.path,
          shell: defaultShell,
          autoCommand: autoCommands[preset],
          preset,
        })) as { pid: number }

        useWorkspaceStore.setState((s) => ({
          terminals: s.terminals.map((t) =>
            t.id === terminalId ? { ...t, pid: result.pid, status: 'running' as const } : t
          ),
        }))
      } catch (err) {
        console.error('Failed to create terminal:', err)
      }
    },
    [activeWorkspaceId, addTerminal, setLoadState, addLog]
  )

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-10">
      <div className="text-sm text-[#666] text-center mb-2">选择终端类型</div>
      <div className="grid grid-cols-4 gap-4 max-w-[800px]">
        <TerminalOption preset="shell" name="Shell" onClick={() => handleSelect('shell')} />
        <TerminalOption preset="claude" name="Claude" onClick={() => handleSelect('claude')} />
        <TerminalOption preset="codex" name="Codex" onClick={() => handleSelect('codex')} />
        <TerminalOption preset="opencode" name="OpenCode" onClick={() => handleSelect('opencode')} />
      </div>
    </div>
  )
}
