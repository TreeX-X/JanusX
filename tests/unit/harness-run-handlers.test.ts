import { describe, expect, it, vi } from 'vitest'
import { HARNESS_COMMAND_CHANNELS } from '../../src/shared/ipc/harness'

const mocks = vi.hoisted(() => ({
  resolveRoot: vi.fn(),
  prepareTaskRun: vi.fn(),
  startTaskRun: vi.fn(),
  getTaskRun: vi.fn(),
  getTaskRunState: vi.fn(),
  listTaskRunStates: vi.fn(),
  cancelTaskRun: vi.fn(),
  closeoutTaskRun: vi.fn(),
  handoffTaskRun: vi.fn(),
}))

const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()

vi.mock('electron', () => ({
  app: { getPath: () => `${process.env.TEMP ?? process.cwd()}\\janusx-harness-run-${process.pid}` },
  BrowserWindow: { fromWebContents: () => null },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, fn)
    },
  },
}))

vi.mock('../../src/main/harness/service', () => ({
  harnessNoteService: { resolveRoot: mocks.resolveRoot, onChange: vi.fn() },
}))

vi.mock('../../src/main/harness/execution-adapter', () => ({
  prepareTaskRun: mocks.prepareTaskRun,
  startTaskRun: mocks.startTaskRun,
  getTaskRun: mocks.getTaskRun,
  getTaskRunState: mocks.getTaskRunState,
  listTaskRunStates: mocks.listTaskRunStates,
  cancelTaskRun: mocks.cancelTaskRun,
  closeoutTaskRun: mocks.closeoutTaskRun,
  handoffTaskRun: mocks.handoffTaskRun,
}))

async function handler(channel: string): Promise<(...args: unknown[]) => Promise<unknown>> {
  if (handlers.size === 0) {
    const { registerHarnessHandlers } = await import('../../src/main/ipc/harness-handlers')
    registerHarnessHandlers(() => null)
  }
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`missing handler ${channel}`)
  return fn
}

const ROOT = 'C:\\checkout'
const TASK_URI = 'note://8fa19f17-c717-43a8-93a7-810a5e0cbc91/11111111-1111-4111-8111-111111111111'
const RUN = {
  schema: 'harness-run/1',
  runId: 'run-1',
  taskUri: TASK_URI,
  mode: 'xdo',
  state: 'queued',
  attempt: 0,
  executor: 'internal',
  lease: null,
  baseline: { taskContractHash: 'a'.repeat(64), inputs: [] },
  repairBudget: { maxAuto: 1, usedAuto: 0 },
  repairs: [],
  receipts: [],
  takeovers: [],
  closeout: 'commit-required',
  createdAt: '2026-09-18T00:00:00.000Z',
  updatedAt: '2026-09-18T00:00:00.000Z',
}

