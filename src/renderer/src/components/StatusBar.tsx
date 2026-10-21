import { useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAppStore } from '@/stores/app'
import { useExperimentalStore } from '@/stores/experimental'
import { useI18n } from '@/i18n/useI18n'
import type { MobileHostStatus } from '../../../shared/ipc/remote'
import { mobileRemoteSettings } from '@/lib/mobile-remote-settings'
import remoteDefaults from '../../../shared/remote-defaults.json'
// Note: .agents/notes/remote/android-pairing-handshake.md
export function StatusBar() {
  const { t } = useI18n(); const terminals = useWorkspaceStore((s) => s.terminals); const active = useWorkspaceStore((s) => s.activeTerminalId); const load = useAppStore((s) => s.loadState)
  const [remote, setRemote] = useState<MobileHostStatus | null>(null); const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const enabled = useExperimentalStore(s => s.loaded && s.remoteControl)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const [workspaceId, setWorkspaceId] = useState('')
  const [busy, setBusy] = useState(false)
  const [initialSettings] = useState(() => mobileRemoteSettings(key => localStorage.getItem(key)))
  const [network, setNetwork] = useState(initialSettings.network)
  const [signalUrl, setSignalUrl] = useState(initialSettings.signalUrl)
  const [stunUrl, setStunUrl] = useState(initialSettings.stunUrl)
  const [localAddress, setLocalAddress] = useState('')
  useEffect(() => {
    try {
      for (const [key, value] of Object.entries({ network, signalUrl, stunUrl })) localStorage.setItem(`remote.${key}`, value)
    } catch { /* The current configuration still works when storage is unavailable. */ }
  }, [network, signalUrl, stunUrl])
  const focused = active ? terminals.find((terminal) => terminal.id === active) : null
  const labels: Record<string, string> = { 'no-workspace': t('common:statusBar.waitingWorkspace'), 'workspace-loaded': t('common:statusBar.workspaceLoaded'), 'no-terminal': t('common:statusBar.waitingTerminal'), 'terminal-active': focused ? t('common:statusBar.terminalActiveFocused', { name: focused.name, status: focused.status }) : t('common:statusBar.terminalActiveNoFocus', { count: terminals.length }) }
  useEffect(() => {
    if (!enabled) { setOpen(false); setRemote(null); return }
    let cancelled = false
    const refresh = () => void window.electron.remote.status().then(value => { if (!cancelled) setRemote(value) }).catch(reason => { if (!cancelled) setError(String(reason)) })
    refresh()
    const timer = setInterval(refresh, 1000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [enabled])
  const act = async (action: () => Promise<MobileHostStatus>) => {
    if (busy) return
    setBusy(true)
    setError('')
    try { setRemote(await action()) } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  const selectedWorkspaceId = workspaceId || activeWorkspaceId || ''
  const start = () => {
    const workspace = remote?.workspaces.find(item => item.id === selectedWorkspaceId)
    if (!workspace) { setError(t('common:mobileRemote.workspaceRequired')); return }
    if (network === 'public') {
      try {
        const url = new URL(signalUrl.trim())
        if (url.protocol !== 'wss:' || url.username || url.password || url.hash) throw Error()
      } catch { setError(t('common:mobileRemote.signalRequired')); return }
    }
    void act(() => window.electron.remote.start({ signalUrl: network === 'public' ? signalUrl.trim() : '', stunUrl: stunUrl.trim(),
      workspaceId: workspace.id, localAddress: network === 'lan' ? localAddress || remote?.lanAddresses?.[0]?.address : undefined }))
  }
  const showTerminal = (id: string) => {
    if (!remote?.workspaceId) return
    const store = useWorkspaceStore.getState()
    if (store.activeWorkspaceId !== remote.workspaceId) store.setActiveWorkspace(remote.workspaceId)
    useWorkspaceStore.getState().setActiveTerminal(id)
    useAppStore.getState().setActiveWorkbench(null)
    useAppStore.getState().setLoadState('terminal-active')
    setOpen(false)
  }
  return <footer className="relative col-span-3 flex items-center justify-between px-3.5 text-[10px]" style={{ background: 'var(--shell-chrome)', borderTop: '1px solid var(--shell-border)', color: 'var(--shell-dim)' }}>
    <span><span className="mr-1.5 inline-block h-[5px] w-[5px] rounded-full" style={{ background: 'var(--shell-accent)' }} />{labels[load] ?? t('common:statusBar.ready')}</span>
    {enabled && <div className="flex items-center gap-2">
      {remote?.pending && <span className="text-orange-400">{t('common:mobileRemote.pending')}</span>}
      {remote?.connectedDeviceId && <span>{t('common:mobileRemote.connected', { count: remote.terminals.filter(item => item.alive).length })}</span>}
      <button type="button" aria-expanded={open} onClick={() => setOpen(v => !v)} className="rounded px-2 py-1 hover:bg-[var(--popover-hover)]">{t(remote?.running ? 'common:mobileRemote.running' : 'common:mobileRemote.enable')}</button>
    </div>}
    {enabled && open && <div className="absolute bottom-7 right-2 z-50 max-h-[85vh] w-[min(90vw,24rem)] overflow-auto rounded border border-[var(--shell-border)] bg-[var(--popover-background)] p-3 text-xs text-[var(--shell-text)] shadow-xl">
      <div className="mb-2 flex justify-between"><b>{t('common:mobileRemote.title')}</b><button aria-label={t('common:action.close')} onClick={() => setOpen(false)}>×</button></div>
      <p role="status" className="mb-2">{remote?.pending ? t('common:mobileRemote.approvalStatus') : remote?.state}</p>
      {error && <p role="alert" className="mb-2 text-red-400">{error}</p>}
      <label className="mb-2 block">{t('common:mobileRemote.workspace')}
        <select aria-label={t('common:mobileRemote.workspace')} className="ml-2 max-w-full bg-[var(--popover-background)]" disabled={busy || remote?.running} value={remote?.workspaceId || selectedWorkspaceId} onChange={event => setWorkspaceId(event.target.value)}>
          <option value="" disabled>{t('common:mobileRemote.chooseWorkspace')}</option>
          {remote?.workspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="mb-2 block">{t('common:mobileRemote.network')}
        <select aria-label={t('common:mobileRemote.network')} className="ml-2 bg-[var(--popover-background)]" disabled={busy || remote?.running} value={network} onChange={event => setNetwork(event.target.value)}>
          <option value="lan">{t('common:mobileRemote.lan')}</option>
          <option value="public">{t('common:mobileRemote.public')}</option>
        </select>
      </label>
      {network === 'lan' ? <label className="mb-2 block">{t('common:mobileRemote.localAddress')}
        <select aria-label={t('common:mobileRemote.localAddress')} className="mt-1 w-full bg-[var(--popover-background)]" disabled={busy || remote?.running} value={localAddress || remote?.lanAddresses?.[0]?.address || ''} onChange={event => setLocalAddress(event.target.value)}>
          {remote?.lanAddresses?.map(item => <option key={`${item.name}-${item.address}`} value={item.address}>{item.name} · {item.address}</option>)}
        </select>
      </label> : <label className="mb-2 block">{t('common:mobileRemote.signalUrl')}
        <input aria-label={t('common:mobileRemote.signalUrl')} className="mt-1 w-full rounded border border-[var(--shell-border)] bg-transparent p-1" disabled={busy || remote?.running} value={signalUrl} onChange={event => setSignalUrl(event.target.value)} placeholder={remoteDefaults.signalUrl} spellCheck={false} />
      </label>}
      <p className="mb-2 text-[var(--shell-dim)]">{t(network === 'public' ? 'common:mobileRemote.publicHint' : 'common:mobileRemote.lanHint')}</p>
      <label className="mb-2 block">{t('common:mobileRemote.stunUrl')}
        <input className="mt-1 w-full rounded border border-[var(--shell-border)] bg-transparent p-1" disabled={busy || remote?.running} value={stunUrl} onChange={event => setStunUrl(event.target.value)} placeholder="stun:stun.l.google.com:19302" spellCheck={false} />
      </label>
      {remote?.signalUrl && <p className="mb-2 break-all">{t('common:mobileRemote.actualSignal', { url: remote.signalUrl })}</p>}
      {remote?.qr ? <img alt={t('common:mobileRemote.qrAlt')} className="mx-auto mb-2 h-auto w-full max-w-80 bg-white" style={{ imageRendering: 'pixelated' }} src={remote.qr} /> : <button disabled={busy} className="rounded bg-orange-500 px-3 py-1 text-white" onClick={start}>{t('common:mobileRemote.generateQr')}</button>}
      {remote?.pending && <div className="mt-2">{t('common:mobileRemote.request', { name: remote.pending.name })}
        <button disabled={busy} className="ml-2 rounded bg-green-600 px-2 py-1 text-white" onClick={() => void act(() => window.electron.remote.approve(remote.pending!.id))}>{t('common:mobileRemote.approve')}</button>
        <button disabled={busy} className="ml-1 rounded bg-red-700 px-2 py-1 text-white" onClick={() => void act(() => window.electron.remote.reject())}>{t('common:mobileRemote.reject')}</button>
      </div>}
      {remote?.devices.map(device => <div key={device.id} className="mt-2">{t('common:mobileRemote.authorized', { name: device.name })}
        <button disabled={busy} className="ml-2 underline" onClick={() => void act(() => window.electron.remote.revoke(device.id))}>{t('common:mobileRemote.revoke')}</button>
      </div>)}
      {remote?.terminals.map(item => <div key={item.id} className="mt-2 flex items-center justify-between gap-2">
        <span>{t('common:mobileRemote.terminal', { state: t(item.alive ? 'common:mobileRemote.alive' : 'common:mobileRemote.exited'), pid: item.pid })}</span>
        <button className="shrink-0 underline" onClick={() => showTerminal(item.id)}>{t('common:mobileRemote.showTerminal')}</button>
      </div>)}
      {remote?.running && <button disabled={busy} className="mt-2 rounded bg-[var(--popover-hover)] px-2 py-1" onClick={() => void act(() => window.electron.remote.stop())}>{t('common:mobileRemote.stop')}</button>}
    </div>}
  </footer>
}
