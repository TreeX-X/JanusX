import { useEffect, useState } from 'react'
import type { OfficeInstallerProgressEvent, OfficeManagedInstallStatus } from '../../../../shared/office'
import { officeService } from '@/services/office'

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

  return <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-4">
    <div className="w-full max-w-md rounded-lg border border-white/10 bg-[#171717] p-4 text-xs text-[#bbb] shadow-2xl">
      <div className="mb-3 flex items-center justify-between"><strong className="text-[#ff7830]">Managed OfficeCLI</strong><button onClick={onClose} aria-label="Close OfficeCLI setup">×</button></div>
      <div className="space-y-1 break-all">
        <div>Version: {status?.version ?? '1.0.135'}</div>
        <div>Source: {status?.source ?? 'Official pinned GitHub release'}</div>
        <div>SHA256: {status?.sha256 ?? 'Loading…'}</div>
        <div>Location: {status?.location ?? 'JanusX managed user-data'}</div>
      </div>
      <p className="mt-3 text-[#888]">Install/repair downloads only after this confirmation. JanusX does not edit OS PATH. Existing terminals must restart.</p>
      <p className="mt-2 text-[#888]">PATH, policy and MCP improve normal compliance, but unrestricted shell/filesystem access can bypass them.</p>
      {progress && <div className="mt-3">{progress.stage}{progress.percent !== undefined ? ` ${progress.percent}%` : ''}{progress.message ? ` — ${progress.message}` : ''}</div>}
      {(error || status?.error) && <div className="mt-2 text-red-400">{error ?? status?.error}</div>}
      <label className="mt-3 flex gap-2"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I understand and explicitly authorize this operation.</label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={!confirmed || status?.state === 'busy'} onClick={() => void install(false)} className="rounded bg-[#ff7830] px-3 py-1 text-black disabled:opacity-40">Install</button>
        <button disabled={!confirmed || status?.state === 'busy'} onClick={() => void install(true)} className="rounded border border-white/10 px-3 py-1 disabled:opacity-40">Repair</button>
        <button disabled={status?.state !== 'busy'} onClick={() => void officeService.installerCancel({ workspaceId })} className="rounded border border-white/10 px-3 py-1 disabled:opacity-40">Cancel</button>
        <button disabled={!confirmed || status?.state !== 'ready'} onClick={() => void remove()} className="rounded border border-red-500/30 px-3 py-1 text-red-300 disabled:opacity-40">Remove managed copy</button>
      </div>
    </div>
  </div>
}
