// Note: workspace setup keeps technical diagnostics behind an explicit detail control — see .agents/notes/blueprint/requirements/blueprint-empty-init.md
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, FilePlus2, FolderOpen, LoaderCircle, Network, RefreshCw } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { useBlueprintStore, type BlueprintWorkspaceState } from '@/stores/blueprint'
import { useWorkspaceStore } from '@/stores/workspace'
import { useEditorStore } from '@/stores/editor'
import type { Workspace } from '@/types'
import type { HarnessInitPreview } from '../../../../shared/ipc/harness'
import './blueprint-workspace.css'

export function BlueprintWorkspaceSetup({ workspace, state, loading, hasNodes }: {
  workspace?: Workspace; state?: BlueprintWorkspaceState; loading: boolean; hasNodes: boolean
}) {
  const { t } = useI18n('blueprint')
  const [preview, setPreview] = useState<{ workspaceId: string; value: HarnessInitPreview } | null>(null)
  const receipts = useBlueprintStore(state => state.initializationReceipts)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<{ workspaceId: string; message: string } | null>(null)
  const initializeRef = useRef<HTMLButtonElement>(null)
  const previewHeadingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (preview) previewHeadingRef.current?.focus() }, [preview])
  if (!workspace) return null
  const currentPreview = preview?.workspaceId === workspace.id ? preview.value : null
  const receipt = receipts[workspace.id]
  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(workspace.id); setError(null)
    try { await action() } catch (reason) {
      setError({ workspaceId: workspace.id, message: reason && typeof reason === 'object' && 'message' in reason ? String(reason.message) : String(reason) })
    } finally { setBusy(null) }
  }
  const refresh = async () => {
    if (useWorkspaceStore.getState().activeWorkspaceId === workspace.id) await useBlueprintStore.getState().loadWorkspace(workspace.id)
    await useBlueprintStore.getState().refreshWorkspaceStates()
  }
  const begin = () => run(async () => {
    const value = await window.electron.harness.initPreview(workspace.path, workspace.name)
    setConfirmed(false); setPreview({ workspaceId: workspace.id, value })
  })
  const apply = () => run(async () => {
    if (!currentPreview) return
    const result = await window.electron.harness.initApply(workspace.path, currentPreview.id, confirmed)
    useBlueprintStore.setState(previous => ({ initializationReceipts: { ...previous.initializationReceipts, [workspace.id]: currentPreview } }))
    setPreview(null)
    await refresh()
    if (result?.refreshError) throw new Error(result.refreshError)
  })
  const undo = () => run(async () => {
    const result = await window.electron.harness.initUndo(workspace.path, receipt.id)
    useBlueprintStore.setState(previous => {
      const next = { ...previous.initializationReceipts }; delete next[workspace.id]
      return { initializationReceipts: next }
    })
    await refresh()
    if (result?.refreshError) throw new Error(result.refreshError)
  })
  const draft = () => useBlueprintStore.getState().requestDraft(workspace.id)
  const errorText = error?.workspaceId === workspace.id ? error.message : null
  const stateName = loading || !state ? 'loading' : state.state
  const needsRepair = stateName === 'invalid' || stateName === 'error'
  const diagnostics = needsRepair ? [...new Map((state?.diagnostics ?? []).map(item =>
    [JSON.stringify([item.code, item.path, item.message]), item])).values()] : []
  const cancelPreview = () => {
    setPreview(null)
    requestAnimationFrame(() => initializeRef.current?.focus())
  }
  if (hasNodes && !receipt && !currentPreview && !busy && !errorText) return null
  return <section className={hasNodes ? 'blueprint-workspace-receipt' : 'blueprint-workspace-empty'} aria-live="polite">
    {receipt && <div className="blueprint-workspace-actions">
      <span className="blueprint-workspace-success"><Check size={15} aria-hidden="true" />{t('workspace.initialized')}</span>
      <button className="blueprint-setup-button blueprint-setup-button--quiet" type="button" disabled={!!busy} onClick={() => void undo()}>{t('workspace.undo')}</button>
      <button className="blueprint-setup-button" type="button" onClick={draft}>{t('workspace.draft')}</button>
    </div>}
    <div className="blueprint-workspace-content">
      {!hasNodes && <>
        <div className="blueprint-workspace-name"><FolderOpen size={14} aria-hidden="true" /><span>{workspace.name}</span></div>
        {!currentPreview && <>
          <div className="blueprint-workspace-symbol" aria-hidden="true">
            {stateName === 'loading' ? <LoaderCircle className="blueprint-workspace-spinner" size={26} /> : <Network size={26} />}
          </div>
          <h2>{t(`workspace.title.${stateName}`)}</h2>
          <p className="blueprint-workspace-description">{t(`workspace.description.${stateName}`)}</p>
          {stateName !== 'loading' && <div className="blueprint-workspace-actions">
            {['not-found', 'foreign'].includes(stateName) && <button ref={initializeRef} className="blueprint-setup-button blueprint-setup-button--primary" type="button" disabled={!!busy} onClick={() => void begin()}><FilePlus2 size={15} aria-hidden="true" />{t('workspace.initialize')}</button>}
            {stateName === 'empty' && <button className="blueprint-setup-button blueprint-setup-button--primary" type="button" onClick={draft}>{t('workspace.draft')}<ChevronRight size={15} aria-hidden="true" /></button>}
            <button className={`blueprint-setup-button ${needsRepair ? '' : 'blueprint-setup-button--quiet'}`} type="button" disabled={!!busy} onClick={() => void run(refresh)}><RefreshCw size={14} aria-hidden="true" />{t('workspace.retry')}</button>
          </div>}
          {diagnostics.length > 0 && <details className="blueprint-workspace-diagnostics">
            <summary>{t('workspace.diagnostics')}</summary>
            <ul>{diagnostics.map((diagnostic, index) => <li key={index}>
              {diagnostic.path && <code>{diagnostic.path}</code>}
              <span>{diagnostic.message}</span>
              {diagnostic.path && /^\.agents\/[\w./-]+$/.test(diagnostic.path) && !diagnostic.path.split('/').includes('..') && <button className="blueprint-setup-button blueprint-setup-button--quiet" type="button"
                onClick={() => void run(() => useEditorStore.getState().openFile(`${workspace.path}/${diagnostic.path}`, workspace.path))}>{t('workspace.openFile')}</button>}
            </li>)}</ul>
          </details>}
        </>}
      </>}
      {currentPreview && <div className="blueprint-workspace-preview">
        <h2 ref={previewHeadingRef} tabIndex={-1}>{t('workspace.preview')}</h2>
        <p className="blueprint-workspace-description">{t('workspace.previewHint')}</p>
        <div className="blueprint-workspace-files">
          {currentPreview.files.map(file => <details key={file.path}><summary><FilePlus2 size={14} aria-hidden="true" /><span>{file.path}</span><ChevronRight className="blueprint-workspace-file-chevron" size={14} aria-hidden="true" /></summary><pre>{file.content}</pre></details>)}
        </div>
        {currentPreview.foreign && <label className="blueprint-workspace-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>{t('workspace.confirmForeign')}</span></label>}
        <div className="blueprint-workspace-actions">
          <button className="blueprint-setup-button blueprint-setup-button--primary" type="button" disabled={!!busy || (currentPreview.foreign && !confirmed)} onClick={() => void apply()}>{t('workspace.confirm')}</button>
          <button className="blueprint-setup-button blueprint-setup-button--quiet" type="button" disabled={!!busy} onClick={cancelPreview}>{t('workspace.cancel')}</button>
        </div>
      </div>}
      {busy === workspace.id && <p className="blueprint-workspace-progress"><LoaderCircle className="blueprint-workspace-spinner" size={14} aria-hidden="true" />{t('workspace.working')}</p>}
      {errorText && <div className="blueprint-workspace-error">
        <p role="alert">{t('workspace.actionFailed')}</p>
        <details className="blueprint-workspace-diagnostics"><summary>{t('workspace.diagnostics')}</summary><p>{errorText}</p></details>
      </div>}
    </div>
  </section>
}
