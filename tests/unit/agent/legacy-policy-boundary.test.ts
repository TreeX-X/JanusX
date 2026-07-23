import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FILE_CHANNELS, FILE_TREE_CHANNELS, WORKSPACE_CHANNELS } from '../../../src/shared/ipc/workspace'
import { PROJECT_CHANNELS } from '../../../src/shared/ipc/project'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(), writeFile: vi.fn(), mkdir: vi.fn(), rename: vi.fn(), rm: vi.fn(), unlink: vi.fn(),
  readFile: vi.fn(async () => JSON.stringify({ path: 'C:\\workspace' })), stat: vi.fn(), readdir: vi.fn(async () => []),
}))

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\tmp' }, ipcMain: { handle: mocks.handle }, dialog: {}, shell: {},
  BrowserWindow: class { static fromWebContents() { return null } },
}))
vi.mock('fs/promises', () => ({
  writeFile: mocks.writeFile, mkdir: mocks.mkdir, rename: mocks.rename, rm: mocks.rm, unlink: mocks.unlink,
  readFile: mocks.readFile, readdir: mocks.readdir, stat: mocks.stat,
}))
vi.mock('fs', () => ({ watch: vi.fn() }))

const event = { sender: { id: 7 } } as never
const denied = vi.fn(async () => false)

function handler(channel: string): (...args: any[]) => Promise<any> {
  return mocks.handle.mock.calls.find(([registered]) => registered === channel)?.[1]
}

describe('legacy renderer policy boundary', () => {
  beforeEach(() => { mocks.handle.mockReset(); mocks.writeFile.mockReset(); denied.mockClear() })

  it('gates direct file save before filesystem mutation', async () => {
    const { registerFileHandlers } = await import('../../../src/main/ipc/file-handlers')
    registerFileHandlers(denied)
    await expect(handler(FILE_CHANNELS.save)(event, 'C:\\workspace\\file.txt', 'secret')).resolves.toMatchObject({ error: expect.any(String) })
    expect(denied).toHaveBeenCalledOnce(); expect(mocks.writeFile).not.toHaveBeenCalled()
  })

  it('gates project config write and run before domain mutation', async () => {
    const { registerProjectHandlers } = await import('../../../src/main/ipc/project-handlers')
    registerProjectHandlers(denied)
    await expect(handler(PROJECT_CHANNELS.writeConfig)(event, 'C:\\workspace', {})).resolves.toMatchObject({ success: false })
    await expect(handler(PROJECT_CHANNELS.run)(event, 'C:\\workspace', 'dev')).resolves.toMatchObject({ success: false })
    await expect(handler(PROJECT_CHANNELS.stop)(event, 'C:\\workspace')).resolves.toMatchObject({ success: false })
    expect(denied).toHaveBeenCalledTimes(3)
  })

  it('gates every workspace and file-tree mutation channel', async () => {
    const { registerWorkspaceHandlers } = await import('../../../src/main/ipc/handlers')
    registerWorkspaceHandlers({ on: vi.fn() } as never, { authorizeRendererAction: denied })
    await expect(handler(WORKSPACE_CHANNELS.create)(event, { name: 'demo', path: 'C:\\workspace' })).rejects.toThrow('denied')
    await expect(handler(WORKSPACE_CHANNELS.update)(event, 'id', { name: 'next' })).rejects.toThrow('denied')
    await expect(handler(WORKSPACE_CHANNELS.delete)(event, 'id')).resolves.toEqual({ success: false })
    for (const [channel, args] of [
      [FILE_TREE_CHANNELS.createFile, ['C:\\workspace', '', 'a.txt']],
      [FILE_TREE_CHANNELS.createDirectory, ['C:\\workspace', '', 'dir']],
      [FILE_TREE_CHANNELS.rename, ['C:\\workspace', 'a.txt', 'b.txt']],
      [FILE_TREE_CHANNELS.delete, ['C:\\workspace', 'a.txt']],
    ] as const) {
      await expect(handler(channel)(event, ...args)).resolves.toMatchObject({ success: false })
    }
    expect(denied).toHaveBeenCalledTimes(7)
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })
})
