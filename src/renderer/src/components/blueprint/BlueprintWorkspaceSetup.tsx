import { useState } from 'react'
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
  return <section className={hasNodes ? 'blueprint-workspace-receipt' : 'blueprint-workspace-empty'} aria-live="polite">
    {receipt && <div className="blueprint-workspace-actions">
      <span>{t('workspace.initialized')}</span>
      <button type="button" disabled={!!busy} onClick={() => void undo()}>{t('workspace.undo')}</button>
      <button type="button" onClick={draft}>{t('workspace.draft')}</button>
    </div>}
    {!hasNodes && <>
      <h2>{workspace.name}</h2>
      <p>{t(`workspace.description.${stateName}`)}</p>
      {!loading && !currentPreview && <div className="blueprint-workspace-actions">
        {['not-found', 'foreign'].includes(stateName) && <button type="button" disabled={!!busy} onClick={() => void begin()}>{t('workspace.initialize')}</button>}
        {stateName === 'empty' && <button type="button" onClick={draft}>{t('workspace.draft')}</button>}
        <button type="button" disabled={!!busy} onClick={() => void run(refresh)}>{t('workspace.retry')}</button>
      </div>}
      {state?.diagnostics.length ? <ul className="blueprint-workspace-diagnostics">{state.diagnostics.map((diagnostic, index) => <li key={index}>
        <span>{diagnostic.path ? `${diagnostic.path}: ` : ''}{diagnostic.message}</span>
        {diagnostic.path && /^\.agents\/[\w./-]+$/.test(diagnostic.path) && !diagnostic.path.split('/').includes('..') && <button type="button"
          onClick={() => void run(() => useEditorStore.getState().openFile(`${workspace.path}/${diagnostic.path}`, workspace.path))}>{t('workspace.openFile')}</button>}
      </li>)}</ul> : null}
    </>}
    {currentPreview && <div className="blueprint-workspace-preview">
      <h3>{t('workspace.preview')}</h3>
      <p>{t('workspace.previewHint')}</p>
      {currentPreview.files.map(file => <details key={file.path} open><summary>{file.path}</summary><pre>{file.content}</pre></details>)}
      {currentPreview.foreign && <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{t('workspace.confirmForeign')}</label>}
      <div className="blueprint-workspace-actions">
        <button type="button" disabled={!!busy || (currentPreview.foreign && !confirmed)} onClick={() => void apply()}>{t('workspace.confirm')}</button>
        <button type="button" disabled={!!busy} onClick={() => setPreview(null)}>{t('workspace.cancel')}</button>
      </div>
    </div>}
    {busy === workspace.id && <p>{t('workspace.working')}</p>}
    {errorText && <p role="alert">{errorText}</p>}
  </section>
}
