import { beforeEach, expect, it, vi } from 'vitest'
import { SYSTEM_CHANNELS } from '../../src/shared/ipc/system'
import type { EditorWindowManager } from '../../src/main/windows/editor-window'
import type { BrowserWindow } from 'electron'

const mocks = vi.hoisted(() => ({ on: vi.fn(), handle: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: mocks, BrowserWindow: {} }))
import { registerWindowIpc } from '../../src/main/windows/register-window-ipc'

beforeEach(() => vi.clearAllMocks())

it('relays loaded-file observations only from registered editor windows and tolerates a closed main window', () => {
  const sender = { id: 'editor' }
  const main = { isDestroyed: vi.fn(() => false), webContents: { send: vi.fn() } }
  const manager = { list: () => [{ webContents: sender }] }
  registerWindowIpc(manager as unknown as EditorWindowManager, () => main as unknown as BrowserWindow)
  const relay = mocks.on.mock.calls.find(([channel]) => channel === SYSTEM_CHANNELS.editorViewed)![1]
  const payload = { filePath: 'C:/project/a.ts', workspacePath: 'C:/project' }
  relay({ sender: {} }, payload)
  relay({ sender }, null)
  relay({ sender }, { filePath: 123, workspacePath: 'C:/project' })
  expect(main.webContents.send).not.toHaveBeenCalled()
  relay({ sender }, payload)
  expect(main.webContents.send).toHaveBeenCalledExactlyOnceWith(SYSTEM_CHANNELS.editorViewed, payload)
  main.isDestroyed.mockReturnValue(true)
  relay({ sender }, payload)
  expect(main.webContents.send).toHaveBeenCalledTimes(1)
})
