import { useState } from 'react'
import { Check, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import type { HarnessTaskDraft } from '../../../../shared/ipc/harness'

export function TaskContractEditor({ draft, cwd, onAdopted, onReload }: {
  draft: HarnessTaskDraft; cwd: string; onAdopted: (draft: HarnessTaskDraft) => void; onReload: () => void
}) {
  const { t } = useI18n('janus')
  const [scope, setScope] = useState(draft.contract.scope)
  const [paths, setPaths] = useState(draft.contract.work.scope.flatMap((item) => item.paths).join('\n'))
  const [criteria, setCriteria] = useState(draft.contract.criteria)
  const [refs, setRefs] = useState(draft.contract.work.acceptanceRefs.filter((ref) => ref.uri !== draft.uri).map((ref) => `${ref.uri}#${ref.criterionId}`).join('\n'))
  const [steps, setSteps] = useState(draft.contract.work.verification.length ? draft.contract.work.verification : [{
    id: 'check-1', kind: 'command' as const, required: true, repoId: draft.repoId, cwd: '.', program: '', args: [] as string[],
  }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editable = !draft.hasExecution && ['draft', 'proposed'].includes(draft.lifecycle)
  const adopt = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const acceptanceRefs = refs.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
        const split = line.lastIndexOf('#')
        return { uri: line.slice(0, split), criterionId: line.slice(split + 1) }
      })
      onAdopted(await window.electron.harness.taskAdopt(cwd, draft.uri, draft.hash, {
        scope, criteria, work: { scope: [{ repoId: draft.repoId, paths: paths.split('\n').map((line) => line.trim()).filter(Boolean) }], acceptanceRefs, verification: steps },
      }))
    } catch (reason) {
      setError(reason && typeof reason === 'object' && 'message' in reason ? String(reason.message) : String(reason))
    } finally { setBusy(false) }
  }
  return <details className="task-contract" open={editable}>
    <summary>{t('janus:harness.contract.title')} · {draft.lifecycle}</summary>
    <p>{t('janus:harness.contract.primary')}: {draft.repoId}</p>
    <fieldset disabled={busy || !editable}>
      <label>{t('janus:harness.contract.scope')}<textarea value={scope} onChange={(event) => setScope(event.target.value)} /></label>
      <label>{t('janus:harness.contract.paths')}<textarea value={paths} onChange={(event) => setPaths(event.target.value)} /></label>
      <div className="task-contract__rows">
        <span>{t('janus:harness.contract.criteria')}</span>
        {criteria.map((criterion, index) => <div className="task-contract__row" key={criterion.id}>
          <span>{criterion.id}</span><input aria-label={criterion.id} value={criterion.text} onChange={(event) => setCriteria((current) => current.map((item, at) => at === index ? { ...item, text: event.target.value } : item))} />
          <button type="button" title={t('common:action.delete')} aria-label={t('common:action.delete')} onClick={() => setCriteria((current) => current.filter((_, at) => at !== index))}><Trash2 size={14} /></button>
        </div>)}
        <button type="button" title={t('janus:harness.contract.add')} aria-label={t('janus:harness.contract.add')} onClick={() => setCriteria((current) => [...current, { id: `AC-${Math.max(0, ...current.map((item) => Number(item.id.slice(3)) || 0)) + 1}`, text: '' }])}><Plus size={14} /></button>
      </div>
      <label>{t('janus:harness.contract.references')}<textarea value={refs} onChange={(event) => setRefs(event.target.value)} /></label>
      <div className="task-contract__rows"><span>{t('janus:harness.contract.verification')}</span>
        {steps.map((step, index) => <div className="task-contract__step" key={step.id}>
          {step.kind === 'command' ? <>
            <label>{t('janus:harness.contract.program')}<input value={step.program ?? ''} onChange={(event) => setSteps((current) => current.map((item, at) => at === index ? { ...item, program: event.target.value } : item))} /></label>
            <label>{t('janus:harness.contract.arguments')}<textarea value={(step.args ?? []).join('\n')} onChange={(event) => setSteps((current) => current.map((item, at) => at === index ? { ...item, args: event.target.value ? event.target.value.split('\n') : [] } : item))} /></label>
          </> : <label>{t('janus:harness.contract.verification')}<textarea value={step.description ?? ''} onChange={(event) => setSteps((current) => current.map((item, at) => at === index ? { ...item, description: event.target.value } : item))} /></label>}
          <label>{t('janus:harness.contract.directory')}<input value={step.cwd} onChange={(event) => setSteps((current) => current.map((item, at) => at === index ? { ...item, cwd: event.target.value } : item))} /></label>
          <button type="button" title={t('common:action.delete')} aria-label={t('common:action.delete')} onClick={() => setSteps((current) => current.filter((_, at) => at !== index))}><Trash2 size={14} /></button>
        </div>)}
        <button type="button" title={t('janus:harness.contract.add')} aria-label={t('janus:harness.contract.add')} onClick={() => setSteps((current) => [...current, { id: crypto.randomUUID(), kind: 'command', required: true, repoId: draft.repoId, cwd: '.', program: '', args: [] }])}><Plus size={14} /></button>
      </div>
    </fieldset>
    <div className="task-contract__row">
      {editable ? <button className="blueprint-btn" disabled={busy} type="button" onClick={() => void adopt()}><Check size={14} />{t('janus:harness.contract.adopt')}</button> : null}
      <button type="button" disabled={busy} onClick={onReload} title={t('janus:harness.runs.refresh')} aria-label={t('janus:harness.runs.refresh')}><RefreshCw size={14} /></button>
    </div>
    {error ? <p role="alert">{error}</p> : null}
  </details>
}
