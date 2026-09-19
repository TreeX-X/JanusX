import { useCallback, useEffect, useState } from 'react'
// Note: desktop entry to task runs incl. the xdo host — see .agents/notes/implemented/architecture/2026-09-18-desktop-xdo-executor.md
// Note: external runner backflow surface — see .agents/notes/implemented/architecture/2026-09-18-external-runner-backflow.md
// Note: thread registry, activation, and close — see .agents/notes/implemented/architecture/2026-09-18-thread-registry-activation.md
// Note: independent review and limited repair — see .agents/notes/implemented/architecture/2026-09-18-independent-review-repair.md
// Note: reversible managed writes — see .agents/notes/implemented/architecture/2026-09-18-harness-undo.md
import { useI18n } from '@/i18n/useI18n'
import { getTerminalDefault, getTerminalProviders, listModels } from '@/services/llm'
import type { HarnessTaskDraft } from '../../../../shared/ipc/harness'
import { TaskContractEditor } from './TaskContractEditor'
import {
  runAbort,
  runCancel,
  runCloseout,
  runExecute,
  runFinish,
  runHandoff,
  runHandoffRead,
  runList,
  runPause,
  runPrepare,
  runRebaseline,
  runRepair,
  runResume,
  runReview,
  runStart,
  runStatus,
  runTakeover,
  runThread,
  runThreadClose,
  runThreads,
  undoApply,
  undoPreview,
  type HarnessRunCloseout,
  type HarnessRunExecuteResult,
  type HarnessRunMode,
  type HarnessRunReviewResult,
  type HarnessRunState,
  type HarnessThreadDetail,
  type HarnessThreadSummary,
  type HarnessUndoPreview,
} from '@/services/harness'

interface HarnessRunPanelProps {
  cwd: string
  taskUri: string
}

type HarnessRunExecutor = 'internal' | 'external'

interface ChatModelOption {
  providerId: string
  providerName: string
  modelId: string
  label: string
  isDefault: boolean
}

/**
 * Same catalog source as the chat model picker: enabled janus providers
 * plus catalog-listed models, with the chat default flagged. The run
 * panel stays usable with free text when nothing is configured.
 */
async function loadChatModelOptions(): Promise<ChatModelOption[]> {
  const [providers, defaultProvider] = await Promise.all([getTerminalProviders('janus'), getTerminalDefault('janus')])
  const enabledProviders = providers.filter((provider) => provider.enabled !== false)
  const options = (await Promise.all(enabledProviders.map(async (provider) => {
    const configuredModelIds = provider.models?.length
      ? provider.models
      : [provider.modelId || (defaultProvider?.provider.id === provider.id ? defaultProvider.modelId : '')]
    const models = await listModels('janus', provider.id).catch(() => [])
    const modelIds = [...new Set([...models.map((model) => model.id), ...configuredModelIds].filter(Boolean))]
    return modelIds.map((modelId) => ({
      providerId: provider.id,
      providerName: provider.name,
      modelId,
      label: `${provider.name} / ${modelId}`,
      isDefault: defaultProvider?.provider.id === provider.id && defaultProvider.modelId === modelId,
    }))
  }))).flat()
  return options
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
 * with declared checks plus self-review), independently reviews through a
 * read-only evaluator turn, finishes against the latest receipt, repairs
 * through explicit packets, refreshes, pauses, resumes, rebaselines,
 * cancels, closeout-checks, hands off, and takes over task runs through the
 * harness IPC loop. The thread registry below lists background threads for
 * activation; a thread closes only through the explicit confirm step, never
 * on completion alone. External terminals enter through the handoff file
 * plus the entry command; their evidence flows back through rescan and the
 * shared kernel. Lease tokens never leave the main process.
 */
