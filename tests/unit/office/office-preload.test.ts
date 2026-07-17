import { beforeAll, describe, expect, it, vi } from 'vitest'
import { OFFICE_EVENT_CHANNELS, OFFICE_INVOKE_CHANNELS, type OfficeAPI } from '../../../src/shared/office'

const invoke = vi.fn()
const send = vi.fn()
const on = vi.fn()
const removeListener = vi.fn()
let exposedApi: { office: OfficeAPI }

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, api: { office: OfficeAPI }) => {
      exposedApi = api
    },
  },
  ipcRenderer: { invoke, send, on, removeListener },
}))

beforeAll(async () => {
  await import('../../../src/preload/index')
})

describe('Office preload channels', () => {
  it('routes Office commands through the fixed API', async () => {
    invoke.mockResolvedValue({ ok: true, value: null })
    await exposedApi.office.detect({ workspaceId: 'trusted' })

    expect(invoke).toHaveBeenCalledWith(OFFICE_INVOKE_CHANNELS.detect, { workspaceId: 'trusted' })
    expect(send).not.toHaveBeenCalled()
  })

  it('does not expose a generic bridge', () => {
    expect(exposedApi).not.toHaveProperty('invoke')
  })

  it('subscribes to Office events and returns an unsubscribe function', () => {
    const callback = vi.fn()
    const unsubscribe = exposedApi.office.onFilesChanged(callback)
    const handler = on.mock.calls.at(-1)?.[1]

    handler({}, { workspaceId: 'trusted', entries: [], reason: 'watch' })
    expect(callback).toHaveBeenCalledWith({ workspaceId: 'trusted', entries: [], reason: 'watch' })

    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith(OFFICE_EVENT_CHANNELS.filesChanged, handler)
  })
})
