import appIcon from '@/assets/icons/app-icon.svg'

export function Titlebar() {
  return (
    <div
      className="h-[38px] flex items-center px-3.5 select-none titlebar-drag"
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
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-[13px] font-medium text-[#888] tracking-[0.3px]">
        <img src={appIcon} alt="SwitchX" className="w-4 h-4" />
        <span>SwitchX</span>
      </div>
    </div>
  )
}
