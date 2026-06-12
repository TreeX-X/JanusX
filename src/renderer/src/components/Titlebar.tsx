import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import appIcon from '@/assets/icons/app-icon.svg'
import { useWorkspaceStore } from '@/stores/workspace'

export function Titlebar() {
  const [expanded, setExpanded] = useState(false)
  const [collapsing, setCollapsing] = useState(false)
  const [switching, setSwitching] = useState(false)
  const switchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 监听工作区切换 → 触发灵动岛过渡动画
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)

  useEffect(() => {
    if (!activeWorkspaceId) return

    setSwitching(true)

    if (switchTimer.current) clearTimeout(switchTimer.current)
    switchTimer.current = setTimeout(() => {
      setSwitching(false)
      switchTimer.current = null
    }, 1800)

    return () => {
      if (switchTimer.current) {
        clearTimeout(switchTimer.current)
        switchTimer.current = null
      }
    }
  }, [activeWorkspaceId])

  const handleExpand = useCallback(() => {
    setCollapsing(false)
    setExpanded(true)
  }, [])

  const handleCollapse = useCallback(() => {
    setCollapsing(true)
  }, [])

  const handleCollapseEnd = useCallback(() => {
    setExpanded(false)
    setCollapsing(false)
  }, [])

  const handleIslandDblClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (expanded) {
      handleCollapse()
    } else {
      handleExpand()
    }
  }, [expanded, handleExpand, handleCollapse])

  const portalVisible = expanded || collapsing

  // Expanded/collapsing island rendered via portal at body level
  const portalIsland = portalVisible && createPortal(
    <div
      className="fixed inset-0 titlebar-no-drag"
      style={{ zIndex: 99999 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{
          animation: collapsing
            ? 'backdrop-out 0.3s ease-in forwards'
            : 'backdrop-in 0.2s ease-out',
        }}
        onClick={handleCollapse}
      />

      {/* Centered island */}
      <div
        className="absolute left-1/2"
        style={{
          top: 38,
          transform: 'translateX(-50%)',
        }}
      >
        <div
          onDoubleClick={handleIslandDblClick}
          className="flex items-center justify-center cursor-pointer select-none"
          style={{
            width: collapsing ? 110 : 530,
            height: collapsing ? 28 : 205,
            borderRadius: collapsing ? 14 : 20,
            padding: collapsing ? '0 10px' : '14px 16px',
            background: '#000000',
            border: '1px solid rgba(255, 120, 48, 0.25)',
            flexDirection: collapsing ? 'row' : 'column',
            alignItems: collapsing ? 'center' : 'stretch',
            justifyContent: collapsing ? 'center' : 'space-between',
            boxShadow: collapsing
              ? '0 4px 12px rgba(0, 0, 0, 0.5)'
              : '0 16px 40px rgba(0, 0, 0, 0.95), 0 0 20px rgba(255, 120, 48, 0.08)',
            animation: collapsing
              ? 'island-collapse 0.3s cubic-bezier(0.55, 0, 1, 0.45) forwards'
              : 'island-expand 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            gap: collapsing ? 6 : 0,
          }}
          onAnimationEnd={collapsing ? handleCollapseEnd : undefined}
        >
          {/* Collapsing state: mini capsule content */}
          {collapsing && (
            <div className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: '#ff7830',
                  boxShadow: '0 0 8px rgba(255, 120, 48, 0.7)',
                }}
              />
              <span className="text-[11px] font-semibold text-[#a1a1aa] tracking-[0.2px]">
                SwitchX
              </span>
            </div>
          )}

          {/* Expanded state: full panel */}
          {!collapsing && (
            <div className="flex flex-col h-full justify-between">
              <div
                className="flex justify-between items-center pb-1.5"
                style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}
              >
                <div className="text-[11px] font-bold uppercase tracking-[1px] text-[#ff7830] flex items-center gap-1.5">
                  <span>⚡</span> SwitchX
                </div>
                <div className="text-[9px] text-[#52525b]">双击收合</div>
              </div>

              <div className="flex-1 flex items-center justify-center text-[#333] text-xs">
                {/* 后续补充灵动岛功能 */}
              </div>

              <div
                className="flex justify-between items-center pt-1.5 text-[10px] text-[#71717a]"
                style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}
              >
                <span>Dynamic Island</span>
                <span className="text-[9px] text-[#52525b]">v0.1</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )

  return (
    <div
      className="h-[38px] flex items-center px-3.5 select-none titlebar-drag relative overflow-visible"
      style={{
        background: 'rgba(12, 12, 12, 0.9)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
      }}
    >
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
        <img src={appIcon} alt="SwitchX" className="w-4 h-4" />
        <span>SwitchX</span>
      </div>

      {/* 灵动岛 — 折叠态内嵌在标题栏 */}
      <div
        className="absolute left-1/2 top-0 -translate-x-1/2 titlebar-no-drag"
        style={{ zIndex: 2000 }}
      >
        {!expanded && !collapsing && (
          <div
            onDoubleClick={handleIslandDblClick}
            className="flex items-center justify-center cursor-pointer select-none"
            style={{
              width: switching ? 180 : 110,
              height: 28,
              borderRadius: 14,
              padding: '0 12px',
              marginTop: 5,
              background: '#000000',
              border: switching
                ? '1px solid rgba(255, 120, 48, 0.4)'
                : '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: switching
                ? '0 4px 20px rgba(255, 120, 48, 0.2), 0 0 12px rgba(255, 120, 48, 0.1)'
                : '0 4px 12px rgba(0, 0, 0, 0.5)',
              transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              gap: 6,
              overflow: 'hidden',
            }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  background: '#ff7830',
                  boxShadow: switching
                    ? '0 0 12px rgba(255, 120, 48, 0.9)'
                    : '0 0 8px rgba(255, 120, 48, 0.7)',
                  animation: switching ? 'none' : 'pulse-breathing 1.5s ease-in-out infinite',
                  transition: 'box-shadow 0.3s ease',
                }}
              />
              <span
                className="text-[11px] font-semibold tracking-[0.2px] whitespace-nowrap"
                style={{
                  color: activeWorkspace ? '#ff7830' : '#a1a1aa',
                  transition: 'color 0.3s ease',
                }}
              >
                {activeWorkspace ? activeWorkspace.name : 'SwitchX'}
              </span>
            </div>
          </div>
        )}
      </div>

      {portalIsland}
    </div>
  )
}
