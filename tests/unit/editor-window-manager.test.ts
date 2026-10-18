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
  once: (event: string, callback: () => void) => void
}

const mocks = vi.hoisted(() => {
  const windows: MockEditorWindow[] = []
  const loadRendererWindow = vi.fn(async () => {})
  const getTheme = vi.fn(async () => 'planche')
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
      once: (event, callback) => { callbacks.set(event, callback) },
    }
    windows.push(window)
    return window
  })
  return { BrowserWindow, loadRendererWindow, windows, getTheme }
})

vi.mock('electron', () => ({
  BrowserWindow: mocks.BrowserWindow,
  shell: { openExternal: vi.fn() },
}))
vi.mock('../../src/main/windows/renderer-loader', () => ({
  loadRendererWindow: mocks.loadRendererWindow,
}))
vi.mock('../../src/main/config/service', () => ({ configService: { getTheme: mocks.getTheme } }))

import { EditorWindowManager } from '../../src/main/windows/editor-window'

describe('EditorWindowManager', () => {
  beforeEach(() => {
    mocks.windows.length = 0
    mocks.BrowserWindow.mockClear()
    mocks.loadRendererWindow.mockClear()
    mocks.getTheme.mockResolvedValue('planche')
  })

  it('reuses one workspace window and queues files until the renderer is ready', async () => {
    const manager = new EditorWindowManager()
    const first = { filePath: 'C:\\Workspace\\first.ts', workspacePath: 'C:\\Workspace' }
    const second = { filePath: 'C:\\Workspace\\second.ts', workspacePath: 'c:/workspace/' }

    expect(await manager.open(first)).toEqual({ success: true })
    expect(await manager.open(second)).toEqual({ success: true })
    expect(await manager.open(second)).toEqual({ success: true })

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
    await manager.open(third)
    expect(mocks.BrowserWindow).toHaveBeenCalledTimes(1)
    expect(mocks.windows[0].webContents.send).toHaveBeenLastCalledWith(
      SYSTEM_CHANNELS.refreshEditor,
      third,
    )
  })

  it('keeps different workspaces isolated and releases a closed window', async () => {
    const manager = new EditorWindowManager()
    await manager.open({ filePath: 'C:\\One\\file.ts', workspacePath: 'C:\\One' })
    await manager.open({ filePath: 'C:\\Two\\file.ts', workspacePath: 'C:\\Two' })
    expect(manager.list()).toHaveLength(2)

    mocks.windows[0].callbacks.get('closed')?.()
    expect(manager.list()).toHaveLength(1)

    await manager.open({ filePath: 'C:\\One\\again.ts', workspacePath: 'C:\\One' })
    expect(mocks.BrowserWindow).toHaveBeenCalledTimes(3)
  })

  it.each([['dark', '#151517'], ['planche', '#EFE4C5']])('seeds %s before loading and keeps concurrent opens hidden until first paint', async (theme, background) => {
    mocks.getTheme.mockResolvedValue(theme)
    const manager = new EditorWindowManager()
    await Promise.all(['one.ts', 'two.ts'].map(file => manager.open({ filePath: `C:/Workspace/${file}`, workspacePath: 'C:/Workspace' })))
    expect(mocks.BrowserWindow).toHaveBeenCalledTimes(1)
    expect(mocks.BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({ show: false, backgroundColor: background }))
    expect(mocks.windows[0].show).not.toHaveBeenCalled()
    const args = mocks.loadRendererWindow.mock.calls[0] as unknown as [unknown, (url: URL) => void, Record<string, string>]
    const url = new URL('http://localhost/')
    args[1](url)
    expect(url.searchParams.get('editorTheme')).toBe(theme)
    expect(url.searchParams.get('editorBackground')).toBe(background)
    expect(args[2]).toMatchObject({ editorTheme: theme, editorBackground: background })
    mocks.windows[0].callbacks.get('ready-to-show')?.()
    expect(mocks.windows[0].show).toHaveBeenCalledTimes(1)
  })
})
