import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HARNESS_COMMAND_CHANNELS, HARNESS_EVENT_CHANNELS, type HarnessAPI } from '../../src/shared/ipc/harness'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  expose: vi.fn(),
  send: vi.fn(),
}))

let harnessApi: HarnessAPI
const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()

vi.mock('electron', () => ({
  app: { getPath: () => `${process.env.TEMP ?? process.cwd()}\\janusx-harness-ipc-${process.pid}` },
  BrowserWindow: { fromWebContents: () => null },
  contextBridge: {
    exposeInMainWorld: (_name: string, api: { harness: HarnessAPI }) => {
      harnessApi = api.harness
      mocks.expose(api)
    },
  },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, fn)
      mocks.handle(channel, fn)
    },
  },
  ipcRenderer: {
    invoke: mocks.invoke,
    on: mocks.on,
    removeListener: mocks.removeListener,
    send: mocks.send,
  },
}))

vi.mock('../../src/main/harness/service', () => ({
  harnessNoteService: {
    resolveRoot: vi.fn(),
    projectView: vi.fn(),
    rescan: vi.fn(),
    applyOperations: vi.fn(),
    readNote: vi.fn(),
    mergeNoteEdit: vi.fn(),
    getBindings: vi.fn(),
    setBinding: vi.fn(),
    shareSnapshot: vi.fn(),
    exportSnapshot: vi.fn(),
    watch: vi.fn(),
    onChange: vi.fn(),
  },
}))

vi.mock('../../src/main/harness/execution-adapter', () => ({
  cancelTaskRun: vi.fn(),
  closeoutTaskRun: vi.fn(),
  getTaskRun: vi.fn(),
  handoffTaskRun: vi.fn(),
  listTaskRuns: vi.fn(),
  prepareTaskRun: vi.fn(),
  startTaskRun: vi.fn(),
}))

async function loadAll(): Promise<void> {
  handlers.clear()
  await import('../../src/main/ipc/harness-handlers')
  const { registerHarnessHandlers } = await import('../../src/main/ipc/harness-handlers')
  registerHarnessHandlers(() => null)
  await import('../../src/preload/index')
}

describe('harness IPC contract', () => {
  beforeEach(() => {
    vi.resetModules()
    handlers.clear()
  })

  it('registers every command channel exactly once', async () => {
    await loadAll()
    for (const channel of Object.values(HARNESS_COMMAND_CHANNELS)) {
      expect(handlers.has(channel), channel).toBe(true)
    }
    expect(Object.keys(HARNESS_EVENT_CHANNELS)).toContain('changed')
  })

  it('exposes the full renderer API through preload', async () => {
    await loadAll()
    for (const method of [
      'resolve',
      'projectGraph',
      'rescan',
      'apply',
      'getBindings',
      'setBinding',
      'sharePreview',
      'shareExport',
      'runPrepare',
      'runStart',
      'runStatus',
      'runList',
      'runCancel',
      'runCloseout',
      'runHandoff',
      'onChanged',
    ] as const) {
      expect(typeof harnessApi[method], method).toBe('function')
    }
  })
})
