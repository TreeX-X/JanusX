import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => {
  const instances: Array<{
    options: { title: string; body: string }
    show: ReturnType<typeof vi.fn>
    handlers: Record<string, () => void>
  }> = []

  const isSupported = vi.fn(() => true)

  class Notification {
    options: { title: string; body: string }
    show = vi.fn()
    handlers: Record<string, () => void> = {}

    constructor(options: { title: string; body: string }) {
      this.options = options
      instances.push(this)
    }

    static isSupported = isSupported

    on(event: string, handler: () => void): this {
      this.handlers[event] = handler
      return this
    }
  }

  return { Notification, instances, isSupported }
})

vi.mock('electron', () => ({
  BrowserWindow: class BrowserWindow {},
  Notification: electronMock.Notification,
}))

function createWindowMock(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  return {
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    ...overrides,
  }
}

describe('notifyAgentEvent', () => {
  beforeEach(() => {
    electronMock.instances.length = 0
    electronMock.isSupported.mockReturnValue(true)
    vi.clearAllMocks()
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
      title: 'JanusX - Agent 任务已完成',
      body: 'codex 会话已结束，点击返回 JanusX 查看结果。',
    })
    expect(electronMock.instances[0].show).toHaveBeenCalledTimes(1)
  })

  it('shows a failure notification for error events', async () => {
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')

    notifyAgentEvent(createWindowMock() as never, { sessionId: 's1', engine: 'claude' }, {
      type: 'error',
      message: 'failed',
    })

    expect(electronMock.instances[0].options).toEqual({
      title: 'JanusX - Agent 执行失败',
      body: 'claude 会话遇到问题，点击返回 JanusX 查看详情。',
    })
  })

  it('restores and focuses the main window when notification is clicked', async () => {
    const { notifyAgentEvent } = await import('../../src/main/notifications/agent-notifier')
    const windowMock = createWindowMock({ isMinimized: vi.fn(() => true) })

    notifyAgentEvent(windowMock as never, { sessionId: 's1', engine: 'opencode' }, {
      type: 'done',
    })
    electronMock.instances[0].handlers.click()

    expect(windowMock.restore).toHaveBeenCalledTimes(1)
    expect(windowMock.show).toHaveBeenCalledTimes(1)
    expect(windowMock.focus).toHaveBeenCalledTimes(1)
  })
})