describe('harness run IPC mapping (S8-JanusX surface)', () => {
  it('resolves the checkout before touching runs', async () => {
    mocks.resolveRoot.mockResolvedValueOnce({ ok: false, diagnostics: [{ code: 'NOT_FOUND', message: 'no .agents' }] })
    const prepare = await handler(HARNESS_COMMAND_CHANNELS.runPrepare)
    await expect(prepare({}, 'C:\\elsewhere', { taskUri: TASK_URI, mode: 'xdo', closeout: 'commit-required' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(mocks.prepareTaskRun).not.toHaveBeenCalled()
    mocks.resolveRoot.mockResolvedValue({ ok: true, root: ROOT, diagnostics: [] })
  })

  it('prepares runs and surfaces the first diagnostic as the failure', async () => {
    const prepare = await handler(HARNESS_COMMAND_CHANNELS.runPrepare)
    mocks.prepareTaskRun.mockResolvedValueOnce({ ok: true, run: RUN, errors: [], data: { runId: 'run-1' } })
    await expect(
      prepare({}, ROOT, { taskUri: TASK_URI, mode: 'xdo', closeout: 'commit-required' }),
    ).resolves.toMatchObject({ runId: 'run-1', taskUri: TASK_URI, state: 'queued', attempt: 0 })

    mocks.prepareTaskRun.mockResolvedValueOnce({ ok: false, run: null, errors: [{ code: 'NOT_READY', message: 'draft', path: 'lifecycle' }], data: { runId: '' } })
    await expect(
      prepare({}, ROOT, { taskUri: TASK_URI, mode: 'xdo', closeout: 'commit-required' }),
    ).rejects.toMatchObject({ code: 'NOT_READY', path: 'lifecycle' })

    await expect(prepare({}, ROOT, { taskUri: TASK_URI, mode: 'nope', closeout: 'commit-required' })).rejects.toMatchObject({
      code: 'SCHEMA_INVALID',
      path: 'mode',
    })
    expect(mocks.prepareTaskRun).toHaveBeenCalledTimes(2)
  })

  it('starts, reads, lists, cancels, closeouts, and hands off runs', async () => {
    const start = await handler(HARNESS_COMMAND_CHANNELS.runStart)
    mocks.startTaskRun.mockResolvedValueOnce({ ok: true, run: { ...RUN, state: 'running' }, errors: [], data: { attempt: 1 } })
    await expect(start({}, ROOT, 'run-1', 'desktop', { by: 'desktop' })).resolves.toEqual({ attempt: 1 })
    mocks.startTaskRun.mockResolvedValueOnce({ ok: false, run: null, errors: [{ code: 'STALE_BASELINE', message: 'moved' }], data: { attempt: 0 } })
    await expect(start({}, ROOT, 'run-1', 'desktop', { by: 'desktop' })).rejects.toMatchObject({ code: 'STALE_BASELINE' })

    const status = await handler(HARNESS_COMMAND_CHANNELS.runStatus)
    mocks.getTaskRunState.mockResolvedValueOnce({ ...RUN, state: 'running', attempt: 1, receipts: 0 })
    await expect(status({}, ROOT, 'run-1')).resolves.toMatchObject({ runId: 'run-1', state: 'running', receipts: 0 })
    mocks.getTaskRunState.mockRejectedValueOnce({ code: 'IO_ERROR', message: 'gone' })
    await expect(status({}, ROOT, 'run-1')).rejects.toMatchObject({ code: 'IO_ERROR' })

    const list = await handler(HARNESS_COMMAND_CHANNELS.runList)
    mocks.listTaskRunStates.mockResolvedValueOnce([RUN])
    await expect(list({}, ROOT)).resolves.toHaveLength(1)

    const cancel = await handler(HARNESS_COMMAND_CHANNELS.runCancel)
    mocks.getTaskRun.mockResolvedValueOnce({ run: { ...RUN, lease: { token: 'tok', owner: 'desktop', at: 'now' } }, errors: [] })
    mocks.cancelTaskRun.mockResolvedValueOnce({ ok: true, run: { ...RUN, state: 'cancelled' }, errors: [], data: undefined })
    mocks.getTaskRun.mockResolvedValueOnce({ run: { ...RUN, state: 'cancelled' }, errors: [] })
    await expect(cancel({}, ROOT, 'run-1')).resolves.toEqual({ state: 'cancelled' })
    expect(mocks.cancelTaskRun).toHaveBeenCalledWith(ROOT, 'run-1', 'tok')

    const closeout = await handler(HARNESS_COMMAND_CHANNELS.runCloseout)
    mocks.closeoutTaskRun.mockResolvedValueOnce({ ok: true, run: RUN, errors: [], data: { satisfied: false, detail: 'no commit yet' } })
    await expect(closeout({}, ROOT, 'run-1')).resolves.toEqual({ satisfied: false, detail: 'no commit yet' })

    const handoff = await handler(HARNESS_COMMAND_CHANNELS.runHandoff)
    mocks.handoffTaskRun.mockResolvedValueOnce({ ok: true, run: RUN, errors: [], data: { path: 'C:\\handoff.md' } })
    await expect(handoff({}, ROOT, 'run-1')).resolves.toEqual({ path: 'C:\\handoff.md' })
  })
})
