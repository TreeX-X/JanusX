import { useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAppStore } from '@/stores/app'
import { useI18n } from '@/i18n/useI18n'
import type { MobileHostStatus } from '../../../shared/ipc/remote'
export function StatusBar() {
  const { t } = useI18n(); const terminals = useWorkspaceStore((s) => s.terminals); const active = useWorkspaceStore((s) => s.activeTerminalId); const load = useAppStore((s) => s.loadState)
  const [remote, setRemote] = useState<MobileHostStatus | null>(null); const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const focused = active ? terminals.find((terminal) => terminal.id === active) : null
  const labels: Record<string, string> = { 'no-workspace': t('common:statusBar.waitingWorkspace'), 'workspace-loaded': t('common:statusBar.workspaceLoaded'), 'no-terminal': t('common:statusBar.waitingTerminal'), 'terminal-active': focused ? t('common:statusBar.terminalActiveFocused', { name: focused.name, status: focused.status }) : t('common:statusBar.terminalActiveNoFocus', { count: terminals.length }) }
  useEffect(() => {
    let cancelled = false
    const refresh = () => void window.electron.remote.status().then(value => { if (!cancelled) setRemote(value) }).catch(reason => { if (!cancelled) setError(String(reason)) })
    refresh()
    const timer = open ? setInterval(refresh, 1000) : undefined
    return () => { cancelled = true; clearInterval(timer) }
  }, [open])
  const act = async (action: () => Promise<MobileHostStatus>) => {
    setError('')
    try { setRemote(await action()) } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  const start = () => {
    const workspace = remote?.workspaces[0]
    if (!workspace) { setError('请先打开一个工作区'); return }
    void act(() => window.electron.remote.start({ signalUrl: '', stunUrl: 'stun:stun.l.google.com:19302', workspaceId: workspace.id }))
  }
  return <footer className="relative col-span-3 flex items-center justify-between px-3.5 text-[10px]" style={{ background: 'var(--shell-chrome)', borderTop: '1px solid var(--shell-border)', color: 'var(--shell-dim)' }}>
    <span><span className="mr-1.5 inline-block h-[5px] w-[5px] rounded-full" style={{ background: 'var(--shell-accent)' }} />{labels[load] ?? t('common:statusBar.ready')}</span>
    <button type="button" onClick={() => setOpen(v => !v)} className="rounded px-2 py-1 hover:bg-white/[.06]">{remote?.running ? '远程已开启' : '开启手机远程'}</button>
    {open && <div className="absolute bottom-7 right-2 z-50 w-[min(90vw,24rem)] rounded border border-white/10 bg-[#181818] p-3 text-xs text-white shadow-xl">
      <div className="mb-2 flex justify-between"><b>手机远程</b><button onClick={() => setOpen(false)}>×</button></div>
      <p role="status" className="mb-2">{remote?.pending ? '手机已连接，等待你批准' : remote?.state}</p>
      {error && <p role="alert" className="mb-2 text-red-400">{error}</p>}
      {remote?.qr ? <img alt="Mobile pairing QR" className="mx-auto mb-2 h-auto w-full max-w-80 bg-white" style={{ imageRendering: 'pixelated' }} src={remote.qr} /> : <button className="rounded bg-orange-500 px-3 py-1 text-white" onClick={start}>开启并生成二维码</button>}
      {remote?.pending && <div className="mt-2">设备申请：{remote.pending.name}
        <button className="ml-2 rounded bg-green-600 px-2 py-1 text-white" onClick={() => void act(() => window.electron.remote.approve(remote.pending!.id))}>批准</button>
        <button className="ml-1 rounded bg-red-700 px-2 py-1 text-white" onClick={() => void act(() => window.electron.remote.reject())}>拒绝</button>
      </div>}
      {remote?.devices.map(device => <div key={device.id} className="mt-2">已授权：{device.name}</div>)}
      {remote?.running && <button className="mt-2 rounded bg-white/10 px-2 py-1" onClick={() => void act(() => window.electron.remote.stop())}>关闭远程</button>}
    </div>}
  </footer>
}
