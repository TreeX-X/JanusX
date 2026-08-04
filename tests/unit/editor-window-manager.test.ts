import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SYSTEM_CHANNELS } from '../../src/shared/ipc/system'

interface MockEditorWindow {
  destroyed: boolean
  callbacks: Map<string, () => void>
  focus: ReturnType<typeof vi.fn>
  restore: ReturnType<typeof vi.fn>
  show: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  isDestroyed: ReturnType<typeof vi.fn>
  isMinimized: ReturnType<typeof vi.fn>
  webContents: {
    send: ReturnType<typeof vi.fn>
    setWindowOpenHandler: ReturnType<typeof vi.fn>
  }
  on: (event: string, callback: () => void) => void
}

const mocks = vi.hoisted(() => {
  const windows: MockEditorWindow[] = []
  const loadRendererWindow = vi.fn(async () => {})
  const BrowserWindow = vi.fn(function BrowserWindowMock() {
    const callbacks = new Map<string, () => void>()
    const window: MockEditorWindow = {
      destroyed: false,
      callbacks,
      focus: vi.fn(),
      restore: vi.fn(),
      show: vi.fn(),
      destroy: vi.fn(function destroy(this: MockEditorWindow) { this.destroyed = true }),
      isDestroyed: vi.fn(() => window.destroyed),
      isMinimized: vi.fn(() => false),
      webContents: { send: vi.fn(), setWindowOpenHandler: vi.fn() },
      on: (event, callback) => { callbacks.set(event, callback) },
    }
    windows.push(window)
    return window
  })
  return { BrowserWindow, loadRendererWindow, windows }
})

vi.mock('electron', () => ({
  BrowserWindow: mocks.BrowserWindow,
  shell: { openExternal: vi.fn() },
}))
vi.mock('../../src/main/windows/renderer-loader', () => ({
  loadRendererWindow: mocks.loadRendererWindow,
}))

import { EditorWindowManager } from '../../src/main/windows/editor-window'

describe('EditorWindowManager', () => {
  beforeEach(() => {
    mocks.windows.length = 0
    mocks.BrowserWindow.mockClear()
    mocks.loadRendererWindow.mockClear()
  })

  it('reuses one workspace window and queues files until the renderer is ready', () => {
    const manager = new EditorWindowManager()
    const first = { filePath: 'C:\\Workspace\\first.ts', workspacePath: 'C:\\Workspace' }
    const second = { filePath: 'C:\\Workspace\\second.ts', workspacePath: 'c:/workspace/' }

    expect(manager.open(first)).toEqual({ success: true })
    expect(manager.open(second)).toEqual({ success: true })
    expect(manager.open(second)).toEqual({ success: true })

    expect(mocks.BrowserWindow).toHaveBeenCalledTimes(1)
    expect(manager.list()).toHaveLength(1)
    expect(mocks.windows[0].webContents.send).not.toHaveBeenCalled()

    manager.ready(mocks.windows[0].webContents as never)
    expect(mocks.windows[0].webContents.send).toHaveBeenCalledTimes(1)
    expect(mocks.windows[0].webContents.send).toHaveBeenCalledWith(
      SYSTEM_CHANNELS.refreshEditor,
      second,
    )

    const third = { filePath: 'C:\\Workspace\\third.ts', workspacePath: 'C:\\Workspace' }
    manager.open(third)
    expect(mocks.BrowserWindow).toHaveBeenCalledTimes(1)
    expect(mocks.windows[0].webContents.send).toHaveBeenLastCalledWith(
      SYSTEM_CHANNELS.refreshEditor,
      third,
    )
  })

  it('keeps different workspaces isolated and releases a closed window', () => {
    const manager = new EditorWindowManager()
    manager.open({ filePath: 'C:\\One\\file.ts', workspacePath: 'C:\\One' })
    manager.open({ filePath: 'C:\\Two\\file.ts', workspacePath: 'C:\\Two' })
    expect(manager.list()).toHaveLength(2)

    mocks.windows[0].callbacks.get('closed')?.()
    expect(manager.list()).toHaveLength(1)

    manager.open({ filePath: 'C:\\One\\again.ts', workspacePath: 'C:\\One' })
    expect(mocks.BrowserWindow).toHaveBeenCalledTimes(3)
  })
})
