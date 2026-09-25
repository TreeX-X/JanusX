/**
 * @file Harness IPC Handlers (S4)
 * @description Project-note resolve/graph/apply/bind/share channels over the
 *  single HarnessNoteService. Failures cross IPC as plain HarnessFailure
 *  data; the renderer matches `code`, never Error identity.
 */
import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'path'
import { app, BrowserWindow, ipcMain } from 'electron'
import type { ParsedNote } from '@janus-agent/harness-core'
import { readMarkdownView } from '@janus-agent/harness-core'
import {
  applyNodePatch,
  archiveNoteOp,
  checkWritablePatch,
  createNoteOp,
  nodeTypeToKind,
} from '../harness/artifact-producer'
import { toNoteDoc } from '../notes/note-provider'
import { harnessNoteService } from '../harness/service'
import type { IncomingSnapshot } from '../harness/share-import'
import { adoptTask, readTaskDraft } from '../harness/task-adoption'
import { applyUndo, previewUndo } from '../harness/undo'
import { applyMigration, archiveBlueprintSource, previewMigration } from '../janus/blueprint-migrate'
import { blueprintStore } from '../janus/blueprint-store'
import { GLOBAL_BLUEPRINT_SCOPE } from '../janus/blueprint-paths'
import { blueprintMaintenanceService } from '../janus/maintenance/service'
import { buildEvaluatorPrompt, createModelReviewPort } from '../harness/desktop-review'
import { executeDesktopTask, runDesktopCommand } from '../harness/desktop-executor'
import { createDesktopImplementationPort, generateDesktopReviewText } from '../harness/desktop-task-turn'
import { readTaskTranscript } from '../harness/task-transcript'
import { configService, DEFAULT_AGENT_MAX_STEPS } from '../config/service'
import type { ChatTurnPorts } from '@janus-agent/janus-agent'
import { finishWithLatestReceipt, requestIndependentReview } from '../harness/independent-review'
import { ensureTaskThread, readDesktopConcurrency, setThreadModel, setThreadReviewer } from '../harness/task-thread'
import { llmService } from '../llm/LlmService'
import { generateText, streamText } from '../llm/ai-runtime'
import type { HarnessTaskContractInput } from '../../shared/ipc/harness'
import {
  cancelTaskRun,
  closeoutTaskRun,
  closeTaskThread,
  getTaskRun,
  getTaskRunState,
  handoffTaskRun,
  listTaskRunStates,
  listTaskThreads,
  openTaskThread,
  pauseTaskRun,
  prepareTaskRun,
  readTaskHandoff,
  rebaselineTaskRun,
  repairTaskRun,
  resumeTaskRun,
  startTaskRun,
  takeoverTaskRun,
} from '../harness/execution-adapter'
import {
  HARNESS_COMMAND_CHANNELS,
  HARNESS_EVENT_CHANNELS,
  type HarnessApplyResult,
  type HarnessBinding,
  type HarnessEditOp,
  type HarnessFailure,
  type HarnessResolveResult,
  type HarnessRunCloseoutResult,
  type HarnessRunExecuteInput,
  type HarnessRunExecuteResult,
  type HarnessRunPrepared,
  type HarnessRunPrepareInput,
  type HarnessRunRepairInput,
  type HarnessRunReviewInput,
  type HarnessRunReviewResult,
  type HarnessRunState,
  type HarnessUndoPreview,
  type HarnessUndoResult,
  type HarnessMigrationPreview,
  type HarnessMigrationResult,
  type HarnessShareSelection,
} from '../../shared/ipc/harness'

const throwFailure = (code: HarnessFailure['code'], message: string, extra?: Partial<HarnessFailure>): never => {
  throw { code, message, ...extra } satisfies HarnessFailure
}

const RUN_FAILURE_CODES: ReadonlySet<string> = new Set([
  'NOT_FOUND',
  'SCHEMA_INVALID',
  'UNSUPPORTED_SCHEMA',
  'CONFLICT',
  'NOT_READY',
  'STALE_BASELINE',
  'DEPENDENCY_UNSATISFIED',
  'APPROVAL_REQUIRED',
  'PERMISSION_DENIED',
  'BUSY',
  'RECOVERY_REQUIRED',
  'INVALID_RELATION',
  'UNRESOLVED_REFERENCE',
  'CAPABILITY_UNAVAILABLE',
  'IO_ERROR',
])

/** First dispatcher diagnostic becomes the IPC failure; codes stay in the shared envelope. */
function throwRunFailure(errors: Array<{ code: string; message: string; path?: string }>): never {
  const first = errors[0]
  const code = (first && RUN_FAILURE_CODES.has(first.code) ? first.code : 'SCHEMA_INVALID') as HarnessFailure['code']
  throw { code, message: first?.message ?? 'run operation failed', ...(first?.path ? { path: first.path } : {}) } satisfies HarnessFailure
}

