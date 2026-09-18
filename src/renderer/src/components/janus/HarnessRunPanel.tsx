import { useCallback, useEffect, useState } from 'react'
// Note: desktop entry to task runs incl. the xdo host — see .agents/notes/implemented/architecture/2026-09-18-desktop-xdo-executor.md
import { useI18n } from '@/i18n/useI18n'
import type { HarnessTaskDraft } from '../../../../shared/ipc/harness'
import { TaskContractEditor } from './TaskContractEditor'
import {
  runAbort,
  runCancel,
  runCloseout,
  runExecute,
  runHandoff,
  runList,
  runPause,
  runPrepare,
  runRebaseline,
  runResume,
  runStart,
  runStatus,
  type HarnessRunCloseout,
  type HarnessRunExecuteResult,
  type HarnessRunMode,
  type HarnessRunState,
} from '@/services/harness'

interface HarnessRunPanelProps {
  cwd: string
  taskUri: string
}

function failureMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const record = err as Record<string, unknown>
    return `${String(record.code)}: ${String(record.message ?? err)}`
  }
  if (err instanceof Error) return err.message
  return String(err)
}

function shortId(runId: string): string {
  return runId.length > 13 ? `${runId.slice(0, 8)}…${runId.slice(-4)}` : runId
}

/**
 * Run panel (S8-JanusX surface): prepares, starts, executes (desktop xdo host
 * with declared checks plus self-review), refreshes, pauses, resumes,
 * rebaselines, cancels, closeout-checks, and hands off task runs through the
 * harness IPC loop. Lease tokens never leave the main process.
 */
