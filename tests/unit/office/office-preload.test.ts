import { beforeAll, describe, expect, it, vi } from 'vitest'
import { OFFICE_EVENT_CHANNELS, OFFICE_INVOKE_CHANNELS } from '../../../src/shared/office'

const invoke = vi.fn()
const send = vi.fn()
const on = vi.fn()
const removeListener = vi.fn()
let exposedApi: Record<string, (...args: unknown[]) => unknown>

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, api: Record<string, (...args: unknown[]) => unknown>) => {
      exposedApi = api
    },
  },
  ipcRenderer: { invoke, send, on, removeListener },
}))

beforeAll(async () => {
  await import('../../../src/preload/index')
})

describe('Office preload channels', () => {
  it('allows Office commands only through invoke', async () => {
    invoke.mockResolvedValue({ ok: true, value: null })
    await exposedApi.invoke(OFFICE_INVOKE_CHANNELS.detect, { workspaceId: 'trusted' })
    exposedApi.send(OFFICE_INVOKE_CHANNELS.detect, { workspaceId: 'trusted' })

    expect(invoke).toHaveBeenCalledWith(OFFICE_INVOKE_CHANNELS.detect, { workspaceId: 'trusted' })
    expect(send).not.toHaveBeenCalled()
  })

  it('rejects unknown invoke channels', async () => {
    await expect(exposedApi.invoke('office:unknown')).rejects.toThrow('is not allowed')
  })

  it('subscribes to Office events and returns an unsubscribe function', () => {
    const callback = vi.fn()
    const unsubscribe = exposedApi.on(OFFICE_EVENT_CHANNELS.filesChanged, callback) as () => void
    const handler = on.mock.calls.at(-1)?.[1]

    handler({}, { workspaceId: 'trusted', entries: [], reason: 'watch' })
    expect(callback).toHaveBeenCalledWith({ workspaceId: 'trusted', entries: [], reason: 'watch' })

    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith(OFFICE_EVENT_CHANNELS.filesChanged, handler)
  })
})