async function withRoot(cwd: string): Promise<string> {
  const resolved = await harnessNoteService.resolveRoot(cwd)
  if (!resolved.ok || !resolved.root) {
    throwFailure('NOT_FOUND', resolved.diagnostics[0]?.message ?? `no project notes under ${cwd}`)
  }
  return resolved.root as string
}

interface CurrentNote {
  note: ParsedNote
  relPath: string
  sha256: string
}

async function currentNote(root: string, uri: string): Promise<CurrentNote> {
  return harnessNoteService.readNote(root, uri)
}

export function registerHarnessHandlers(getWindow: () => BrowserWindow | null): void {
  // Note: wiki and blueprint resolve the same source — see .agents/notes/2026-09-25-note-wiki-r3--844bc2f1.md
  ipcMain.handle(HARNESS_COMMAND_CHANNELS.noteRead, async (_e, cwd: string, uri: string) => {
    if (typeof uri !== 'string' || !uri.startsWith('note://')) throw new Error('A complete Note URI is required')
    const source = await harnessNoteService.readNote(await withRoot(cwd), uri)
    return { uri, relPath: source.relPath, raw: source.raw, sourceHash: source.sha256,
      indexedSourceHash: source.indexedSourceHash, matchesSnapshot: source.matchesSnapshot,
      doc: toNoteDoc(source.note), view: readMarkdownView(source.note.body) }
  })
  ipcMain.handle(HARNESS_COMMAND_CHANNELS.taskRead, async (_e, cwd: string, uri: string) => readTaskDraft(await withRoot(cwd), uri))
  ipcMain.handle(HARNESS_COMMAND_CHANNELS.taskAdopt, async (_e, cwd: string, uri: string, expectedHash: string, contract: HarnessTaskContractInput) => adoptTask(await withRoot(cwd), uri, expectedHash, contract))
  harnessNoteService.onChange((event) => {
    getWindow()?.webContents.send(HARNESS_EVENT_CHANNELS.changed, {
      root: event.root,
      rev: event.rev,
      kinds: [...new Set(event.events.map((e) => e.type))],
      error: event.error,
    })
  })

  ipcMain.handle(HARNESS_COMMAND_CHANNELS.resolve, async (_e, cwd: string): Promise<HarnessResolveResult> => {
    const resolved = await harnessNoteService.resolveRoot(cwd)
    if (!resolved.ok || !resolved.root) return { ok: false, diagnostics: resolved.diagnostics }
    const view = await harnessNoteService.projectView(resolved.root)
    return {
      ok: true,
      root: resolved.root,
      repoId: view.repoId,
      repoName: view.repoName,
      projectId: view.blueprint.id,
      diagnostics: [],
    }
  })

  ipcMain.handle(HARNESS_COMMAND_CHANNELS.projectGraph, async (_e, cwd: string) => {
    const root = await withRoot(cwd)
    await harnessNoteService.watch(root)
    const view = await harnessNoteService.projectView(root)
    for (const checkout of view.blueprint.composition?.checkouts ?? []) {
      if (checkout.status === 'unbound') continue
      try { await harnessNoteService.watch(checkout.path) }
      catch (error) { view.blueprint.composition!.diagnostics.push({ code: 'WATCH_FAILED', checkoutId: checkout.checkoutId, message: String(error) }) }
    }
    return view
  })

  ipcMain.handle(HARNESS_COMMAND_CHANNELS.rescan, async (_e, cwd: string) => {
    const root = await withRoot(cwd)
    return harnessNoteService.rescan(root)
  })

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.apply,
    async (_e, cwd: string, operations: HarnessEditOp[], reason: string): Promise<HarnessApplyResult> => {
      const root = await withRoot(cwd)
      const view = await harnessNoteService.projectView(root)
      if (!view.repoId) throwFailure('NOT_FOUND', 'init .agents/harness.json with a repoId first')
      const repoId = view.repoId as string
      const ops: Array<{
        operationId: string
        type: 'create' | 'replace' | 'delete'
        uri: string
        expectedHash: string | null
        relativePath?: string
        afterMarkdown?: string
      }> = []
      const uris: string[] = []
      for (const op of operations) {
        if (op.kind === 'create') {
          const created = createNoteOp(repoId, nodeTypeToKind(op.nodeType), op.title, op.parentUri ?? null, reason)
          ops.push({ ...created })
          uris.push(created.uri)
        } else if (op.kind === 'update') {
          const current = await currentNote(root, op.uri)
          const managed = checkWritablePatch(op.patch)
          if (managed) throwFailure('HARNESS_MANAGED', managed.message, { path: op.uri })
          const produced = applyNodePatch(toNoteDoc(current.note), op.patch)
          if ('edit' in produced) {
            const raw = await readFile(join(root, current.relPath), 'utf8')
            const markdown = harnessNoteService.mergeNoteEdit(current.note, raw, produced.edit, reason)
            ops.push({
              operationId: `replace-${current.note.meta.id.slice(0, 8)}-${randomUUID().slice(0, 4)}`,
              type: 'replace',
              uri: op.uri,
              expectedHash: op.expectedHash,
              afterMarkdown: markdown,
            })
            uris.push(op.uri)
          } else {
            throw { code: produced.code ?? 'SCHEMA_INVALID', message: produced.message, path: op.uri } as HarnessFailure
          }
        } else if (op.kind === 'rename') {
          const current = await currentNote(root, op.uri)
          const raw = await readFile(join(root, current.relPath), 'utf8')
          ops.push({
            operationId: `rename-${current.note.meta.id.slice(0, 8)}`,
            type: 'replace',
            uri: op.uri,
            expectedHash: op.expectedHash,
            relativePath: op.relativePath,
            afterMarkdown: raw,
          })
          uris.push(op.uri)
        } else if (op.kind === 'reparent') {
          const current = await currentNote(root, op.uri)
          const raw = await readFile(join(root, current.relPath), 'utf8')
          const markdown = harnessNoteService.mergeNoteEdit(
            current.note,
            raw,
            { sections: {}, frontmatter: { parent: op.parentUri } },
            reason,
          )
          ops.push({
            operationId: `reparent-${current.note.meta.id.slice(0, 8)}`,
            type: 'replace',
            uri: op.uri,
            expectedHash: op.expectedHash,
            afterMarkdown: markdown,
          })
          uris.push(op.uri)
        } else {
          const current = await currentNote(root, op.uri)
          const raw = await readFile(join(root, current.relPath), 'utf8')
          const markdown = harnessNoteService.mergeNoteEdit(
            current.note,
            raw,
            { sections: {}, frontmatter: { lifecycle: 'archived' } },
            op.reason,
          )
          const archived = archiveNoteOp(op.uri, op.expectedHash, markdown, op.reason)
          ops.push({ ...archived })
          uris.push(op.uri)
        }
      }
      try {
        const report = await harnessNoteService.applyOperations(root, ops, reason || 'canvas edit')
        return {
          txId: report.txId,
          applied: report.applied.map((r, i) => ({ ...r, uri: uris[i] ?? '' })),
        }
      } catch (e) {
        const err = e as Partial<HarnessFailure> & { message?: unknown }
        if (err.code === 'HARNESS_CONFLICT' || err.code === 'CONFLICT') {
          throw {
            code: 'HARNESS_CONFLICT',
            message: String(err.message ?? 'conflict'),
            path: err.path,
            expectedHash: err.expectedHash,
            currentHash: err.currentHash,
          } as HarnessFailure
        }
        throw { code: err.code ?? 'SCHEMA_INVALID', message: String(err.message ?? e) } as HarnessFailure
      }
    },
  )

  ipcMain.handle(HARNESS_COMMAND_CHANNELS.bindingsGet, async (_e, cwd: string) => {
    const root = await withRoot(cwd)
    return harnessNoteService.getBindings(root)
  })

  ipcMain.handle(HARNESS_COMMAND_CHANNELS.bindingsSet, async (_e, cwd: string, binding: HarnessBinding) => {
    const root = await withRoot(cwd)
    return harnessNoteService.setBinding(root, binding)
  })

  ipcMain.handle(HARNESS_COMMAND_CHANNELS.sharePreview, async (_e, cwd: string, selection: HarnessShareSelection) => {
    const root = await withRoot(cwd)
    const snapshot = await harnessNoteService.shareSnapshot(root, selection)
    return { notes: snapshot.notes.length, json: JSON.stringify(snapshot, null, 2) }
  })

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.shareExport,
    async (_e, cwd: string, selection: HarnessShareSelection, outPath: string) => {
      const root = await withRoot(cwd)
      return harnessNoteService.exportSnapshot(root, selection, outPath)
    },
  )

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.shareImportPreview,
    async (_e, cwd: string, snapshot: IncomingSnapshot) => {
      const root = await withRoot(cwd)
      const plan = await harnessNoteService.previewShareImport(root, snapshot)
      return {
        notes: plan.notes.map((item) => ({ id: item.id, action: item.kind, ...('reason' in item && item.reason ? { reason: item.reason } : {}) })),
        receipts: plan.receipts.map((item) => ({ id: item.id, action: item.action, ...(item.reason ? { reason: item.reason } : {}) })),
      }
    },
  )

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.shareImportApply,
    async (_e, cwd: string, snapshot: IncomingSnapshot) => {
      const root = await withRoot(cwd)
      return harnessNoteService.applyShareImport(root, snapshot)
    },
  )

  // ── task runs (S8-JanusX): adapter OpResults cross IPC as data or coded failure ──

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.runPrepare,
    async (_e, cwd: string, input: HarnessRunPrepareInput): Promise<HarnessRunPrepared> => {
      const root = await withRoot(cwd)
      if (!input || typeof input.taskUri !== 'string' || !input.taskUri) {
        throwFailure('SCHEMA_INVALID', 'run prepare needs a task URI', { path: 'taskUri' })
      }
      if (!['xdo', 'xdel', 'xflow'].includes(input.mode)) {
        throwFailure('SCHEMA_INVALID', `bad run mode: ${String(input.mode)}`, { path: 'mode' })
      }
      if (input.closeout !== 'commit-required' && input.closeout !== 'working-tree-authorized') {
        throwFailure('SCHEMA_INVALID', `bad closeout: ${String(input.closeout)}`, { path: 'closeout' })
      }
      const prepared = await prepareTaskRun(root, {
        taskRef: input.taskUri,
        mode: input.mode,
        closeout: input.closeout,
        ...(input.authorizationRef ? { authorizationRef: input.authorizationRef } : {}),
        ...(input.maxAutoRepairs !== undefined ? { maxAutoRepairs: input.maxAutoRepairs } : {}),
        ...(input.executor ? { executor: input.executor } : {}),
      })
      if (!prepared.ok || !prepared.run) throwRunFailure(prepared.errors)
      return {
        runId: prepared.data.runId,
        taskUri: prepared.run.taskUri,
        state: prepared.run.state,
        attempt: prepared.run.attempt,
      }
    },
  )

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.runStart,
    async (
      _e,
      cwd: string,
      runId: string,
      owner: string,
      authorization: { by: string; ref?: string } | null,
    ): Promise<{ attempt: number }> => {
      const root = await withRoot(cwd)
      if (typeof runId !== 'string' || !runId) throwFailure('SCHEMA_INVALID', 'run start needs a run id', { path: 'runId' })
      if (typeof owner !== 'string' || !owner) throwFailure('SCHEMA_INVALID', 'run start needs an owner', { path: 'owner' })
      const started = await startTaskRun(root, runId, owner, authorization ?? null)
      if (!started.ok) throwRunFailure(started.errors)
      return started.data
    },
  )

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.runStatus,
    async (_e, cwd: string, runId: string): Promise<HarnessRunState> => {
      const root = await withRoot(cwd)
      if (typeof runId !== 'string' || !runId) throwFailure('SCHEMA_INVALID', 'run status needs a run id', { path: 'runId' })
      return getTaskRunState(root, runId)
    },
  )

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.runList,
    async (_e, cwd: string): Promise<HarnessRunState[]> => {
      const root = await withRoot(cwd)
      return listTaskRunStates(root)
    },
  )

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.runCancel,
    async (_e, cwd: string, runId: string): Promise<{ state: string }> => {
      const root = await withRoot(cwd)
      if (typeof runId !== 'string' || !runId) throwFailure('SCHEMA_INVALID', 'run cancel needs a run id', { path: 'runId' })
      // Renderer-driven cancel carries no lease token: the adapter maps a
      // null token onto an explicit takeover-free cancel path owned here.
      const lease = await getTaskRun(root, runId)
      if (!lease.run) throwRunFailure(lease.errors)
      const cancelled = await cancelTaskRun(root, runId, lease.run?.lease?.token ?? null)
      if (!cancelled.ok) throwRunFailure(cancelled.errors)
      const after = await getTaskRun(root, runId)
      return { state: after.run?.state ?? 'cancelled' }
    },
  )

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.runCloseout,
    async (_e, cwd: string, runId: string): Promise<HarnessRunCloseoutResult> => {
      const root = await withRoot(cwd)
      if (typeof runId !== 'string' || !runId) throwFailure('SCHEMA_INVALID', 'run closeout needs a run id', { path: 'runId' })
      const report = await closeoutTaskRun(root, runId, { repoRoot: root })
      if (!report.ok) throwRunFailure(report.errors)
      return report.data
    },
  )

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.runHandoff,
    async (_e, cwd: string, runId: string): Promise<{ path: string }> => {
      const root = await withRoot(cwd)
      if (typeof runId !== 'string' || !runId) throwFailure('SCHEMA_INVALID', 'run handoff needs a run id', { path: 'runId' })
      const handoff = await handoffTaskRun(root, runId)
      if (!handoff.ok) throwRunFailure(handoff.errors)
      return handoff.data
    },
  )

  // ── desktop xdo host (S8-JanusX): checks plus self-review in the main process ──
  // Lease tokens never cross IPC; the renderer passes intent and evidence only.

  const inFlight = new Map<string, AbortController>()
  const executionKey = (root: string, runId: string) => JSON.stringify([process.platform === 'win32' ? root.toLowerCase() : root, runId])

  ipcMain.handle(HARNESS_COMMAND_CHANNELS.runTranscript, async (_e, cwd: string, runId: string) => {
    const root = await withRoot(cwd)
    try {
      const transcript = await readTaskTranscript(root, runId)
      return { ...transcript, active: transcript.active || inFlight.has(executionKey(root, runId)) }
    } catch (error) {
      const failure = error as { code?: HarnessFailure['code']; message?: string }
      const code = failure.code ?? 'IO_ERROR'
      // Electron serializes Error.message; thrown records become "[object Object]".
      throw Object.assign(new Error(`${code}: ${failure.message ?? 'Cannot read implementation history'}`), { code })
    }
  })

  async function runStateOf(root: string, runId: string): Promise<{ state: string }> {
    const loaded = await getTaskRun(root, runId)
    if (!loaded.run) throwRunFailure(loaded.errors)
    return { state: loaded.run?.state ?? 'unknown' }
  }

  /** First config dir wins; null means the desktop runs unguarded and says so. */
  function desktopConfigRoot(): string | null {
    const candidates: string[] = []
    try {
      candidates.push(app.getAppPath())
    } catch {
      // Packaged shells without app paths fall through to the working copy.
    }
    candidates.push(process.cwd())
    for (const candidate of candidates) {
      try {
        if (existsSync(join(candidate, '.codex', 'config.toml'))) return candidate
      } catch {
        // Unreadable candidates never block execution.
      }
    }
    return null
  }

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.runExecute,
    async (_e, cwd: string, input: HarnessRunExecuteInput): Promise<HarnessRunExecuteResult> => {
      const root = await withRoot(cwd)
      const runId = input?.runId
      if (typeof runId !== 'string' || !runId) throwFailure('SCHEMA_INVALID', 'run execute needs a run id', { path: 'runId' })
      if (inFlight.has(executionKey(root, runId))) throwFailure('BUSY', 'this run already has an in-flight execution; abort it first', { path: 'runId' })
      const configRoot = desktopConfigRoot()
      const budget = configRoot ? await readDesktopConcurrency(configRoot) : null
      if (budget && inFlight.size >= budget.maxThreads) {
        throwFailure('BUSY', `desktop concurrency budget spent (${inFlight.size}/${budget.maxThreads}); wait for or abort a running execution`, { path: 'runId' })
      }
      if (inFlight.has(executionKey(root, runId))) throwFailure('BUSY', 'this run already has an in-flight execution', { path: 'runId' })
      const controller = new AbortController()
      inFlight.set(executionKey(root, runId), controller)
      try {
        const loaded = await getTaskRun(root, runId)
        if (!loaded.run) throwRunFailure(loaded.errors)
        const leaseToken = loaded.run?.lease?.token
        if (!leaseToken) throwFailure('BUSY', 'run has no owner lease; start it before executing', { path: 'runId' })
        const token = leaseToken as string
        const taskUri = loaded.run?.taskUri as string
        // The thread outlives every turn: recovery reuses the stored model
        // endpoint, and repairs reattach to the same history.
        const threadError = (error: unknown): never => throwRunFailure([{ code: 'IO_ERROR', message: error instanceof Error ? error.message : String(error) }])
        let thread = await ensureTaskThread(root, { runId, taskUri, mode: loaded.run?.mode ?? 'xdo' }).catch(threadError)
        const providerId = input?.providerId?.trim() || thread.model?.providerId
        const modelId = input?.modelId?.trim() || thread.model?.modelId
        if (input?.providerId?.trim() && input?.modelId?.trim()) {
          thread = await setThreadModel(root, runId, { providerId: input.providerId.trim(), modelId: input.modelId.trim() }).catch(threadError)
        }
        const reviewerProviderId = input?.reviewerProviderId?.trim() || thread.reviewerModel?.providerId || providerId
        const reviewerModelId = input?.reviewerModelId?.trim() || thread.reviewerModel?.modelId || modelId
        const reviewer = input?.reviewer?.trim() || thread.reviewer
        if (loaded.run?.mode === 'xflow' && reviewerProviderId && reviewerModelId) {
          thread = await setThreadReviewer(root, runId, { providerId: reviewerProviderId, modelId: reviewerModelId }, reviewer).catch(threadError)
        }
        const maxTurns = await configService.getAgentMaxSteps().catch(() => DEFAULT_AGENT_MAX_STEPS)
        const reviewPort = (kind: 'self' | 'independent') => async (evidence: Parameters<ReturnType<typeof createModelReviewPort>>[0], signal?: AbortSignal) => {
          const provider = kind === 'independent' ? reviewerProviderId : providerId
          const model = kind === 'independent' ? reviewerModelId : modelId
          return createModelReviewPort(taskUri, (await getTaskRun(root, runId)).run?.attempt ?? 0, {
            providerId: provider, modelId: model,
            getModel: (provider, model) => llmService.getLanguageModel('janus', provider, model),
            generateReviewText: (_model, prompt, signal) => generateDesktopReviewText(root, runId, token, kind, {
              providerId: provider ?? '', modelId: model ?? '', maxTurns,
              getModel: (provider, model) => llmService.getLanguageModel('janus', provider, model),
              streamTextFn: streamText as unknown as ChatTurnPorts['streamTextFn'],
            }, prompt, signal),
          }, kind === 'independent' ? buildEvaluatorPrompt : undefined)(evidence, signal)
        }
        const timeoutMs = input?.timeoutMs === undefined ? undefined : Math.min(600_000, Math.max(5_000, Math.floor(input.timeoutMs)))
        const manualEvidence = Array.isArray(input?.manualEvidence) ? input.manualEvidence : []
        for (const item of manualEvidence) {
          if (!item || typeof item.stepId !== 'string' || typeof item.observer !== 'string' || typeof item.observation !== 'string') {
            throwFailure('SCHEMA_INVALID', 'manual evidence needs stepId, observer, and observation', { path: 'manualEvidence' })
          }
        }
        const executed = await executeDesktopTask(root, runId, token, {
          implement: createDesktopImplementationPort({
            providerId: providerId ?? '', modelId: modelId ?? '',
            getModel: (provider, model) => llmService.getLanguageModel('janus', provider, model),
            streamTextFn: streamText as unknown as ChatTurnPorts['streamTextFn'],
            maxTurns,
          }),
          command: (step, signal) => runDesktopCommand(root, step, { ...(timeoutMs === undefined ? {} : { timeoutMs }), signal }),
          review: reviewPort('self'),
          ...(loaded.run?.mode === 'xflow' ? { independentReview: reviewPort('independent') } : {}),
        }, { manualEvidence, reviewer, ...(timeoutMs === undefined ? {} : { timeoutMs }), signal: controller.signal })
        if (!executed.ok) throwRunFailure(executed.errors)
        return {
          receiptId: executed.data.receiptId,
          completed: executed.data.completed,
          checks: executed.data.checks.map((check) => ({ id: check.id, kind: check.kind, status: check.status, summary: check.summary })),
          repairedAttempt: executed.data.repairedAttempt ?? null,
        }
      } finally {
        inFlight.delete(executionKey(root, runId))
      }
    },
  )

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.runPause,
    async (_e, cwd: string, runId: string): Promise<{ state: string }> => {
      const root = await withRoot(cwd)
      if (typeof runId !== 'string' || !runId) throwFailure('SCHEMA_INVALID', 'run pause needs a run id', { path: 'runId' })
      const loaded = await getTaskRun(root, runId)
      if (!loaded.run) throwRunFailure(loaded.errors)
      const paused = await pauseTaskRun(root, runId, loaded.run?.lease?.token ?? '')
      if (!paused.ok) throwRunFailure(paused.errors)
      return runStateOf(root, runId)
    },
  )

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.runResume,
    async (_e, cwd: string, runId: string): Promise<{ state: string }> => {
      const root = await withRoot(cwd)
      if (typeof runId !== 'string' || !runId) throwFailure('SCHEMA_INVALID', 'run resume needs a run id', { path: 'runId' })
      const loaded = await getTaskRun(root, runId)
      if (!loaded.run) throwRunFailure(loaded.errors)
      const resumed = await resumeTaskRun(root, runId, loaded.run?.lease?.token ?? '')
      if (!resumed.ok) throwRunFailure(resumed.errors)
      return runStateOf(root, runId)
    },
  )

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.runRebaseline,
    async (_e, cwd: string, runId: string, authorization: { by: string; ref?: string } | null): Promise<{ state: string }> => {
      const root = await withRoot(cwd)
      if (typeof runId !== 'string' || !runId) throwFailure('SCHEMA_INVALID', 'run rebaseline needs a run id', { path: 'runId' })
      const loaded = await getTaskRun(root, runId)
      if (!loaded.run || !loaded.run.taskUri) throwRunFailure(loaded.errors.length ? loaded.errors : [{ code: 'NOT_FOUND', message: 'run is missing' }])
      const rebased = await rebaselineTaskRun(root, runId, loaded.run?.lease?.token ?? '', loaded.run?.taskUri as string, authorization ?? null)
      if (!rebased.ok) throwRunFailure(rebased.errors)
      return runStateOf(root, runId)
    },
  )

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.runAbort,
    async (_e, cwd: string, runId: string): Promise<{ state: string }> => {
      const root = await withRoot(cwd)
      if (typeof runId !== 'string' || !runId) throwFailure('SCHEMA_INVALID', 'run abort needs a run id', { path: 'runId' })
      const controller = inFlight.get(executionKey(root, runId))
      if (!controller) throwFailure('NOT_READY', 'no in-flight execution owns this run', { path: 'runId' })
      ;(controller as AbortController).abort()
      return runStateOf(root, runId)
    },
  )

  // ── external runner backflow (S8-JanusX): handoff reads plus host takeover ──
  // The external terminal owns its process; the desktop only hands over the
  // pinned baseline and validates whatever evidence comes back through the
  // shared kernel. Takeover tokens stay in the main process.

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.runHandoffRead,
    async (_e, cwd: string, runId: string): Promise<{ path: string; markdown: string }> => {
      const root = await withRoot(cwd)
      if (typeof runId !== 'string' || !runId) throwFailure('SCHEMA_INVALID', 'run handoff read needs a run id', { path: 'runId' })
      const handoff = await readTaskHandoff(root, runId)
      if (!handoff.ok) throwRunFailure(handoff.errors)
      return handoff.data
    },
  )

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.runTakeover,
    async (_e, cwd: string, runId: string, newOwner: string, reason: string): Promise<{ state: string }> => {
      const root = await withRoot(cwd)
      if (typeof runId !== 'string' || !runId) throwFailure('SCHEMA_INVALID', 'run takeover needs a run id', { path: 'runId' })
      if (typeof newOwner !== 'string' || !newOwner.trim()) throwFailure('SCHEMA_INVALID', 'run takeover needs a new owner', { path: 'newOwner' })
      if (typeof reason !== 'string' || !reason.trim()) throwFailure('SCHEMA_INVALID', 'takeover needs a reason; silent ownership changes strand runs', { path: 'reason' })
      if (inFlight.has(executionKey(root, runId))) throwFailure('BUSY', 'an in-flight desktop execution owns this run; abort it first', { path: 'runId' })
      const taken = await takeoverTaskRun(root, runId, newOwner.trim(), reason.trim())
      if (!taken.ok) throwRunFailure(taken.errors)
      return runStateOf(root, runId)
    },
  )

  // ── thread registry (S8-JanusX): background threads list, activate, close ──
  // Threads live with their run on this checkout. Closing destroys only the
  // thread file plus briefs after an explicit user decision; Notes, receipts,
  // and run records always survive.

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.runThreads,
    async (_e, cwd: string) => {
      const root = await withRoot(cwd)
      return (await listTaskThreads(root)).threads
    },
  )

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.runThread,
    async (_e, cwd: string, runId: string) => {
      const root = await withRoot(cwd)
      if (typeof runId !== 'string' || !runId) throwFailure('SCHEMA_INVALID', 'run thread needs a run id', { path: 'runId' })
      const opened = await openTaskThread(root, runId)
      if (!opened.ok) throwRunFailure(opened.errors)
      return opened.data
    },
  )

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.runThreadClose,
    async (_e, cwd: string, runId: string): Promise<{ closed: boolean }> => {
      const root = await withRoot(cwd)
      if (typeof runId !== 'string' || !runId) throwFailure('SCHEMA_INVALID', 'run thread close needs a run id', { path: 'runId' })
      if (inFlight.has(executionKey(root, runId))) throwFailure('BUSY', 'an in-flight desktop execution owns this run; abort it first', { path: 'runId' })
      const closed = await closeTaskThread(root, runId)
      if (!closed.ok) throwRunFailure(closed.errors)
      return closed.data
    },
  )

  // ── delegated review and limited repair (S8-JanusX): read-only evaluator ──
  // The evaluator audits pinned evidence on its own thread and never inherits
  // implementor history. Repairs spend the kernel budget through explicit
  // packets; finishing re-validates against a live snapshot.

  async function runOwnerToken(root: string, runId: string): Promise<{ token: string; owner: string }> {
    const loaded = await getTaskRun(root, runId)
    if (!loaded.run) throwRunFailure(loaded.errors)
    const token = loaded.run?.lease?.token
    const owner = loaded.run?.lease?.owner
    if (!token || !owner) throwFailure('BUSY', 'run has no owner lease; start it before review', { path: 'runId' })
    return { token: token as string, owner: owner as string }
  }

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.runReview,
    async (_e, cwd: string, input: HarnessRunReviewInput): Promise<HarnessRunReviewResult> => {
      const root = await withRoot(cwd)
      const runId = input?.runId
      if (typeof runId !== 'string' || !runId) throwFailure('SCHEMA_INVALID', 'run review needs a run id', { path: 'runId' })
      const reviewer = input?.reviewer?.trim() ?? ''
      if (!reviewer) throwFailure('SCHEMA_INVALID', 'independent review needs a reviewer identity', { path: 'reviewer' })
      if (inFlight.has(executionKey(root, runId))) throwFailure('BUSY', 'an in-flight desktop execution owns this run; abort it first', { path: 'runId' })
      const { token } = await runOwnerToken(root, runId)
      const loaded = await getTaskRun(root, runId)
      const taskUri = loaded.run?.taskUri as string
      const attempt = loaded.run?.attempt ?? 0
      const providerId = input?.providerId?.trim()
      const modelId = input?.modelId?.trim()
      const reviewed = await requestIndependentReview(root, runId, token, {
        review: createModelReviewPort(taskUri, attempt, {
          ...(providerId ? { providerId } : {}),
          ...(modelId ? { modelId } : {}),
          getModel: (provider, model) => llmService.getLanguageModel('janus', provider, model),
          generateReviewText: async (model, prompt) => {
            const result = await generateText({ model: model as never, maxSteps: 1, messages: [{ role: 'user', content: prompt }] as never })
            return (result as { text?: string }).text ?? ''
          },
        }, buildEvaluatorPrompt),
      }, { reviewer, ...(input?.receiptId ? { receiptId: input.receiptId } : {}) })
      if (!reviewed.ok) throwRunFailure(reviewed.errors)
      return reviewed.data
    },
  )

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.runFinish,
    async (_e, cwd: string, runId: string): Promise<{ receiptId: string; completed: boolean }> => {
      const root = await withRoot(cwd)
      if (typeof runId !== 'string' || !runId) throwFailure('SCHEMA_INVALID', 'run finish needs a run id', { path: 'runId' })
      if (inFlight.has(executionKey(root, runId))) throwFailure('BUSY', 'an in-flight desktop execution owns this run; abort it first', { path: 'runId' })
      const { token } = await runOwnerToken(root, runId)
      const finished = await finishWithLatestReceipt(root, runId, token)
      if (!finished.ok) throwRunFailure(finished.errors)
      return finished.data
    },
  )

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.runRepair,
    async (_e, cwd: string, input: HarnessRunRepairInput): Promise<{ attempt: number; state: string }> => {
      const root = await withRoot(cwd)
      const runId = input?.runId
      if (typeof runId !== 'string' || !runId) throwFailure('SCHEMA_INVALID', 'run repair needs a run id', { path: 'runId' })
      const summary = input?.summary?.trim() ?? ''
      if (!summary) throwFailure('SCHEMA_INVALID', 'repair needs a short failure summary', { path: 'summary' })
      if (inFlight.has(executionKey(root, runId))) throwFailure('BUSY', 'an in-flight desktop execution owns this run; abort it first', { path: 'runId' })
      const loaded = await getTaskRun(root, runId)
      if (!loaded.run) throwRunFailure(loaded.errors)
      const failureReceiptId = loaded.run?.receipts[(loaded.run?.receipts.length ?? 1) - 1]
      if (!failureReceiptId) throwFailure('NOT_READY', 'repair needs a recorded failure receipt; review before repairing', { path: 'receipts' })
      const lease = loaded.run?.lease
      const repaired = await repairTaskRun(root, runId, lease?.token ?? '', {
        failureReceiptId,
        summary,
        auto: false,
        ...(lease ? { authorization: { by: lease.owner } } : {}),
      })
      if (!repaired.ok) throwRunFailure(repaired.errors)
      const after = await getTaskRun(root, runId)
      return { attempt: repaired.data.attempt, state: after.run?.state ?? 'running' }
    },
  )

  // ── managed undo (S8-JanusX, legacy-loop equivalence): preview then apply ──
  // Undo reverses one committed write as a new undoable changeset. Conflicts
  // refuse the whole package; evidence and receipts never move.

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.undoPreview,
    async (_e, cwd: string, txId?: string): Promise<HarnessUndoPreview> => {
      const root = await withRoot(cwd)
      const previewed = await previewUndo(root, txId)
      if (!previewed.preview) throwRunFailure(previewed.errors)
      return previewed.preview
    },
  )

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.undoApply,
    async (_e, cwd: string, txId?: string): Promise<HarnessUndoResult> => {
      const root = await withRoot(cwd)
      const applied = await applyUndo(root, txId)
      if (applied.errors.length > 0) throwRunFailure(applied.errors)
      return { txId: applied.txId, reverted: applied.reverted }
    },
  )

  // ── on-demand legacy migration (S8-JanusX): JSON blueprint becomes Notes ──
  // Preview never writes. Apply validates every note, writes once through
  // the managed transaction, then archives (never deletes) the JSON source.

  async function migrationSource(cwd: string, blueprintId: string) {
    const root = await withRoot(cwd)
    if (typeof blueprintId !== 'string' || !blueprintId) throwFailure('SCHEMA_INVALID', 'migration needs a blueprint id', { path: 'blueprintId' })
    const view = await harnessNoteService.projectView(root)
    if (!view.repoId) throwFailure('NOT_FOUND', 'init .agents/harness.json with a repoId first')
    const blueprint = await blueprintStore.loadBlueprint(GLOBAL_BLUEPRINT_SCOPE, blueprintId)
    if (!blueprint) throwFailure('NOT_FOUND', `unknown blueprint ${blueprintId}`, { path: 'blueprintId' })
    const audits = await blueprintMaintenanceService.listAudits({ blueprintId }).catch(() => [])
    return { root: root as string, repoId: view.repoId as string, blueprint: blueprint!, audits }
  }

  function throwMigrationFailure(error: unknown): never {
    const failure = error as { code?: string; message?: string; path?: string }
    throwRunFailure([{ code: failure.code ?? 'SCHEMA_INVALID', message: failure.message ?? String(error), ...(failure.path ? { path: failure.path } : {}) }])
  }

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.migratePreview,
    async (_e, cwd: string, blueprintId: string): Promise<HarnessMigrationPreview> => {
      const { repoId, blueprint, audits } = await migrationSource(cwd, blueprintId)
      try {
        return previewMigration(blueprint, repoId, audits)
      } catch (error) {
        throwMigrationFailure(error)
      }
    },
  )

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.migrateApply,
    async (_e, cwd: string, blueprintId: string): Promise<HarnessMigrationResult> => {
      const { root, repoId, blueprint, audits } = await migrationSource(cwd, blueprintId)
      try {
        const result = await applyMigration(root, repoId, blueprint, audits, archiveBlueprintSource)
        blueprintStore.evictBlueprint(blueprintId)
        return result
      } catch (error) {
        throwMigrationFailure(error)
      }
    },
  )
}
