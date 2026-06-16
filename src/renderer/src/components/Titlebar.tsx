import { useState, useCallback } from 'react'
import appIcon from '@/assets/icons/app-icon.svg'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAppStore } from '@/stores/app'
import { JanusIsland, JanusExpanded } from '@/components/janus'
import type { JanusMode } from '@/components/janus'

/* ════════════════════════════════════════════════════════════
   Titlebar — 标题栏（简化版）
   灵动岛逻辑已提取至 janus/ 模块
   ════════════════════════════════════════════════════════════ */

export function Titlebar() {
  const [expanded, setExpanded] = useState(false)
  const [isRunning, setIsRunning] = useState(false)

  const blueprintMode = useAppStore((s) => s.blueprintMode)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)

  /*-- Janus 模式 --*/
  const janusMode: JanusMode = !activeWorkspace
    ? 'sleep'
    : isRunning
      ? 'running'
      : blueprintMode
        ? 'analytics'
        : 'order'

  const handleExpand = useCallback(() => {
    setExpanded(true)
  }, [])

  const handleCollapse = useCallback(() => {
    setExpanded(false)
  }, [])

  const handleRunningChange = useCallback((running: boolean) => {
    setIsRunning(running)
  }, [])

  return (
    <div
      className="h-[38px] flex items-center px-3.5 select-none titlebar-drag relative overflow-visible"
      style={{
        background: 'rgba(12, 12, 12, 0.9)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        zIndex: 9999,
      }}
    >
      {/* 红绿灯 */}
      <div className="flex gap-2 titlebar-no-drag">
        <div
          onClick={() => window.electron.invoke('window:close')}
          className="w-3 h-3 rounded-full bg-[#ff5f57] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] cursor-pointer hover:brightness-110 active:brightness-90"
        />
        <div
          onClick={() => window.electron.invoke('window:minimize')}
          className="w-3 h-3 rounded-full bg-[#ffbd2e] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] cursor-pointer hover:brightness-110 active:brightness-90"
        />
        <div
          onClick={() => window.electron.invoke('window:maximize')}
          className="w-3 h-3 rounded-full bg-[#28c840] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] cursor-pointer hover:brightness-110 active:brightness-90"
        />
      </div>

      {/* Logo */}
      <div className="absolute left-[70px] flex items-center gap-1.5 text-[13px] font-medium text-[#888] tracking-[0.3px] titlebar-no-drag">
        <img src={appIcon} alt="JanusX" className="w-4 h-4" />
        <span>JanusX</span>
      </div>

      {/* 灵动岛 */}
      <div
        className="absolute left-1/2 top-0 -translate-x-1/2 titlebar-no-drag"
        style={{ zIndex: 2000 }}
      >
        {!expanded && (
          <JanusIsland
            onExpand={handleExpand}
            onRunningChange={handleRunningChange}
          />
        )}
      </div>

      {/* 展开面板 */}
      {expanded && (
        <JanusExpanded
          mode={janusMode}
          isRunning={isRunning}
          onCollapse={handleCollapse}
        />
      )}
    </div>
  )
}
