import { beforeEach, describe, expect, it, vi } from 'vitest'

const desktopToastMock = vi.hoisted(() => ({
  show: vi.fn(() => true),
}))

vi.mock('electron', () => ({
  BrowserWindow: class BrowserWindow {},
}))

vi.mock('../../src/main/notifications/desktop-toast-window', () => ({
  desktopToastWindow: desktopToastMock,
}))

function createWindowMock(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  return {
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    webContents: {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
    },
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    ...overrides,
  }
}

const enabledSettings = {
  desktopEnabled: true,
  notifyOnSuccess: true,
  notifyOnFailure: true,
  minDurationSeconds: 0,
  includeErrorMessage: false,
  errorMessageMaxLength: 120,
}

describe('notifyAgentEvent', () => {
  beforeEach(() => {
    desktopToastMock.show.mockReturnValue(true)
    vi.clearAllMocks()
  })

  it('skips non-terminal agent events', async () => {
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')

    const delivered = notifyAgentEvent(createWindowMock() as never, { sessionId: 's1', engine: 'codex' }, {
      type: 'text-chunk',
      text: 'working',
    })

    expect(delivered).toBe(false)
    expect(desktopToastMock.show).not.toHaveBeenCalled()
  })

  it('shows a completion notification through desktop toast without renderer fallback', async () => {
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')
    const windowMock = createWindowMock()

    const delivered = notifyAgentEvent(windowMock as never, { sessionId: 's1', engine: 'codex' }, {
      type: 'done',
      exitCode: 0,
    })

    expect(delivered).toBe(true)
    expect(windowMock.webContents.send).not.toHaveBeenCalled()
    expect(desktopToastMock.show).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'completed',
        engine: 'codex',
        title: 'JanusX - Agent completed',
        body: 'codex session completed. Click to return to JanusX.',
      }),
      expect.objectContaining({
        onClick: expect.any(Function),
        onShown: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
  })

  it('returns true when the main renderer is unavailable but desktop toast accepts the payload', async () => {
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')
    const windowMock = createWindowMock({
      webContents: {
        isDestroyed: vi.fn(() => true),
        send: vi.fn(),
      } as never,
    })

    const delivered = notifyAgentEvent(
      windowMock as never,
      { sessionId: 's1', engine: 'codex' },
      { type: 'done', exitCode: 0 },
      enabledSettings,
    )

    expect(delivered).toBe(true)
    expect(windowMock.webContents.send).not.toHaveBeenCalled()
    expect(desktopToastMock.show).toHaveBeenCalledTimes(1)
  })

  it('uses the renderer fallback when desktop toast is rejected', async () => {
    desktopToastMock.show.mockReturnValue(false)
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')
    const windowMock = createWindowMock()

    const delivered = notifyAgentEvent(
      windowMock as never,
      { sessionId: 's1', engine: 'codex' },
      { type: 'done', exitCode: 0 },
      enabledSettings,
    )

    expect(delivered).toBe(true)
    expect(windowMock.webContents.send).toHaveBeenCalledWith(
      'agent-notification:show',
      expect.objectContaining({
        type: 'completed',
        engine: 'codex',
        title: 'JanusX - Agent completed',
      }),
    )
  })

  it('skips notifications when desktop notifications are disabled', async () => {
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')
    const windowMock = createWindowMock()

    const delivered = notifyAgentEvent(
      windowMock as never,
      { sessionId: 's1', engine: 'codex' },
      {
        type: 'done',
        exitCode: 0,
      },
      {
        ...enabledSettings,
        desktopEnabled: false,
      },
    )

    expect(delivered).toBe(false)
    expect(windowMock.webContents.send).not.toHaveBeenCalled()
    expect(desktopToastMock.show).not.toHaveBeenCalled()
  })

  it('skips short tasks when a runtime threshold is configured', async () => {
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')

    notifyAgentEvent(
      createWindowMock() as never,
      {
        sessionId: 's1',
        engine: 'codex',
        startedAt: new Date(Date.now() - 10_000).toISOString(),
      },
      {
        type: 'done',
        exitCode: 0,
      },
      {
        ...enabledSettings,
        minDurationSeconds: 30,
      },
    )

    expect(desktopToastMock.show).not.toHaveBeenCalled()
  })

  it('shows a failure notification for error events', async () => {
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')

    notifyAgentEvent(createWindowMock() as never, { sessionId: 's1', engine: 'claude' }, {
      type: 'error',
      message: 'failed',
    })

    expect(desktopToastMock.show).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'JanusX - Agent failed',
        body: 'claude session needs attention. Click to return to JanusX.',
      }),
      expect.any(Object),
    )
  })

  it('can include a truncated failure message when configured', async () => {
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')

    notifyAgentEvent(
      createWindowMock() as never,
      { sessionId: 's1', engine: 'claude' },
      {
        type: 'error',
        message: 'x'.repeat(80),
      },
      {
        ...enabledSettings,
        includeErrorMessage: true,
        errorMessageMaxLength: 40,
      },
    )

    expect(desktopToastMock.show).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'JanusX - Agent failed',
        body: `claude session failed: ${'x'.repeat(37)}...`,
      }),
      expect.any(Object),
    )
  })

  it('restores, focuses, and runs click callback when desktop toast is clicked', async () => {
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')
    const windowMock = createWindowMock({ isMinimized: vi.fn(() => true) })
    const onClick = vi.fn()

    notifyAgentEvent(
      windowMock as never,
      { sessionId: 's1', engine: 'opencode' },
      {
        type: 'done',
      },
      enabledSettings,
      { onClick },
    )

    const [, options] = desktopToastMock.show.mock.calls[0]
    options.onClick()

    expect(windowMock.restore).toHaveBeenCalledTimes(1)
    expect(windowMock.show).toHaveBeenCalledTimes(1)
    expect(windowMock.focus).toHaveBeenCalledTimes(1)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('reports desktop toast show and failure callbacks', async () => {
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')
    const onDesktopToastShown = vi.fn()
    const onDesktopToastFailure = vi.fn()

    notifyAgentEvent(
      createWindowMock() as never,
      { sessionId: 's1', engine: 'codex' },
      { type: 'done' },
      enabledSettings,
      { onDesktopToastShown, onDesktopToastFailure },
    )

    const [, options] = desktopToastMock.show.mock.calls[0]
    options.onShown()
    options.onError('load failed')

    expect(onDesktopToastShown).toHaveBeenCalledTimes(1)
    expect(onDesktopToastFailure).toHaveBeenCalledWith('load failed')
    expect(desktopToastMock.show).toHaveBeenCalledTimes(1)
  })

  it('uses the renderer fallback when desktop toast fails before it is shown', async () => {
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')
    const windowMock = createWindowMock()

    notifyAgentEvent(
      windowMock as never,
      { sessionId: 's1', engine: 'codex' },
      { type: 'done' },
      enabledSettings,
    )

    const [, options] = desktopToastMock.show.mock.calls[0]
    options.onError('load failed')

    expect(windowMock.webContents.send).toHaveBeenCalledWith(
      'agent-notification:show',
      expect.objectContaining({
        type: 'completed',
        engine: 'codex',
      }),
    )
  })
})

describe('notifyAgentAttention', () => {
  beforeEach(() => {
    desktopToastMock.show.mockReturnValue(true)
    vi.clearAllMocks()
  })

  it('shows an attention notification', async () => {
    const { notifyAgentAttention } = await import('../../src/main/notifications/agent-notifier')

    notifyAgentAttention(
      createWindowMock() as never,
      { sessionId: 's1', engine: 'codex' },
      'approval required',
      enabledSettings,
    )

    expect(desktopToastMock.show).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'attention',
        title: 'JanusX - codex needs attention',
        body: 'approval required',
      }),
      expect.any(Object),
    )
  })
})