export function HarnessRunPanel({ cwd, taskUri }: HarnessRunPanelProps) {
  const { t } = useI18n('janus')
  const [runs, setRuns] = useState<HarnessRunState[]>([])
  const [draft, setDraft] = useState<HarnessTaskDraft | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<HarnessRunMode>('xdo')
  const [closeout, setCloseout] = useState<HarnessRunCloseout>('commit-required')
  const [owner, setOwner] = useState('desktop')
  const [authRef, setAuthRef] = useState('')
  const [providerId, setProviderId] = useState('')
  const [modelId, setModelId] = useState('')
  const [evidence, setEvidence] = useState<Record<string, { observer: string; observation: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [closeoutMsg, setCloseoutMsg] = useState<string | null>(null)
  const [handoffPath, setHandoffPath] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<HarnessRunExecuteResult | null>(null)

  const load = useCallback(async () => {
    try {
      setDraft(await window.electron.harness.taskRead(cwd, taskUri))
      const listed = await runList(cwd)
      const own = listed.filter((run) => run.taskUri === taskUri)
      setRuns(own)
      setSelectedId((current) => (current && own.some((run) => run.runId === current) ? current : (own[0]?.runId ?? null)))
      setError(null)
    } catch (err: unknown) {
      setError(t('janus:harness.runs.listFailed', { message: failureMessage(err) }))
    }
  }, [cwd, taskUri, t])

  useEffect(() => {
    setRuns([])
    setDraft(null)
    setSelectedId(null)
    setNotice(null)
    setCloseoutMsg(null)
    setHandoffPath(null)
    setLastResult(null)
    setEvidence({})
    void load()
  }, [load])

  const selected = runs.find((run) => run.runId === selectedId) ?? null
  const manualSteps = (draft?.contract?.work?.verification ?? []).filter((step) => step.kind === 'manual')

  const handlePrepare = async () => {
    if (busy) return
    setBusy('prepare')
    setError(null)
    setNotice(null)
    try {
      const prepared = await runPrepare(cwd, {
        taskUri,
        mode,
        closeout,
        ...(authRef.trim() ? { authorizationRef: authRef.trim() } : {}),
      })
      setNotice(t('janus:harness.runs.prepared', { runId: shortId(prepared.runId) }))
      await load()
      setSelectedId(prepared.runId)
    } catch (err: unknown) {
      setError(t('janus:harness.runs.prepareFailed', { message: failureMessage(err) }))
    } finally {
      setBusy(null)
    }
  }

  const handleStart = async () => {
    if (busy || !selected) return
    setBusy('start')
    setError(null)
    setNotice(null)
    try {
      const name = owner.trim() || 'desktop'
      const started = await runStart(cwd, selected.runId, name, {
        by: name,
        ...(authRef.trim() ? { ref: authRef.trim() } : {}),
      })
      setNotice(t('janus:harness.runs.started', { attempt: started.attempt }))
      await load()
    } catch (err: unknown) {
      setError(t('janus:harness.runs.startFailed', { message: failureMessage(err) }))
    } finally {
      setBusy(null)
    }
  }

  const handleExecute = async () => {
    if (busy || executing || !selected) return
    setBusy('execute')
    setExecuting(true)
    setError(null)
    setNotice(null)
    setLastResult(null)
    try {
      const result = await runExecute(cwd, {
        runId: selected.runId,
        ...(providerId.trim() ? { providerId: providerId.trim() } : {}),
        ...(modelId.trim() ? { modelId: modelId.trim() } : {}),
        manualEvidence: Object.entries(evidence)
          .filter(([, item]) => item.observer.trim() && item.observation.trim())
          .map(([stepId, item]) => ({ stepId, observer: item.observer.trim(), observation: item.observation.trim() })),
      })
      setLastResult(result)
      setNotice(t('janus:harness.runs.executed', { receipt: shortId(result.receiptId), completed: String(result.completed) }))
      await load()
    } catch (err: unknown) {
      setError(t('janus:harness.runs.executeFailed', { message: failureMessage(err) }))
      await load()
    } finally {
      setExecuting(false)
      setBusy(null)
    }
  }

  const handleAbort = async () => {
    if (!selected) return
    setError(null)
    try {
      const result = await runAbort(cwd, selected.runId)
      setNotice(t('janus:harness.runs.aborted', { state: result.state }))
      await load()
    } catch (err: unknown) {
      setError(t('janus:harness.runs.abortFailed', { message: failureMessage(err) }))
    }
  }

  const handlePause = async () => {
    if (busy || !selected) return
    setBusy('pause')
    setError(null)
    try {
      const result = await runPause(cwd, selected.runId)
      setNotice(t('janus:harness.runs.paused', { state: result.state }))
      await load()
    } catch (err: unknown) {
      setError(t('janus:harness.runs.pauseFailed', { message: failureMessage(err) }))
    } finally {
      setBusy(null)
    }
  }

  const handleResume = async () => {
    if (busy || !selected) return
    setBusy('resume')
    setError(null)
    try {
      const result = await runResume(cwd, selected.runId)
      setNotice(t('janus:harness.runs.resumed', { state: result.state }))
      await load()
    } catch (err: unknown) {
      setError(t('janus:harness.runs.resumeFailed', { message: failureMessage(err) }))
    } finally {
      setBusy(null)
    }
  }

  const handleRebaseline = async () => {
    if (busy || !selected) return
    setBusy('rebaseline')
    setError(null)
    try {
      const name = owner.trim() || 'desktop'
      const result = await runRebaseline(cwd, selected.runId, {
        by: name,
        ...(authRef.trim() ? { ref: authRef.trim() } : {}),
      })
      setNotice(t('janus:harness.runs.rebaselined', { state: result.state }))
      await load()
    } catch (err: unknown) {
      setError(t('janus:harness.runs.rebaselineFailed', { message: failureMessage(err) }))
    } finally {
      setBusy(null)
    }
  }

  const handleRefresh = async () => {
    if (busy || !selected) return
    setBusy('refresh')
    setError(null)
    try {
      const state = await runStatus(cwd, selected.runId)
      setRuns((current) => current.map((run) => (run.runId === state.runId ? state : run)))
    } catch (err: unknown) {
      setError(t('janus:harness.runs.refreshFailed', { message: failureMessage(err) }))
    } finally {
      setBusy(null)
    }
  }

  const handleCancel = async () => {
    if (busy || !selected) return
    setBusy('cancel')
    setError(null)
    setNotice(null)
    try {
      const result = await runCancel(cwd, selected.runId)
      setNotice(t('janus:harness.runs.cancelled', { state: result.state }))
      await load()
    } catch (err: unknown) {
      setError(t('janus:harness.runs.cancelFailed', { message: failureMessage(err) }))
    } finally {
      setBusy(null)
    }
  }

  const handleCloseout = async () => {
    if (busy || !selected) return
    setBusy('closeout')
    setError(null)
    setCloseoutMsg(null)
    try {
      const result = await runCloseout(cwd, selected.runId)
      setCloseoutMsg(
        result.satisfied
          ? t('janus:harness.runs.closeoutSatisfied', { detail: result.detail })
          : t('janus:harness.runs.closeoutPending', { detail: result.detail }),
      )
    } catch (err: unknown) {
      setError(t('janus:harness.runs.closeoutFailed', { message: failureMessage(err) }))
    } finally {
      setBusy(null)
    }
  }

  const handleHandoff = async () => {
    if (busy || !selected) return
    setBusy('handoff')
    setError(null)
    setHandoffPath(null)
    try {
      const result = await runHandoff(cwd, selected.runId)
      setHandoffPath(t('janus:harness.runs.handoffWrote', { path: result.path }))
    } catch (err: unknown) {
      setError(t('janus:harness.runs.handoffFailed', { message: failureMessage(err) }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="harness-run-panel" aria-label={t('janus:harness.runs.title')}>
      <div className="harness-run-panel__head">
        <span className="harness-run-panel__title">{t('janus:harness.runs.title')}</span>
      </div>
      {draft ? <TaskContractEditor key={`${draft.uri}:${draft.hash}`} draft={draft} cwd={cwd} onReload={() => void load()} onAdopted={(accepted) => { setDraft(accepted); void load() }} /> : null}
      <div className="harness-run-panel__row">
        <label>
          <span>{t('janus:harness.runs.modeLabel')}</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as HarnessRunMode)} aria-label={t('janus:harness.runs.modeLabel')}>
            <option value="xdo">xdo</option>
            <option value="xdel">xdel</option>
            <option value="xflow">xflow</option>
          </select>
        </label>
        <label>
          <span>{t('janus:harness.runs.closeoutLabel')}</span>
          <select value={closeout} onChange={(event) => setCloseout(event.target.value as HarnessRunCloseout)} aria-label={t('janus:harness.runs.closeoutLabel')}>
            <option value="commit-required">{t('janus:harness.runs.closeoutCommit')}</option>
            <option value="working-tree-authorized">{t('janus:harness.runs.closeoutWorktree')}</option>
          </select>
        </label>
      </div>
      <div className="harness-run-panel__row">
        <label>
          <span>{t('janus:harness.runs.ownerLabel')}</span>
          <input value={owner} onChange={(event) => setOwner(event.target.value)} aria-label={t('janus:harness.runs.ownerLabel')} />
        </label>
        <label>
          <span>{t('janus:harness.runs.authRefLabel')}</span>
          <input value={authRef} onChange={(event) => setAuthRef(event.target.value)} aria-label={t('janus:harness.runs.authRefLabel')} />
        </label>
      </div>
      <div className="harness-run-panel__row">
        <label>
          <span>{t('janus:harness.runs.providerLabel')}</span>
          <input value={providerId} onChange={(event) => setProviderId(event.target.value)} aria-label={t('janus:harness.runs.providerLabel')} placeholder="openai-compatible" />
        </label>
        <label>
          <span>{t('janus:harness.runs.modelLabel')}</span>
          <input value={modelId} onChange={(event) => setModelId(event.target.value)} aria-label={t('janus:harness.runs.modelLabel')} placeholder="gpt-4o-mini" />
        </label>
      </div>
      {manualSteps.length > 0 ? (
        <div className="harness-run-panel__evidence">
          <span className="harness-run-panel__title">{t('janus:harness.runs.manualEvidenceTitle')}</span>
          {manualSteps.map((step) => (
            <div key={step.id} className="harness-run-panel__row">
              <label>
                <span>{t('janus:harness.runs.observerLabel', { step: step.id })}</span>
                <input
                  value={evidence[step.id]?.observer ?? ''}
                  onChange={(event) => setEvidence((current) => ({ ...current, [step.id]: { observer: event.target.value, observation: current[step.id]?.observation ?? '' } }))}
                  aria-label={t('janus:harness.runs.observerLabel', { step: step.id })}
                />
              </label>
              <label>
                <span>{t('janus:harness.runs.observationLabel', { step: step.id })}</span>
                <input
                  value={evidence[step.id]?.observation ?? ''}
                  onChange={(event) => setEvidence((current) => ({ ...current, [step.id]: { observer: current[step.id]?.observer ?? '', observation: event.target.value } }))}
                  aria-label={t('janus:harness.runs.observationLabel', { step: step.id })}
                />
              </label>
            </div>
          ))}
        </div>
      ) : null}
      <div className="harness-run-panel__actions">
        <button type="button" className="blueprint-btn blueprint-btn--primary" disabled={!!busy || runs.length > 0 || draft?.lifecycle !== 'accepted'} onClick={() => void handlePrepare()}>
          {busy === 'prepare' ? t('janus:harness.runs.preparing') : t('janus:harness.runs.prepare')}
        </button>
        {selected ? (
          <>
            <button type="button" className="blueprint-btn" disabled={!!busy || selected.local === false || selected.state !== 'queued'} onClick={() => void handleStart()}>
              {busy === 'start' ? t('janus:harness.runs.starting') : t('janus:harness.runs.start')}
            </button>
            <button type="button" className="blueprint-btn blueprint-btn--primary" disabled={!!busy || executing || selected.local === false || !['running', 'verifying'].includes(selected.state) || selected.mode !== 'xdo'} onClick={() => void handleExecute()}>
              {busy === 'execute' ? t('janus:harness.runs.executing') : t('janus:harness.runs.execute')}
            </button>
            {executing ? (
              <button type="button" className="blueprint-btn" onClick={() => void handleAbort()}>
                {t('janus:harness.runs.abort')}
              </button>
            ) : null}
            <button type="button" className="blueprint-btn" disabled={!!busy || executing} onClick={() => void handleRefresh()}>
              {t('janus:harness.runs.refresh')}
            </button>
            <button type="button" className="blueprint-btn" disabled={!!busy || executing || !['queued', 'running', 'verifying'].includes(selected.state)} onClick={() => void handlePause()}>
              {busy === 'pause' ? t('janus:harness.runs.pausing') : t('janus:harness.runs.pause')}
            </button>
            <button type="button" className="blueprint-btn" disabled={!!busy || executing || selected.state !== 'paused'} onClick={() => void handleResume()}>
              {busy === 'resume' ? t('janus:harness.runs.resuming') : t('janus:harness.runs.resume')}
            </button>
            <button type="button" className="blueprint-btn" disabled={!!busy || executing || !['blocked', 'paused'].includes(selected.state)} onClick={() => void handleRebaseline()}>
              {busy === 'rebaseline' ? t('janus:harness.runs.rebaselining') : t('janus:harness.runs.rebaseline')}
            </button>
            <button type="button" className="blueprint-btn" disabled={!!busy || selected.local === false || ['done', 'cancelled'].includes(selected.state)} onClick={() => void handleCancel()}>
              {busy === 'cancel' ? t('janus:harness.runs.cancelling') : t('janus:harness.runs.cancel')}
            </button>
            <button type="button" className="blueprint-btn" disabled={!!busy || selected.state !== 'done'} onClick={() => void handleCloseout()}>
              {busy === 'closeout' ? t('janus:harness.runs.closeoutChecking') : t('janus:harness.runs.closeout')}
            </button>
            <button type="button" className="blueprint-btn" disabled={!!busy || selected.local === false} onClick={() => void handleHandoff()}>
              {busy === 'handoff' ? t('janus:harness.runs.handoffWriting') : t('janus:harness.runs.handoff')}
            </button>
          </>
        ) : null}
      </div>
      {lastResult ? (
        <div className="harness-run-panel__result" role="status">
          <span>{t('janus:harness.runs.receiptLabel', { receipt: shortId(lastResult.receiptId) })}</span>
          <span>{t(lastResult.completed ? 'janus:harness.runs.completedLabel' : 'janus:harness.runs.uncompletedLabel')}</span>
          <ul>
            {lastResult.checks.map((check) => (
              <li key={check.id}>{`${check.id} [${check.kind}/${check.status}] ${check.summary.slice(0, 160)}`}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {runs.length === 0 ? (
        <p className="harness-run-panel__notice" role="status">{t('janus:harness.runs.empty')}</p>
      ) : (
        <ul className="harness-run-panel__runs">
          {runs.map((run) => (
            <li key={run.runId}>
              <label>
                <input type="radio" name="harness-run" checked={run.runId === selectedId} onChange={() => setSelectedId(run.runId)} />
                <span className="harness-run-panel__state" data-state={run.state}>{run.state}</span>
                {run.validity ? <span>{run.validity}</span> : null}
                {run.local === false ? <span>{t('janus:harness.runs.ownerLabel')}: {t('common:status.unknown')}</span> : null}
                <span>{shortId(run.runId)}</span>
                <span>{t('janus:harness.runs.attempt', { count: run.attempt })}</span>
                <span>{t('janus:harness.runs.receipts', { count: run.receipts })}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {notice ? <p className="harness-run-panel__done" role="status">{notice}</p> : null}
      {closeoutMsg ? <p className="harness-run-panel__done" role="status">{closeoutMsg}</p> : null}
      {handoffPath ? <p className="harness-run-panel__done" role="status">{handoffPath}</p> : null}
      {error ? <p className="harness-run-panel__notice" role="alert">{error}</p> : null}
    </div>
  )
}