export function HarnessRunPanel({ cwd, taskUri }: HarnessRunPanelProps) {
  const { t } = useI18n('janus')
  const [runs, setRuns] = useState<HarnessRunState[]>([])
  const [threads, setThreads] = useState<HarnessThreadSummary[]>([])
  const [threadDetail, setThreadDetail] = useState<HarnessThreadDetail | null>(null)
  const [confirmingClose, setConfirmingClose] = useState<string | null>(null)
  const [draft, setDraft] = useState<HarnessTaskDraft | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<HarnessRunMode>('xdo')
  const [closeout, setCloseout] = useState<HarnessRunCloseout>('commit-required')
  const [executor, setExecutor] = useState<HarnessRunExecutor>('internal')
  const [owner, setOwner] = useState('desktop')
  const [authRef, setAuthRef] = useState('')
  const [providerId, setProviderId] = useState('')
  const [modelId, setModelId] = useState('')
  const [reviewer, setReviewer] = useState('reviewer')
  const [reviewerProvider, setReviewerProvider] = useState('')
  const [reviewerModel, setReviewerModel] = useState('')
  const [modelOptions, setModelOptions] = useState<ChatModelOption[]>([])
  const [repairSummary, setRepairSummary] = useState('')
  const [takeoverReason, setTakeoverReason] = useState('')
  const [evidence, setEvidence] = useState<Record<string, { observer: string; observation: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [closeoutMsg, setCloseoutMsg] = useState<string | null>(null)
  const [handoffPath, setHandoffPath] = useState<string | null>(null)
  const [handoffContent, setHandoffContent] = useState<{ path: string; markdown: string } | null>(null)
  const [lastResult, setLastResult] = useState<HarnessRunExecuteResult | null>(null)
  const [reviewResult, setReviewResult] = useState<HarnessRunReviewResult | null>(null)
  const [undo, setUndo] = useState<HarnessUndoPreview | null>(null)

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      try {
        const options = await loadChatModelOptions()
        if (cancelled) return
        setModelOptions(options)
        const fallback = options.find((option) => option.isDefault) ?? options[0]
        if (fallback) {
          setProviderId((current) => current || fallback.providerId)
          setModelId((current) => current || fallback.modelId)
          setReviewerProvider((current) => current || fallback.providerId)
          setReviewerModel((current) => current || fallback.modelId)
        }
      } catch {
        if (!cancelled) setModelOptions([])
      }
    }
    void refresh()
    window.addEventListener('janus:llm-config-changed', refresh)
    return () => {
      cancelled = true
      window.removeEventListener('janus:llm-config-changed', refresh)
    }
  }, [])

  const load = useCallback(async () => {
    try {
      setDraft(await window.electron.harness.taskRead(cwd, taskUri))
      const listed = await runList(cwd)
      const own = listed.filter((run) => run.taskUri === taskUri)
      setRuns(own)
      setSelectedId((current) => (current && own.some((run) => run.runId === current) ? current : (own[0]?.runId ?? null)))
      setThreads((await runThreads(cwd)).filter((thread) => thread.taskUri === taskUri))
      setError(null)
    } catch (err: unknown) {
      setError(t('janus:harness.runs.listFailed', { message: failureMessage(err) }))
    }
  }, [cwd, taskUri, t])

  useEffect(() => {
    setRuns([])
    setThreads([])
    setThreadDetail(null)
    setConfirmingClose(null)
    setDraft(null)
    setSelectedId(null)
    setNotice(null)
    setCloseoutMsg(null)
    setHandoffPath(null)
    setHandoffContent(null)
    setLastResult(null)
    setReviewResult(null)
    setUndo(null)
    setEvidence({})
    void load()
  }, [load])

  const selected = runs.find((run) => run.runId === selectedId) ?? null
  const manualSteps = (draft?.contract?.work?.verification ?? []).filter((step) => step.kind === 'manual')
  const providers = [...new Map(modelOptions.map((option) => [option.providerId, option.providerName])).entries()]
  const modelsFor = (providerIdForModels: string): ChatModelOption[] => (
    providerIdForModels ? modelOptions.filter((option) => option.providerId === providerIdForModels) : modelOptions
  )
  const modelChoices = (providerIdForModels: string, current: string): ChatModelOption[] => {
    const list = modelsFor(providerIdForModels)
    if (current && !list.some((option) => option.modelId === current)) {
      const owner = modelOptions.find((option) => option.modelId === current)
      return [...list, {
        providerId: owner?.providerId ?? providerIdForModels,
        providerName: owner?.providerName ?? '',
        modelId: current,
        label: current,
        isDefault: false,
      }]
    }
    return list
  }
  const pickProvider = (providerIdPicked: string, setPickedProvider: (value: string) => void, setPickedModel: (value: string) => void) => {
    setPickedProvider(providerIdPicked)
    const first = modelsFor(providerIdPicked)[0]
    setPickedModel(first ? first.modelId : '')
  }
  const entryCommand = selected
    ? [`cd "${cwd}"`, 'janus', `/harness ${taskUri} --mode ${selected.mode}`, `# pinned baseline: ${handoffContent?.path ?? 'write the handoff first'}`].join('\n')
    : ''

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setNotice(t('janus:harness.runs.copied'))
    } catch {
      setError(t('janus:harness.runs.copyFailed'))
    }
  }

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
        executor,
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
      if (result.repairedAttempt != null && !result.completed) {
        setNotice(t('janus:harness.runs.autoRepaired', { attempt: result.repairedAttempt }))
      } else {
        setNotice(t('janus:harness.runs.executed', { receipt: shortId(result.receiptId), completed: String(result.completed) }))
      }
      await load()
    } catch (err: unknown) {
      setError(t('janus:harness.runs.executeFailed', { message: failureMessage(err) }))
      await load()
    } finally {
      setExecuting(false)
      setBusy(null)
    }
  }

  const handleReview = async () => {
    if (busy || executing || !selected) return
    setBusy('review')
    setError(null)
    setNotice(null)
    setReviewResult(null)
    try {
      const result = await runReview(cwd, {
        runId: selected.runId,
        reviewer: reviewer.trim() || 'reviewer',
        ...(reviewerProvider.trim() ? { providerId: reviewerProvider.trim() } : {}),
        ...(reviewerModel.trim() ? { modelId: reviewerModel.trim() } : {}),
      })
      setReviewResult(result)
      setNotice(t('janus:harness.runs.reviewed', { verdict: result.verdict, receipt: shortId(result.receiptId) }))
      await load()
    } catch (err: unknown) {
      setError(t('janus:harness.runs.reviewFailed', { message: failureMessage(err) }))
      await load()
    } finally {
      setBusy(null)
    }
  }

  const handleFinish = async () => {
    if (busy || executing || !selected) return
    setBusy('finish')
    setError(null)
    setNotice(null)
    try {
      const result = await runFinish(cwd, selected.runId)
      setNotice(t('janus:harness.runs.finished', { receipt: shortId(result.receiptId), completed: String(result.completed) }))
      await load()
    } catch (err: unknown) {
      setError(t('janus:harness.runs.finishFailed', { message: failureMessage(err) }))
      await load()
    } finally {
      setBusy(null)
    }
  }

  const handleRepair = async () => {
    if (busy || executing || !selected) return
    setBusy('repair')
    setError(null)
    setNotice(null)
    try {
      const result = await runRepair(cwd, { runId: selected.runId, summary: repairSummary.trim() })
      setNotice(t('janus:harness.runs.repaired', { attempt: result.attempt, state: result.state }))
      setRepairSummary('')
      await load()
    } catch (err: unknown) {
      setError(t('janus:harness.runs.repairFailed', { message: failureMessage(err) }))
      await load()
    } finally {
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

  const handleTakeover = async () => {
    if (busy || !selected) return
    setBusy('takeover')
    setError(null)
    setNotice(null)
    try {
      const name = owner.trim() || 'desktop'
      const result = await runTakeover(cwd, selected.runId, name, takeoverReason.trim())
      setNotice(t('janus:harness.runs.takenOver', { state: result.state }))
      await load()
    } catch (err: unknown) {
      setError(t('janus:harness.runs.takeoverFailed', { message: failureMessage(err) }))
    } finally {
      setBusy(null)
    }
  }

  const handleActivateThread = async (thread: HarnessThreadSummary) => {
    if (busy) return
    setBusy('thread')
    setError(null)
    try {
      setSelectedId(thread.runId)
      setThreadDetail(await runThread(cwd, thread.runId))
      setConfirmingClose(null)
    } catch (err: unknown) {
      setError(t('janus:harness.runs.threadFailed', { message: failureMessage(err) }))
    } finally {
      setBusy(null)
    }
  }

  const handleThreadClose = async () => {
    if (busy || !threadDetail) return
    setBusy('thread-close')
    setError(null)
    try {
      await runThreadClose(cwd, threadDetail.runId)
      setNotice(t('janus:harness.runs.threadClosed', { run: shortId(threadDetail.runId) }))
      setThreadDetail(null)
      setConfirmingClose(null)
      await load()
    } catch (err: unknown) {
      setError(t('janus:harness.runs.threadCloseFailed', { message: failureMessage(err) }))
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
      const content = await runHandoffRead(cwd, selected.runId)
      setHandoffContent(content)
    } catch (err: unknown) {
      setError(t('janus:harness.runs.handoffFailed', { message: failureMessage(err) }))
    } finally {
      setBusy(null)
    }
  }

  const handleHandoffRefresh = async () => {
    if (busy || !selected) return
    setBusy('handoff')
    setError(null)
    try {
      setHandoffContent(await runHandoffRead(cwd, selected.runId))
    } catch (err: unknown) {
      setError(t('janus:harness.runs.handoffReadFailed', { message: failureMessage(err) }))
    } finally {
      setBusy(null)
    }
  }

  const handleUndoPreview = async () => {
    if (busy) return
    setBusy('undo')
    setError(null)
    setUndo(null)
    try {
      setUndo(await undoPreview(cwd))
    } catch (err: unknown) {
      setError(t('janus:harness.runs.undoPreviewFailed', { message: failureMessage(err) }))
    } finally {
      setBusy(null)
    }
  }

  const handleUndoApply = async () => {
    if (busy || !undo) return
    setBusy('undo-apply')
    setError(null)
    try {
      const result = await undoApply(cwd, undo.txId)
      setNotice(t('janus:harness.runs.undone', { tx: shortId(result.txId), files: result.reverted.length }))
      setUndo(null)
      await load()
    } catch (err: unknown) {
      setError(t('janus:harness.runs.undoApplyFailed', { message: failureMessage(err) }))
      if (undo) {
        try {
          setUndo(await undoPreview(cwd, undo.txId))
        } catch {
          setUndo(null)
        }
      }
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
        <label>
          <span>{t('janus:harness.runs.executorLabel')}</span>
          <select value={executor} onChange={(event) => setExecutor(event.target.value as HarnessRunExecutor)} aria-label={t('janus:harness.runs.executorLabel')}>
            <option value="internal">{t('janus:harness.runs.executorInternal')}</option>
            <option value="external">{t('janus:harness.runs.executorExternal')}</option>
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
          {modelOptions.length ? (
            <select value={providerId} onChange={(event) => pickProvider(event.target.value, setProviderId, setModelId)} aria-label={t('janus:harness.runs.providerLabel')}>
              {providers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          ) : (
            <input value={providerId} onChange={(event) => setProviderId(event.target.value)} aria-label={t('janus:harness.runs.providerLabel')} placeholder="openai-compatible" />
          )}
        </label>
        <label>
          <span>{t('janus:harness.runs.modelLabel')}</span>
          {modelOptions.length ? (
            <select value={modelId} onChange={(event) => setModelId(event.target.value)} aria-label={t('janus:harness.runs.modelLabel')}>
              {modelChoices(providerId, modelId).map((option) => <option key={`${option.providerId}/${option.modelId}`} value={option.modelId}>{option.label}</option>)}
            </select>
          ) : (
            <input value={modelId} onChange={(event) => setModelId(event.target.value)} aria-label={t('janus:harness.runs.modelLabel')} placeholder="gpt-4o-mini" />
          )}
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
      {selected && selected.executor === 'external' && selected.state === 'queued' ? (
        <p className="harness-run-panel__notice" role="status">{t('janus:harness.runs.awaitingLaunch')}</p>
      ) : null}
      {selected && selected.executor === 'external' && ['running', 'verifying'].includes(selected.state) ? (
        <p className="harness-run-panel__notice" role="status">{t('janus:harness.runs.externalRunning')}</p>
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
            <button type="button" className="blueprint-btn blueprint-btn--primary" disabled={!!busy || executing || selected.local === false || selected.executor !== 'internal' || !['running', 'verifying'].includes(selected.state) || selected.mode !== 'xdo'} onClick={() => void handleExecute()}>
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
      {selected && selected.local !== false ? (
        <div className="harness-run-panel__evidence">
          <span className="harness-run-panel__title">{t('janus:harness.runs.reviewTitle')}</span>
          <div className="harness-run-panel__row">
            <label>
              <span>{t('janus:harness.runs.reviewerLabel')}</span>
              <input value={reviewer} onChange={(event) => setReviewer(event.target.value)} aria-label={t('janus:harness.runs.reviewerLabel')} />
            </label>
            <label>
              <span>{t('janus:harness.runs.reviewerProviderLabel')}</span>
              {modelOptions.length ? (
                <select value={reviewerProvider} onChange={(event) => pickProvider(event.target.value, setReviewerProvider, setReviewerModel)} aria-label={t('janus:harness.runs.reviewerProviderLabel')}>
                  {providers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              ) : (
                <input value={reviewerProvider} onChange={(event) => setReviewerProvider(event.target.value)} aria-label={t('janus:harness.runs.reviewerProviderLabel')} />
              )}
            </label>
            <label>
              <span>{t('janus:harness.runs.reviewerModelLabel')}</span>
              {modelOptions.length ? (
                <select value={reviewerModel} onChange={(event) => setReviewerModel(event.target.value)} aria-label={t('janus:harness.runs.reviewerModelLabel')}>
                  {modelChoices(reviewerProvider, reviewerModel).map((option) => <option key={`${option.providerId}/${option.modelId}`} value={option.modelId}>{option.label}</option>)}
                </select>
              ) : (
                <input value={reviewerModel} onChange={(event) => setReviewerModel(event.target.value)} aria-label={t('janus:harness.runs.reviewerModelLabel')} />
              )}
            </label>
          </div>
          {selected.repairBudget ? (
            <span>{t('janus:harness.runs.repairBudget', { used: selected.repairBudget.usedAuto, max: selected.repairBudget.maxAuto })}</span>
          ) : null}
          <div className="harness-run-panel__actions">
            <button type="button" className="blueprint-btn" disabled={!!busy || executing || selected.state !== 'verifying'} onClick={() => void handleReview()}>
              {busy === 'review' ? t('janus:harness.runs.reviewing') : t('janus:harness.runs.review')}
            </button>
            <button type="button" className="blueprint-btn" disabled={!!busy || executing || selected.state !== 'verifying'} onClick={() => void handleFinish()}>
              {busy === 'finish' ? t('janus:harness.runs.finishing') : t('janus:harness.runs.finish')}
            </button>
          </div>
          {reviewResult ? (
            <span>{t('janus:harness.runs.reviewedResult', { verdict: reviewResult.verdict, receipt: shortId(reviewResult.receiptId) })}</span>
          ) : null}
          <div className="harness-run-panel__row">
            <label>
              <span>{t('janus:harness.runs.repairSummaryLabel')}</span>
              <input value={repairSummary} onChange={(event) => setRepairSummary(event.target.value)} aria-label={t('janus:harness.runs.repairSummaryLabel')} />
            </label>
            <div className="harness-run-panel__actions">
              <button type="button" className="blueprint-btn" disabled={!!busy || executing || !repairSummary.trim() || !['verifying', 'blocked'].includes(selected.state)} onClick={() => void handleRepair()}>
                {busy === 'repair' ? t('janus:harness.runs.repairing') : t('janus:harness.runs.repair')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {handoffContent ? (
        <div className="harness-run-panel__result" role="status">
          <span className="harness-run-panel__title">{t('janus:harness.runs.handoffTitle')}</span>
          <span>{handoffContent.path}</span>
          <pre>{handoffContent.markdown}</pre>
          <span>{entryCommand}</span>
          <div className="harness-run-panel__actions">
            <button type="button" className="blueprint-btn" disabled={!!busy} onClick={() => void copyText(handoffContent.path)}>
              {t('janus:harness.runs.handoffCopyPath')}
            </button>
            <button type="button" className="blueprint-btn" disabled={!!busy} onClick={() => void copyText(entryCommand)}>
              {t('janus:harness.runs.handoffCopyCommand')}
            </button>
            <button type="button" className="blueprint-btn" disabled={!!busy} onClick={() => void handleHandoffRefresh()}>
              {t('janus:harness.runs.handoffRefresh')}
            </button>
          </div>
        </div>
      ) : null}
      {selected && selected.local !== false ? (
        <div className="harness-run-panel__row">
          <label>
            <span>{t('janus:harness.runs.takeoverReasonLabel')}</span>
            <input value={takeoverReason} onChange={(event) => setTakeoverReason(event.target.value)} aria-label={t('janus:harness.runs.takeoverReasonLabel')} />
          </label>
          <div className="harness-run-panel__actions">
            <button type="button" className="blueprint-btn" disabled={!!busy || executing || !takeoverReason.trim() || !['running', 'verifying', 'paused'].includes(selected.state)} onClick={() => void handleTakeover()}>
              {busy === 'takeover' ? t('janus:harness.runs.takingOver') : t('janus:harness.runs.takeover')}
            </button>
          </div>
        </div>
      ) : null}
      <div className="harness-run-panel__evidence">
        <span className="harness-run-panel__title">{t('janus:harness.runs.undoTitle')}</span>
        {undo ? (
          <div className="harness-run-panel__result" role="status">
            <span>{t('janus:harness.runs.undoPreviewLabel', { tx: shortId(undo.txId) })}</span>
            <ul>
              {undo.files.map((file) => (
                <li key={file.operationId}>{`${file.relPath} [${file.status}]`}</li>
              ))}
            </ul>
            <div className="harness-run-panel__actions">
              <button type="button" className="blueprint-btn" disabled={!!busy || !undo.reversible} onClick={() => void handleUndoApply()}>
                {busy === 'undo-apply' ? t('janus:harness.runs.undoApplying') : t('janus:harness.runs.undoApply')}
              </button>
            </div>
          </div>
        ) : (
          <div className="harness-run-panel__actions">
            <button type="button" className="blueprint-btn" disabled={!!busy} onClick={() => void handleUndoPreview()}>
              {busy === 'undo' ? t('janus:harness.runs.undoPreviewing') : t('janus:harness.runs.undoPreview')}
            </button>
          </div>
        )}
      </div>
      <div className="harness-run-panel__threads">
        <span className="harness-run-panel__title">{t('janus:harness.runs.threadsTitle')}</span>
        {threads.length === 0 ? (
          <p className="harness-run-panel__notice" role="status">{t('janus:harness.runs.threadsEmpty')}</p>
        ) : (
          <ul className="harness-run-panel__runs">
            {threads.map((thread) => (
              <li key={thread.runId}>
                <button type="button" className="blueprint-btn" disabled={!!busy} onClick={() => void handleActivateThread(thread)}>
                  {t('janus:harness.runs.threadActivate')}
                </button>
                <span className="harness-run-panel__state" data-state={thread.state}>{thread.state}</span>
                <span>{shortId(thread.runId)}</span>
                <span>{t('janus:harness.runs.threadAttempts', { count: thread.attempts })}</span>
                {thread.lastVerdict ? <span>{thread.lastVerdict}</span> : null}
                {!thread.hasThread ? <span>{t('janus:harness.runs.threadMissing')}</span> : null}
              </li>
            ))}
          </ul>
        )}
        {threadDetail ? (
          <div className="harness-run-panel__result" role="status">
            <span>{t('janus:harness.runs.threadDetail', { run: shortId(threadDetail.runId) })}</span>
            {threadDetail.model ? <span>{`${threadDetail.model.providerId}/${threadDetail.model.modelId}`}</span> : null}
            <ul>
              {threadDetail.history.map((item) => (
                <li key={item.attempt}>{`attempt ${item.attempt} ${item.reviewVerdict ?? 'unreviewed'}${item.receiptId ? ` ${shortId(item.receiptId)}` : ''}`}</li>
              ))}
            </ul>
            {confirmingClose === threadDetail.runId ? (
              <div className="harness-run-panel__actions">
                <span>{t('janus:harness.runs.threadCloseConfirm', { run: shortId(threadDetail.runId), receipts: threadDetail.receipts })}</span>
                <button type="button" className="blueprint-btn" disabled={!!busy} onClick={() => void handleThreadClose()}>
                  {busy === 'thread-close' ? t('janus:harness.runs.threadClosing') : t('janus:harness.runs.threadCloseConfirmButton')}
                </button>
                <button type="button" className="blueprint-btn" disabled={!!busy} onClick={() => setConfirmingClose(null)}>
                  {t('janus:harness.runs.threadCloseCancel')}
                </button>
              </div>
            ) : (
              <div className="harness-run-panel__actions">
                <button type="button" className="blueprint-btn" disabled={!!busy} onClick={() => setConfirmingClose(threadDetail.runId)}>
                  {t('janus:harness.runs.threadClose')}
                </button>
              </div>
            )}
          </div>
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
                {run.repairBudget ? <span>{t('janus:harness.runs.repairBudget', { used: run.repairBudget.usedAuto, max: run.repairBudget.maxAuto })}</span> : null}
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
