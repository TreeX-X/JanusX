import { useEffect, useState } from 'react'
import type { OfficeInstallerProgressEvent, OfficeManagedInstallStatus } from '../../../../shared/office'
import { officeService } from '@/services/office'

// Note: 安装弹窗沿用 shell 中性灰 + 幽灵按钮语言，accent 只做 1px 边框与文字，不做实底色块 — see .agents/notes/implemented/process/2026-09-17-landing-page.md

const BTN_BASE = 'rounded-md border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[rgb(244_125_67/0.42)] disabled:opacity-40 disabled:cursor-not-allowed'
const BTN_ACCENT = 'border-[rgb(244_125_67/0.42)] text-[#ff9159] hover:bg-[rgb(244_125_67/0.08)]'
const BTN_GHOST = 'border-white/10 text-[#a1a1a1] hover:bg-white/5 hover:text-white'
const BTN_DANGER = 'border-red-500/30 text-red-300 hover:bg-red-500/10'

export function OfficeSetupGate({ workspaceId, onClose, onReady }: {
  workspaceId: string
  onClose: () => void
  onReady: () => void
}) {
  const [status, setStatus] = useState<OfficeManagedInstallStatus>()
  const [progress, setProgress] = useState<OfficeInstallerProgressEvent>()
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string>()

  const refresh = async () => {
    const result = await officeService.installerStatus({ workspaceId })
    if (result.ok) setStatus(result.value)
    else setError(result.error.message)
  }
  useEffect(() => { void refresh() }, [workspaceId])
  useEffect(() => officeService.onInstallerProgress((event) => {
    setProgress(event)
    if (event.stage === 'complete' || event.stage === 'failed') void refresh()
  }), [workspaceId])

  const install = async (repair: boolean) => {
    if (!confirmed) return
    setError(undefined)
    const result = await officeService.installerStart({ workspaceId, confirmed: true, repair })
    if (!result.ok) { setError(result.error.message); return }
    setStatus(result.value)
    onReady()
  }
  const remove = async () => {
    if (!confirmed) return
    const result = await officeService.installerRemove({ workspaceId, confirmed: true })
    if (result.ok) { setStatus(result.value); setProgress(undefined) }
    else setError(result.error.message)
  }

  return <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
    <div className="w-full max-w-md rounded-[10px] border border-white/[0.07] bg-[#1c1c1f] p-4 text-xs text-[#a1a1a1] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_20px_60px_rgba(0,0,0,0.7)]">
      <div className="mb-1 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[1.2px] text-[#737373]">Render engine</div>
          <strong className="text-sm font-semibold text-[#fafafa]">Office 渲染引擎</strong>
        </div>
        <button onClick={onClose} aria-label="Close OfficeCLI setup" className="rounded px-1.5 py-0.5 text-[#737373] hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-[rgb(244_125_67/0.42)]">×</button>
      </div>
      <div className="space-y-1 break-all font-mono text-[11px] text-[#737373]">
        <div>Version: <span className="text-[#a1a1a1]">{status?.version ?? '1.0.135'}</span></div>
        <div>Source: <span className="text-[#a1a1a1]">{status?.source ?? 'Official pinned GitHub release'}</span></div>
        <div>SHA256: <span className="text-[#a1a1a1]">{status?.sha256 ?? 'Loading…'}</span></div>
        <div>Location: <span className="text-[#a1a1a1]">{status?.location ?? 'JanusX managed user-data'}</span></div>
      </div>
      <p className="mt-3 text-[#737373]">Install/repair downloads only after this confirmation. JanusX does not edit OS PATH. Existing terminals must restart.</p>
      <p className="mt-2 text-[#737373]">PATH, policy and MCP improve normal compliance, but unrestricted shell/filesystem access can bypass them.</p>
      {progress && <div className="mt-3 font-mono text-[11px] text-[#737373]">{progress.stage}{progress.percent !== undefined ? ` ${progress.percent}%` : ''}{progress.message ? ` — ${progress.message}` : ''}</div>}
      {(error || status?.error) && <div className="mt-2 text-[#ff6b6b]">{error ?? status?.error}</div>}
      <label className="mt-3 flex gap-2 text-[#737373]"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="accent-[#f47d43]" />I understand and explicitly authorize this operation.</label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={!confirmed || status?.state === 'busy'} onClick={() => void install(false)} className={`${BTN_BASE} ${BTN_ACCENT}`}>Install</button>
        <button disabled={!confirmed || status?.state === 'busy'} onClick={() => void install(true)} className={`${BTN_BASE} ${BTN_GHOST}`}>Repair</button>
        <button disabled={status?.state !== 'busy'} onClick={() => void officeService.installerCancel({ workspaceId })} className={`${BTN_BASE} ${BTN_GHOST}`}>Cancel</button>
        <button disabled={!confirmed || status?.state !== 'ready'} onClick={() => void remove()} className={`${BTN_BASE} ${BTN_DANGER}`}>Remove managed copy</button>
      </div>
    </div>
  </div>
}
