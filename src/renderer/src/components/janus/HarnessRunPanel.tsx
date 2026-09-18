import { useCallback, useEffect, useState } from 'react'
// Note: desktop entry to task runs — see .agents/notes/implemented/architecture/2026-09-18-harness-execution-adapter-s8.md
import { useI18n } from '@/i18n/useI18n'
import {
  runCancel,
  runCloseout,
  runHandoff,
  runList,
  runPrepare,
  runStart,
  runStatus,
  type HarnessRunCloseout,
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
 * Run panel (S8-JanusX surface): prepares, starts, refreshes, cancels,
 * closeout-checks, and hands off task runs through the harness IPC loop.
 * Verify/record/finish/repair stay executor-side until evidence UX lands.
 */
export function HarnessRunPanel({ cwd, taskUri }: HarnessRunPanelProps) {
  const { t } = useI18n('janus')
  const [runs, setRuns] = useState<HarnessRunState[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<HarnessRunMode>('xdo')
  const [closeout, setCloseout] = useState<HarnessRunCloseout>('commit-required')
  const [owner, setOwner] = useState('desktop')
  const [authRef, setAuthRef] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [closeoutMsg, setCloseoutMsg] = useState<string | null>(null)
  const [handoffPath, setHandoffPath] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
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
    setSelectedId(null)
    setNotice(null)
    setCloseoutMsg(null)
    setHandoffPath(null)
    void load()
  }, [load])

  const selected = runs.find((run) => run.runId === selectedId) ?? null

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
      <div className="harness-run-panel__actions">
        <button type="button" className="blueprint-btn blueprint-btn--primary" disabled={!!busy} onClick={() => void handlePrepare()}>
          {busy === 'prepare' ? t('janus:harness.runs.preparing') : t('janus:harness.runs.prepare')}
        </button>
        {selected ? (
          <>
            <button type="button" className="blueprint-btn" disabled={!!busy} onClick={() => void handleStart()}>
              {busy === 'start' ? t('janus:harness.runs.starting') : t('janus:harness.runs.start')}
            </button>
            <button type="button" className="blueprint-btn" disabled={!!busy} onClick={() => void handleRefresh()}>
              {t('janus:harness.runs.refresh')}
            </button>
            <button type="button" className="blueprint-btn" disabled={!!busy} onClick={() => void handleCancel()}>
              {busy === 'cancel' ? t('janus:harness.runs.cancelling') : t('janus:harness.runs.cancel')}
            </button>
            <button type="button" className="blueprint-btn" disabled={!!busy} onClick={() => void handleCloseout()}>
              {busy === 'closeout' ? t('janus:harness.runs.closeoutChecking') : t('janus:harness.runs.closeout')}
            </button>
            <button type="button" className="blueprint-btn" disabled={!!busy} onClick={() => void handleHandoff()}>
              {busy === 'handoff' ? t('janus:harness.runs.handoffWriting') : t('janus:harness.runs.handoff')}
            </button>
          </>
        ) : null}
      </div>
      {runs.length === 0 ? (
        <p className="harness-run-panel__notice" role="status">{t('janus:harness.runs.empty')}</p>
      ) : (
        <ul className="harness-run-panel__runs">
          {runs.map((run) => (
            <li key={run.runId}>
              <label>
                <input type="radio" name="harness-run" checked={run.runId === selectedId} onChange={() => setSelectedId(run.runId)} />
                <span className="harness-run-panel__state" data-state={run.state}>{run.state}</span>
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
