import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorRouting } from '../../src/main/windows/editor-routing'
import type { EditorWindowManager } from '../../src/main/windows/editor-window'
import type { EditorDelivery } from '../../src/shared/editor'
import { SYSTEM_CHANNELS } from '../../src/shared/ipc/system'

function host() {
  const webContents = Object.assign(new EventEmitter(), { isDestroyed: () => false, send: vi.fn() })
  return { webContents, isDestroyed: () => false, isMinimized: () => true, restore: vi.fn(), show: vi.fn(), focus: vi.fn(), destroy: vi.fn() }
}

describe('editor host routing', () => {
  let main: ReturnType<typeof host>
  let floating: ReturnType<typeof host> | undefined
  let routing: EditorRouting
  let manager: { get: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn>; confirmClose: ReturnType<typeof vi.fn> }
  const request = { filePath: 'C:/project/a.ts', workspacePath: 'C:/project' }
  beforeEach(() => {
    main = host()
    floating = undefined
    manager = {
      get: vi.fn(() => floating),
      open: vi.fn(async (payload: EditorDelivery) => {
        floating ??= host()
        if (payload.requestId) queueMicrotask(() => routing.received(floating!.webContents as never, payload.requestId!, true))
        return { success: true }
      }),
      confirmClose: vi.fn(() => { floating = undefined }),
    }
    routing = new EditorRouting(manager as unknown as EditorWindowManager, () => main as never)
    routing.embeddedReady(main.webContents as never)
    main.webContents.send.mockImplementation((_channel, payload: EditorDelivery) => {
      queueMicrotask(() => routing.received(main.webContents as never, payload.requestId!, true))
    })
  })

  it('defaults to embedded, follows an existing float, then returns to embedded after it closes', async () => {
    expect(await routing.open(request)).toMatchObject({ success: true })
    expect(manager.open).not.toHaveBeenCalled()
    expect(main.webContents.send).toHaveBeenCalledWith(SYSTEM_CHANNELS.editorEmbedded, expect.objectContaining(request))
    await routing.open({ ...request, floating: true })
    main.webContents.send.mockClear()
    await routing.open({ ...request, filePath: 'C:/project/b.ts' })
    expect(main.webContents.send).not.toHaveBeenCalled()
    expect(manager.open).toHaveBeenLastCalledWith(expect.objectContaining({ filePath: 'C:/project/b.ts', requestId: expect.any(String) }))
    floating = undefined
    await routing.open(request)
    expect(main.webContents.send).toHaveBeenCalledOnce()
  })

  it('keeps the source alive until the destination acknowledges, then delivers a queued file to embedded', async () => {
    await routing.open({ ...request, floating: true })
    const source = floating!
    main.webContents.send.mockImplementation(() => {})
    const embedding = routing.embed(source.webContents as never, request)
    const next = routing.open({ ...request, filePath: 'C:/project/next.ts' })
    await vi.waitFor(() => expect(main.webContents.send).toHaveBeenCalledOnce())
    expect(manager.confirmClose).not.toHaveBeenCalled()
    const delivery = main.webContents.send.mock.calls[0][1] as EditorDelivery
    routing.received({} as never, delivery.requestId!, true)
    expect(manager.confirmClose).not.toHaveBeenCalled()
    main.webContents.send.mockImplementation((_channel, payload: EditorDelivery) => queueMicrotask(() => routing.received(main.webContents as never, payload.requestId!, true)))
    routing.received(main.webContents as never, delivery.requestId!, true)
    expect(await embedding).toMatchObject({ success: true })
    expect(await next).toMatchObject({ success: true })
    expect(manager.confirmClose).toHaveBeenCalledWith(source.webContents)
    expect(main.webContents.send).toHaveBeenLastCalledWith(SYSTEM_CHANNELS.editorEmbedded, expect.objectContaining({ filePath: 'C:/project/next.ts' }))
  })

  it('preserves the floating source when the embedded receiver rejects the session', async () => {
    await routing.open({ ...request, floating: true })
    const source = floating!
    main.webContents.send.mockImplementation((_channel, payload: EditorDelivery) => queueMicrotask(() => routing.received(main.webContents as never, payload.requestId!, false)))
    expect(await routing.embed(source.webContents as never, request)).toMatchObject({ success: false })
    expect(manager.confirmClose).not.toHaveBeenCalled()
    expect(floating).toBe(source)
  })
})
