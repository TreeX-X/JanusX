/**
 * @file Harness IPC Handlers (S4)
 * @description Project-note resolve/graph/apply/bind/share channels over the
 *  single HarnessNoteService. Failures cross IPC as plain HarnessFailure
 *  data; the renderer matches `code`, never Error identity.
 */
import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { BrowserWindow, ipcMain } from 'electron'
import type { ParsedNote } from '@janus-agent/harness-core'
import {
  applyNodePatch,
  archiveNoteOp,
  checkWritablePatch,
  createNoteOp,
  nodeTypeToKind,
} from '../harness/artifact-producer'
import { harnessNoteService } from '../harness/service'
import { adoptTask, readTaskDraft } from '../harness/task-adoption'
import { buildDesktopReviewPrompt } from '../harness/desktop-review'
import { executeDesktopXdo, runDesktopCommand, reviewClaimFromText } from '../harness/desktop-executor'
import { llmService } from '../llm/LlmService'
import { generateText } from '../llm/ai-runtime'
import type { HarnessTaskContractInput } from '../../shared/ipc/harness'
import {
  cancelTaskRun,
  closeoutTaskRun,
  getTaskRun,
  getTaskRunState,
  handoffTaskRun,
  listTaskRunStates,
  pauseTaskRun,
  prepareTaskRun,
  rebaselineTaskRun,
  resumeTaskRun,
  startTaskRun,
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
  type HarnessRunState,
  type HarnessShareSelection,
} from '../../shared/ipc/harness'

const throwFailure = (code: HarnessFailure['code'], message: string, extra?: Partial<HarnessFailure>): never => {
  throw { code, message, ...extra } satisfies HarnessFailure
}

const RUN_FAILURE_CODES: ReadonlySet<string> = new Set([
  'NOT_FOUND',
  'SCHEMA_INVALID',
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
  const id = uri.split('/').pop() ?? uri
  return harnessNoteService.readNote(root, id)
}

export function registerHarnessHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(HARNESS_COMMAND_CHANNELS.taskRead, async (_e, cwd: string, uri: string) => readTaskDraft(await withRoot(cwd), uri))
  ipcMain.handle(HARNESS_COMMAND_CHANNELS.taskAdopt, async (_e, cwd: string, uri: string, expectedHash: string, contract: HarnessTaskContractInput) => adoptTask(await withRoot(cwd), uri, expectedHash, contract))
  harnessNoteService.onChange((event) => {
    getWindow()?.webContents.send(HARNESS_EVENT_CHANNELS.changed, {
      root: event.root,
      rev: event.rev,
      kinds: [...new Set(event.events.map((e) => e.type))],
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
    return harnessNoteService.projectView(root)
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
          const produced = applyNodePatch(current.note, op.patch)
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

  async function runStateOf(root: string, runId: string): Promise<{ state: string }> {
    const loaded = await getTaskRun(root, runId)
    if (!loaded.run) throwRunFailure(loaded.errors)
    return { state: loaded.run?.state ?? 'unknown' }
  }

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.runExecute,
    async (_e, cwd: string, input: HarnessRunExecuteInput): Promise<HarnessRunExecuteResult> => {
      const root = await withRoot(cwd)
      const runId = input?.runId
      if (typeof runId !== 'string' || !runId) throwFailure('SCHEMA_INVALID', 'run execute needs a run id', { path: 'runId' })
      if (inFlight.has(runId)) throwFailure('BUSY', 'this run already has an in-flight execution; abort it first', { path: 'runId' })
      const loaded = await getTaskRun(root, runId)
      if (!loaded.run) throwRunFailure(loaded.errors)
      const leaseToken = loaded.run?.lease?.token
      if (!leaseToken) throwFailure('BUSY', 'run has no owner lease; start it before executing', { path: 'runId' })
      const token = leaseToken as string
      const taskUri = loaded.run?.taskUri as string
      const attempt = loaded.run?.attempt ?? 0
      const timeoutMs = input?.timeoutMs === undefined ? undefined : Math.min(600_000, Math.max(5_000, Math.floor(input.timeoutMs)))
      const manualEvidence = Array.isArray(input?.manualEvidence) ? input.manualEvidence : []
      for (const item of manualEvidence) {
        if (!item || typeof item.stepId !== 'string' || typeof item.observer !== 'string' || typeof item.observation !== 'string') {
          throwFailure('SCHEMA_INVALID', 'manual evidence needs stepId, observer, and observation', { path: 'manualEvidence' })
        }
      }
      const controller = new AbortController()
      inFlight.set(runId, controller)
      try {
        const providerId = input?.providerId
        const modelId = input?.modelId
        const executed = await executeDesktopXdo(root, runId, token, {
          command: (step, signal) => runDesktopCommand(root, step, { ...(timeoutMs === undefined ? {} : { timeoutMs }), signal }),
          review: async (reviewInput, signal) => {
            if (!providerId || !modelId) {
              throw new Error('CAPABILITY_UNAVAILABLE: self-review needs a provider and model; pick the review model and retry')
            }
            if (signal?.aborted) throw new Error('BUSY: review aborted; the run is paused')
            const prompt = buildDesktopReviewPrompt({
              taskUri,
              attempt,
              manifestHash: reviewInput.manifestHash,
              manifest: reviewInput.manifest,
              checks: reviewInput.checks,
              criteria: reviewInput.criteria,
            })
            const model = await llmService.getLanguageModel('janus', providerId, modelId)
            const result = await generateText({ model: model as never, maxSteps: 1, messages: [{ role: 'user', content: prompt }] as never })
            const text = (result as { text?: string }).text?.trim() ?? ''
            if (!text) throw new Error('NOT_READY: self-review returned no text; refusing completion')
            const claim = reviewClaimFromText(text)
            if (!claim.ok) throw new Error(`${claim.errors[0]?.code ?? 'SCHEMA_INVALID'}: ${claim.errors[0]?.message ?? 'self-review refused'}`)
            return claim.claim
          },
        }, { manualEvidence, ...(timeoutMs === undefined ? {} : { timeoutMs }), signal: controller.signal })
        if (!executed.ok) throwRunFailure(executed.errors)
        return {
          receiptId: executed.data.receiptId,
          completed: executed.data.completed,
          checks: executed.data.checks.map((check) => ({ id: check.id, kind: check.kind, status: check.status, summary: check.summary })),
        }
      } finally {
        inFlight.delete(runId)
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
      const controller = inFlight.get(runId)
      if (!controller) throwFailure('NOT_READY', 'no in-flight execution owns this run', { path: 'runId' })
      ;(controller as AbortController).abort()
      return runStateOf(root, runId)
    },
  )
}
