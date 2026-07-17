import { beforeEach, describe, expect, it, vi } from 'vitest'

const { addTerminal, updateTerminal, setBlueprintMode, setLoadState } = vi.hoisted(() => ({
  addTerminal: vi.fn(),
  updateTerminal: vi.fn(),
  setBlueprintMode: vi.fn(),
  setLoadState: vi.fn(),
}))

vi.mock('@/stores/workspace', () => ({
  useWorkspaceStore: Object.assign(
    vi.fn(),
    {
      getState: () => ({
        addTerminal,
        updateTerminal,
        terminals: [],
      }),
    },
  ),
}))

vi.mock('@/stores/app', () => ({
  useAppStore: {
    getState: () => ({
      setBlueprintMode,
      setLoadState,
    }),
  },
}))

vi.mock('@/lib/runtime-telemetry', () => ({
  getEstimatedContextWindow: vi.fn(() => 200_000),
}))

const {
  waitForTerminalGeometry,
  requestTerminalForceFitBurst,
} = vi.hoisted(() => ({
  waitForTerminalGeometry: vi.fn(async () => ({ cols: 120, rows: 40 })),
  requestTerminalForceFitBurst: vi.fn(),
}))

vi.mock('@/lib/terminal-geometry', () => ({
  waitForTerminalGeometry,
  requestTerminalForceFitBurst,
}))

describe('terminal-launch', () => {
  beforeEach(() => {
    vi.resetModules()
    addTerminal.mockReset()
    updateTerminal.mockReset()
    setBlueprintMode.mockReset()
    setLoadState.mockReset()
    waitForTerminalGeometry.mockReset()
    waitForTerminalGeometry.mockResolvedValue({ cols: 120, rows: 40 })
    requestTerminalForceFitBurst.mockReset()

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        electron: {
          platform: 'win32',
          invoke: vi.fn(),
          terminal: {
            warmup: vi.fn(),
            create: vi.fn(),
          },
        },
      },
    })

    vi.stubGlobal(
      'requestAnimationFrame',
      (cb: FrameRequestCallback) => {
        cb(0)
        return 0
      },
    )
  })

  it('caches default shell after ensureDefaultShell', async () => {
    const invoke = window.electron.invoke as ReturnType<typeof vi.fn>
    invoke.mockResolvedValueOnce('pwsh.exe')

    const {
      __resetDefaultShellCacheForTests,
      ensureDefaultShell,
      getCachedDefaultShell,
    } = await import('../../src/renderer/src/lib/terminal-launch')

    __resetDefaultShellCacheForTests()
    expect(getCachedDefaultShell()).toBeNull()

    await expect(ensureDefaultShell()).resolves.toBe('pwsh.exe')
    expect(getCachedDefaultShell()).toBe('pwsh.exe')
    expect(invoke).toHaveBeenCalledWith('system:getDefaultShell')

    await expect(ensureDefaultShell()).resolves.toBe('pwsh.exe')
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('warms terminal create path via terminal:warmup', async () => {
    const warmup = window.electron.terminal.warmup as ReturnType<typeof vi.fn>
    warmup.mockResolvedValue({ ok: true })

    const { warmTerminalCreatePath } = await import('../../src/renderer/src/lib/terminal-launch')
    warmTerminalCreatePath(['claude'])
    await Promise.resolve()

    expect(warmup).toHaveBeenCalledWith({ engines: ['claude'] })
  })

  it('launches optimistically with starting status before create resolves', async () => {
    const invoke = window.electron.invoke as ReturnType<typeof vi.fn>
    const create = window.electron.terminal.create as ReturnType<typeof vi.fn>
    let resolveCreate: ((value: { pid: number }) => void) | null = null
    invoke.mockImplementation((channel: string) => {
      if (channel === 'system:getDefaultShell') return Promise.resolve('powershell.exe')
      return Promise.resolve(null)
    })
    create.mockImplementation(() => new Promise((resolve) => {
      resolveCreate = resolve
    }))

    const {
      __resetDefaultShellCacheForTests,
      launchTerminalPreset,
      terminalBootLabel,
    } = await import('../../src/renderer/src/lib/terminal-launch')

    __resetDefaultShellCacheForTests()

    const launchPromise = launchTerminalPreset({
      preset: 'claude',
      workspaceId: 'ws-1',
      workspacePath: 'C:/repo',
    })

    await vi.waitFor(() => {
      expect(addTerminal).toHaveBeenCalled()
    })

    const terminal = addTerminal.mock.calls[0][0]
    expect(terminal.status).toBe('starting')
    expect(terminal.preset).toBe('claude')
    expect(terminal.shell).toBe('powershell.exe')
    expect(setBlueprintMode).toHaveBeenCalledWith(false)
    expect(setLoadState).toHaveBeenCalledWith('terminal-active')
    expect(terminalBootLabel('claude')).toBe('Starting Claude Code…')

    await vi.waitFor(() => {
      expect(resolveCreate).toBeTruthy()
    })

    expect(waitForTerminalGeometry).toHaveBeenCalledWith(terminal.id)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: terminal.id,
        preset: 'claude',
        command: 'claude',
        args: [],
        cols: 120,
        rows: 40,
      }),
    )

    resolveCreate!({ pid: 4242 })

    await expect(launchPromise).resolves.toEqual({
      ok: true,
      terminalId: terminal.id,
      pid: 4242,
    })

    expect(updateTerminal).toHaveBeenCalledWith(
      terminal.id,
      expect.objectContaining({ pid: 4242, status: 'running' }),
    )
    expect(requestTerminalForceFitBurst).toHaveBeenCalledWith(terminal.id)
  })

  it('keeps terminal on create failure with recoverable error state', async () => {
    const invoke = window.electron.invoke as ReturnType<typeof vi.fn>
    const create = window.electron.terminal.create as ReturnType<typeof vi.fn>
    invoke.mockImplementation((channel: string) => {
      if (channel === 'system:getDefaultShell') return Promise.resolve('powershell.exe')
      return Promise.resolve(null)
    })
    create.mockRejectedValue(new Error('spawn failed'))

    const {
      __resetDefaultShellCacheForTests,
      launchTerminalPreset,
    } = await import('../../src/renderer/src/lib/terminal-launch')

    __resetDefaultShellCacheForTests()

    const result = await launchTerminalPreset({
      preset: 'shell',
      workspaceId: 'ws-1',
      workspacePath: 'C:/repo',
      name: 'shell',
    })

    expect(result?.ok).toBe(false)
    expect(addTerminal).toHaveBeenCalled()
    const terminalId = addTerminal.mock.calls[0][0].id
    expect(updateTerminal).toHaveBeenCalledWith(
      terminalId,
      expect.objectContaining({
        status: 'error',
        errorMessage: 'spawn failed',
      }),
    )
  })
})
