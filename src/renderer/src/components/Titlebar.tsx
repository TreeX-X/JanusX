import { useState, useCallback } from 'react'
import appIcon from '@/assets/icons/app-icon.svg'

export function Titlebar() {
  const [expanded, setExpanded] = useState(false)

  const handleIslandDblClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded((prev) => !prev)
  }, [])

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

      {/* Logo 左移 */}
      <div className="absolute left-[70px] flex items-center gap-1.5 text-[13px] font-medium text-[#888] tracking-[0.3px] titlebar-no-drag">
        <img src={appIcon} alt="SwitchX" className="w-4 h-4" />
        <span>SwitchX</span>
      </div>

      {/* 灵动岛 — 绝对定位允许向下溢出标题栏 */}
      <div
        className="absolute left-1/2 top-0 -translate-x-1/2 titlebar-no-drag"
        style={{ zIndex: 2000, perspective: '1000px' }}
      >
        <div
          onDoubleClick={handleIslandDblClick}
          className="flex items-center justify-center cursor-pointer select-none"
          style={{
            width: expanded ? 530 : 110,
            height: expanded ? 205 : 28,
            borderRadius: expanded ? 20 : 14,
            padding: expanded ? '14px 16px' : '0 10px',
            marginTop: expanded ? 5 : 5,
            background: '#000000',
            border: expanded
              ? '1px solid rgba(255, 120, 48, 0.25)'
              : '1px solid rgba(255, 255, 255, 0.12)',
            flexDirection: expanded ? 'column' : 'row',
            alignItems: expanded ? 'stretch' : 'center',
            justifyContent: expanded ? 'space-between' : 'center',
            transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.15)',
            boxShadow: expanded
              ? '0 16px 40px rgba(0, 0, 0, 0.95), 0 0 20px rgba(255, 120, 48, 0.08)'
              : '0 4px 12px rgba(0, 0, 0, 0.5)',
            gap: expanded ? 0 : 6,
          }}
        >
          {/* 折叠态：迷你胶囊 */}
          {!expanded && (
            <div className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: '#ff7830',
                  boxShadow: '0 0 8px rgba(255, 120, 48, 0.7)',
                  animation: 'pulse-breathing 1.5s ease-in-out infinite',
                }}
              />
              <span className="text-[11px] font-semibold text-[#a1a1aa] tracking-[0.2px]">
                SwitchX
              </span>
            </div>
          )}

          {/* 展开态：空面板 */}
          {expanded && (
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
    </div>
  )
}
