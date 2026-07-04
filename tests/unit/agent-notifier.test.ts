import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => {
  const instances: Array<{
    options: { title: string; body: string }
    show: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    handlers: Record<string, (...args: unknown[]) => void>
  }> = []

  const isSupported = vi.fn(() => true)
  const state = { throwOnConstruct: false }

  class Notification {
    options: { title: string; body: string }
    show = vi.fn()
    close = vi.fn()
    handlers: Record<string, (...args: unknown[]) => void> = {}

    constructor(options: { title: string; body: string }) {
      if (state.throwOnConstruct) throw new Error('native constructor failed')
      this.options = options
      instances.push(this)
    }

    static isSupported = isSupported

    on(event: string, handler: (...args: unknown[]) => void): this {
      this.handlers[event] = handler
      return this
    }
  }

  return { Notification, instances, isSupported, state }
})

vi.mock('electron', () => ({
  BrowserWindow: class BrowserWindow {},
  Notification: electronMock.Notification,
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
    electronMock.instances.length = 0
    electronMock.isSupported.mockReturnValue(true)
    electronMock.state.throwOnConstruct = false
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('skips non-terminal agent events', async () => {
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')

    notifyAgentEvent(createWindowMock() as never, { sessionId: 's1', engine: 'codex' }, {
      type: 'text-chunk',
      text: 'working',
    })

    expect(electronMock.instances).toHaveLength(0)
  })

  it('shows a completion notification for successful done events', async () => {
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')

    notifyAgentEvent(createWindowMock() as never, { sessionId: 's1', engine: 'codex' }, {
      type: 'done',
      exitCode: 0,
    })

    expect(electronMock.instances).toHaveLength(1)
    expect(electronMock.instances[0].options).toEqual({
      title: 'JanusX - Agent completed',
      body: 'codex session completed. Click to return to JanusX.',
    })
    expect(electronMock.instances[0].show).toHaveBeenCalledTimes(1)
  })

  it('does not show the renderer fallback while native notification is pending', async () => {
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')
    const windowMock = createWindowMock()
    const onRendererFallback = vi.fn()

    notifyAgentEvent(
      windowMock as never,
      { sessionId: 's1', engine: 'codex' },
      {
        type: 'done',
        exitCode: 0,
      },
      enabledSettings,
      { onRendererFallback },
    )

    expect(onRendererFallback).not.toHaveBeenCalled()
    expect(windowMock.webContents.send).not.toHaveBeenCalled()
  })

  it('does not show the renderer fallback after native notification shows', async () => {
    vi.useFakeTimers()
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')
    const windowMock = createWindowMock()
    const onNativeShow = vi.fn()
    const onRendererFallback = vi.fn()

    notifyAgentEvent(
      windowMock as never,
      { sessionId: 's1', engine: 'codex' },
      {
        type: 'done',
        exitCode: 0,
      },
      enabledSettings,
      { onNativeShow, onRendererFallback, rendererFallbackDelayMs: 100 },
    )
    electronMock.instances[0].handlers.show()
    vi.advanceTimersByTime(100)

    expect(onNativeShow).toHaveBeenCalledTimes(1)
    expect(onRendererFallback).not.toHaveBeenCalled()
    expect(windowMock.webContents.send).not.toHaveBeenCalled()
  })

  it('shows the renderer fallback when native notification fails', async () => {
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')
    const windowMock = createWindowMock()
    const onNativeFailure = vi.fn()
    const onRendererFallback = vi.fn()

    notifyAgentEvent(
      windowMock as never,
      { sessionId: 's1', engine: 'codex' },
      {
        type: 'done',
        exitCode: 0,
      },
      enabledSettings,
      { onNativeFailure, onRendererFallback },
    )
    electronMock.instances[0].handlers.failed({}, 'launch failed')

    expect(onNativeFailure).toHaveBeenCalledWith('launch failed')
    expect(onRendererFallback).toHaveBeenCalledTimes(1)
    expect(onRendererFallback).toHaveBeenCalledWith('native-notification-failed: launch failed', true)
    expect(windowMock.webContents.send).toHaveBeenCalledTimes(1)
    expect(windowMock.webContents.send).toHaveBeenCalledWith(
      'agent-notification:show',
      expect.objectContaining({
        type: 'completed',
        engine: 'codex',
        title: 'JanusX - Agent completed',
      }),
    )
  })

  it('shows the renderer fallback when native notification throws', async () => {
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')
    const windowMock = createWindowMock()
    const onNativeFailure = vi.fn()
    const onRendererFallback = vi.fn()
    electronMock.state.throwOnConstruct = true

    notifyAgentEvent(
      windowMock as never,
      { sessionId: 's1', engine: 'codex' },
      {
        type: 'done',
        exitCode: 0,
      },
      enabledSettings,
      { onNativeFailure, onRendererFallback },
    )

    expect(onNativeFailure).toHaveBeenCalledWith('native constructor failed')
    expect(onRendererFallback).toHaveBeenCalledWith(
      'native-notification-threw: native constructor failed',
      true,
    )
    expect(windowMock.webContents.send).toHaveBeenCalledTimes(1)
  })

  it('shows the renderer fallback when native notification show times out', async () => {
    vi.useFakeTimers()
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')
    const windowMock = createWindowMock()
    const onRendererFallback = vi.fn()

    notifyAgentEvent(
      windowMock as never,
      { sessionId: 's1', engine: 'codex' },
      {
        type: 'done',
        exitCode: 0,
      },
      enabledSettings,
      { onRendererFallback, rendererFallbackDelayMs: 100 },
    )

    vi.advanceTimersByTime(99)
    expect(windowMock.webContents.send).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(electronMock.instances[0].close).toHaveBeenCalledTimes(1)
    expect(onRendererFallback).toHaveBeenCalledWith('native-notification-show-timeout', true)
    expect(windowMock.webContents.send).toHaveBeenCalledTimes(1)
  })

  it('skips notifications when desktop notifications are disabled', async () => {
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')

    notifyAgentEvent(
      createWindowMock() as never,
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

    expect(electronMock.instances).toHaveLength(0)
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

    expect(electronMock.instances).toHaveLength(0)
  })

  it('shows a failure notification for error events', async () => {
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')

    notifyAgentEvent(createWindowMock() as never, { sessionId: 's1', engine: 'claude' }, {
      type: 'error',
      message: 'failed',
    })

    expect(electronMock.instances[0].options).toEqual({
      title: 'JanusX - Agent failed',
      body: 'claude session needs attention. Click to return to JanusX.',
    })
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

    expect(electronMock.instances[0].options).toEqual({
      title: 'JanusX - Agent failed',
      body: `claude session failed: ${'x'.repeat(37)}...`,
    })
  })

  it('restores, focuses, and runs click callback when notification is clicked', async () => {
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
    electronMock.instances[0].handlers.click()

    expect(windowMock.restore).toHaveBeenCalledTimes(1)
    expect(windowMock.show).toHaveBeenCalledTimes(1)
    expect(windowMock.focus).toHaveBeenCalledTimes(1)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('notifyAgentAttention', () => {
  beforeEach(() => {
    electronMock.instances.length = 0
    electronMock.isSupported.mockReturnValue(true)
    electronMock.state.throwOnConstruct = false
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

    expect(electronMock.instances[0].options).toEqual({
      title: 'JanusX - codex needs attention',
      body: 'approval required',
    })
  })
})
