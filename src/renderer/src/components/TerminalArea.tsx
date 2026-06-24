import { useState, useCallback, useEffect, useRef } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAppStore } from '@/stores/app'
import { CLITerminal } from './CLITerminal'
import type { TerminalPreset, Terminal } from '@/types'

import terminalIcon from '@/assets/icons/terminal.svg'
import claudeIcon from '@/assets/icons/claude.svg'
import codexIcon from '@/assets/icons/codex.svg'
import opencodeIcon from '@/assets/icons/opencode.svg'

const PRESETS: { type: TerminalPreset; name: string; icon: string; autoCommand?: string }[] = [
  { type: 'shell', name: 'Shell', icon: terminalIcon },
  { type: 'claude', name: 'Claude', icon: claudeIcon, autoCommand: 'claude' },
  { type: 'codex', name: 'Codex', icon: codexIcon, autoCommand: 'codex' },
  { type: 'opencode', name: 'OpenCode', icon: opencodeIcon, autoCommand: 'opencode' },
]

function waitForTerminalMount(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

export function TerminalArea() {
  const { terminals, activeTerminalId, activeWorkspaceId, addTerminal, setActiveTerminal, removeTerminal, logs, addLog, clearLogs } = useWorkspaceStore()
  const setLoadState = useAppStore((s) => s.setLoadState)
  const setBlueprintMode = useAppStore((s) => s.setBlueprintMode)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [ringOpen, setRingOpen] = useState(false)
  const ringRef = useRef<HTMLDivElement>(null)
  const addBtnRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭弹出环
  useEffect(() => {
    if (!ringOpen) return
    const handler = (e: MouseEvent) => {
      if (
        ringRef.current && !ringRef.current.contains(e.target as Node) &&
        addBtnRef.current && !addBtnRef.current.contains(e.target as Node)
      ) {
        setRingOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ringOpen])

  // 监听 checkpoint 初始化事件 → 写入日志
  useEffect(() => {
    const unsubReady = window.electron.on('checkpoint:ready', (payload: unknown) => {
      const { terminalId, success, error } = payload as { terminalId: string; success: boolean; error?: string }
      if (success) {
        addLog('info', `[还原点] 终端 ${terminalId.slice(0, 8)} checkpoint 系统就绪`)
      } else {
        addLog('error', `[还原点] 终端 ${terminalId.slice(0, 8)} 初始化失败: ${error}`)
      }
    })
    const unsubEvent = window.electron.on('checkpoint:event', (payload: unknown) => {
      const { type, checkpointId } = payload as { type: string; checkpointId: string }
      addLog('info', `[还原点] ${type} — ${checkpointId.slice(0, 8)}`)
    })
    return () => { unsubReady(); unsubEvent() }
  }, [addLog])

  const handleClose = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        await window.electron.invoke('terminal:kill', { id })
      } catch {
        // ignore
      }
      removeTerminal(id)
      const remaining = useWorkspaceStore.getState().terminals.filter((t) => t.id !== id)
      if (remaining.length === 0) {
        setLoadState('no-terminal')
      }
    },
    [removeTerminal, setLoadState]
  )

  const handlePresetSelect = useCallback(
    async (preset: typeof PRESETS[number]) => {
      setRingOpen(false)
      if (!activeWorkspaceId) return

      const workspaces = useWorkspaceStore.getState().workspaces
      const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
      if (!workspace) return

      const defaultShell = (await window.electron.invoke('system:getDefaultShell')) as string
      const terminalId = crypto.randomUUID()

      const terminal: Terminal = {
        id: terminalId,
        workspaceId: activeWorkspaceId,
        name: preset.name.toLowerCase(),
        preset: preset.type,
        cwd: workspace.path,
        shell: defaultShell,
        autoCommand: preset.autoCommand,
        pid: null,
        status: 'idle',
      }

      addTerminal(terminal)
      addLog('info', `[终端] 创建 ${preset.name} 终端 (${terminalId.slice(0, 8)})，等待 checkpoint 初始化...`)
      setBlueprintMode(false)
      setLoadState('terminal-active')
      await waitForTerminalMount()

      try {
        const result = (await window.electron.invoke('terminal:create', {
          id: terminalId,
          workspaceId: activeWorkspaceId,
          cwd: workspace.path,
          shell: defaultShell,
          autoCommand: preset.autoCommand,
          preset: preset.type,
        })) as { pid: number }

        useWorkspaceStore.setState((s) => ({
          terminals: s.terminals.map((t) =>
            t.id === terminalId ? { ...t, pid: result.pid, status: 'running' as const } : t
          ),
        }))
      } catch (err) {
        console.error('Failed to create terminal:', err)
        addLog('error', `[终端] 创建失败: ${(err as Error).message}`)
        removeTerminal(terminalId)
        if (useWorkspaceStore.getState().terminals.length === 0) {
          setLoadState('no-terminal')
        }
      }
    },
    [activeWorkspaceId, addTerminal, removeTerminal, setLoadState, setBlueprintMode, addLog]
  )

  return (
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, rgba(19, 19, 19, 0.96) 0%, rgba(8, 8, 8, 0.98) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -24px 40px rgba(0,0,0,0.22)',
      }}
    >
      {/* Tab 栏 */}
      <div
        className="flex overflow-x-auto gap-px px-2.5"
        style={{
          background: '#111111',
          borderBottom: '1px solid rgba(255, 255, 255, 0.035)',
          scrollbarWidth: 'none',
        }}
      >
        {terminals.map((t) => (
          <div
            key={t.id}
            onClick={() => setActiveTerminal(t.id)}
            className="h-8 px-3 text-[11px] leading-none cursor-pointer flex items-center gap-2 rounded-none mt-0 font-mono relative transition-colors select-none group/tab"
            style={{
              color: t.id === activeTerminalId ? '#ff7830' : 'rgba(104, 104, 104, 0.82)',
              background: t.id === activeTerminalId ? 'rgba(255, 255, 255, 0.025)' : 'transparent',
              boxShadow: 'none',
            }}
          >
            <span className="flex h-4 min-w-0 items-center leading-none">{t.name}</span>
            <button
              type="button"
              aria-label={`关闭 ${t.name} 终端`}
              onClick={(e) => handleClose(t.id, e)}
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border-0 bg-transparent p-0 font-sans text-[13px] leading-none opacity-0 transition-[opacity,color,background] group-hover/tab:opacity-40 hover:!opacity-100 cursor-pointer"
              style={{ color: '#888', lineHeight: 1 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ff7830' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#888' }}
            >
              ×
            </button>
            {t.id === activeTerminalId && (
              <div
                className="absolute bottom-0 left-0 right-0 h-px"
                style={{ background: '#ff7830' }}
              />
            )}
          </div>
        ))}
        <div
          ref={addBtnRef}
          onClick={() => setRingOpen((v) => !v)}
          className="h-8 px-3 text-[12px] leading-none cursor-pointer rounded-none mt-0 font-mono transition-colors select-none ml-auto flex items-center"
          style={{ color: '#ff7830' }}
          onMouseEnter={(e) => { if (!ringOpen) e.currentTarget.style.color = '#ff7830' }}
          onMouseLeave={(e) => { if (!ringOpen) e.currentTarget.style.color = '#ff7830' }}
        >
          +
        </div>
      </div>

      {/* 终端类型选择弹出环 */}
      <div
        ref={ringRef}
        className="absolute z-50 flex gap-1.5 px-3 py-2 transition-all"
        style={{
          top: '36px',
          right: '8px',
          background: 'rgba(18, 18, 18, 0.9)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '24px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.42)',
          opacity: ringOpen ? 1 : 0,
          pointerEvents: ringOpen ? 'auto' : 'none',
          transform: ringOpen ? 'translateY(0)' : 'translateY(4px)',
        }}
      >
        {PRESETS.map((preset) => (
          <div
            key={preset.type}
            onClick={() => handlePresetSelect(preset)}
            className="flex flex-col items-center gap-1 cursor-pointer transition-transform"
            style={{ transform: 'translateY(0)' }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
              style={{
                border: '1.5px solid rgba(255, 255, 255, 0.08)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 120, 48, 0.4)'
                e.currentTarget.style.background = 'rgba(255, 120, 48, 0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <img src={preset.icon} alt={preset.name} className="w-4 h-4" />
            </div>
            <span className="text-[9px] tracking-wider" style={{ color: '#555', fontFamily: '-apple-system, sans-serif' }}>
              {preset.name}
            </span>
          </div>
        ))}
      </div>

      {/* 终端内容区 */}
      <div
        className="flex-1 relative overflow-hidden mx-1.5 my-1"
        style={{
          background: 'linear-gradient(180deg, rgba(9, 9, 9, 0.96) 0%, rgba(4, 4, 4, 0.98) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.03)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.025)',
        }}
      >
        {terminals.map((t) => (
          <div
            key={t.id}
            className="absolute inset-0"
            style={{ display: t.id === activeTerminalId ? 'block' : 'none' }}
          >
            <CLITerminal terminalId={t.id} />
          </div>
        ))}
        {terminals.length === 0 && (
          <div className="flex items-center justify-center h-full text-[#666] text-sm font-mono">
            等待加载终端...
          </div>
        )}
      </div>

      {/* 输出抽屉 */}
      <div
        className="flex-shrink-0 transition-all overflow-hidden"
        style={{
          background: '#101010',
          borderTop: '1px solid rgba(255, 255, 255, 0.035)',
          height: drawerOpen ? '180px' : '28px',
        }}
      >
        <div
          className="h-7 flex items-center justify-between px-3 cursor-pointer select-none hover:bg-[rgba(255,255,255,0.012)] transition-colors"
          onClick={() => setDrawerOpen((v) => !v)}
        >
          <div className="text-[11px] text-[#666] flex items-center gap-1.5">
            <div
              className="w-2 h-2 border-r-[1.5px] border-b-[1.5px] transition-transform"
              style={{
                borderColor: '#ff7830',
                transform: drawerOpen ? 'rotate(45deg)' : 'rotate(-45deg)',
              }}
            />
            <span>输出</span>
          </div>
          <span className="text-[10px] text-[#555]">
            {drawerOpen ? '点击折叠' : '点击展开'}
          </span>
        </div>
        {drawerOpen && (
          <div className="flex-1 p-2.5 px-3 text-[11px] font-mono leading-relaxed overflow-y-auto" style={{ height: 'calc(100% - 28px)' }}>
            {logs.length === 0 && (
              <div style={{ color: '#444' }}>暂无日志</div>
            )}
            {logs.map((log, i) => {
              const time = new Date(log.time).toLocaleTimeString('zh-CN', { hour12: false })
              const color = log.level === 'error' ? '#e06c75' : log.level === 'warn' ? '#e5c07b' : '#666'
              return (
                <div key={i} style={{ color, marginBottom: 2 }}>
                  <span style={{ color: '#444', marginRight: 6 }}>{time}</span>
                  {log.message}
                </div>
              )
            })}
            {logs.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); clearLogs() }}
                className="mt-1 cursor-pointer"
                style={{ background: 'none', border: 'none', color: '#444', fontSize: 10, padding: 0 }}
              >
                清空日志
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
