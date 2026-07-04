import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '.'),
  },
  BrowserWindow: class BrowserWindow {},
  Notification: class Notification {
    static isSupported = vi.fn(() => true)
  },
}))

import { AgentHookCoordinator } from '../../src/main/notifications/agent-hook-coordinator'
import type {
  AgentHookCompletion,
  AgentHookCoordinatorEvent,
  AgentHookPayload,
  RegisteredHookTerminal,
} from '../../src/main/notifications/agent-hook-types'

function createCoordinator(now: () => number) {
  const completions: AgentHookCompletion[] = []
  const attentionPayloads: AgentHookPayload[] = []
  const events: AgentHookCoordinatorEvent[] = []

  const coordinator = new AgentHookCoordinator({} as never, {
    now,
    deliverCompletion: (completion) => {
      completions.push(completion)
      return true
    },
    deliverAttention: (payload) => {
      attentionPayloads.push(payload)
      return true
    },
    onEvent: (event) => events.push(event),
  })

  return { coordinator, completions, attentionPayloads, events }
}

const codexTerminal: RegisteredHookTerminal = {
  terminalId: 'term-1',
  engine: 'codex',
  workspaceId: 'workspace-1',
  cwd: 'C:/repo',
}

function lifecycleTypes(events: AgentHookCoordinatorEvent[]): string[] {
  return events
    .map((event) => event.type)
    .filter((type) => type !== 'received')
}

describe('AgentHookCoordinator', () => {
  it('delivers a completion notification from UserPromptSubmit and Stop hooks', async () => {
    let now = 1_000
    const { coordinator, completions, events } = createCoordinator(() => now)

    coordinator.registerTerminal(codexTerminal)
    coordinator.handleHookPayload({
      source: 'codex',
      event: 'UserPromptSubmit',
      terminalId: 'term-1',
    })
    now = 35_000
    coordinator.handleHookPayload({
      source: 'codex',
      event: 'Stop',
      terminalId: 'term-1',
      message: 'done',
    })
    await Promise.resolve()

    expect(completions).toEqual([
      {
        turnId: 'term-1:1000',
        terminalId: 'term-1',
        engine: 'codex',
        source: 'codex',
        hookEvent: 'Stop',
        startedAt: new Date(1_000).toISOString(),
        endedAt: new Date(35_000).toISOString(),
        failed: false,
        message: 'done',
      },
    ])
    expect(lifecycleTypes(events)).toEqual(['started', 'completed'])
  })

  it('delivers completion even when Stop arrives without a known start hook', async () => {
    let now = 5_000
    const { coordinator, completions } = createCoordinator(() => now)

    coordinator.registerTerminal(codexTerminal)
    coordinator.handleHookPayload({
      source: 'codex',
      event: 'Stop',
      terminalId: 'term-1',
    })
    await Promise.resolve()

    expect(completions[0]).toMatchObject({
      turnId: 'term-1:5000',
      terminalId: 'term-1',
      startedAt: undefined,
      failed: false,
    })
  })

  it('delivers approval notifications immediately', async () => {
    const { coordinator, attentionPayloads, events } = createCoordinator(() => 1_000)

    coordinator.registerTerminal(codexTerminal)
    coordinator.handleHookPayload({
      source: 'codex',
      event: 'PermissionRequest',
      terminalId: 'term-1',
      message: 'approve command',
    })
    await Promise.resolve()

    expect(attentionPayloads).toHaveLength(1)
    expect(attentionPayloads[0]).toMatchObject({ event: 'PermissionRequest', message: 'approve command' })
    expect(events.at(-1)).toMatchObject({ type: 'approval', delivered: true })
  })

  it('maps opencode session status and idle events to start and completion', async () => {
    let now = 10_000
    const { coordinator, completions, events } = createCoordinator(() => now)

    coordinator.registerTerminal({
      terminalId: 'term-opencode',
      engine: 'opencode',
      workspaceId: 'workspace-1',
      cwd: 'C:/repo',
    })
    coordinator.handleHookPayload({
      source: 'opencode',
      event: 'session.status',
      terminalId: 'term-opencode',
      raw: { status: 'busy' },
    })
    now = 12_000
    coordinator.handleHookPayload({
      source: 'opencode',
      event: 'session.idle',
      terminalId: 'term-opencode',
    })
    await Promise.resolve()

    expect(completions[0]).toMatchObject({
      turnId: 'term-opencode:10000',
      engine: 'opencode',
      hookEvent: 'session.idle',
      failed: false,
    })
    expect(lifecycleTypes(events)).toEqual(['started', 'completed'])
  })

  it('reports ambiguous events that cannot be mapped to one terminal', () => {
    const completions: AgentHookCompletion[] = []
    const events: AgentHookCoordinatorEvent[] = []
    const deliverSpy = vi.fn((completion: AgentHookCompletion) => {
      completions.push(completion)
      return true
    })
    const isolated = new AgentHookCoordinator({} as never, {
      deliverCompletion: deliverSpy,
      onEvent: (event) => events.push(event),
    })

    isolated.registerTerminal({ ...codexTerminal, terminalId: 'a' })
    isolated.registerTerminal({ ...codexTerminal, terminalId: 'b' })
    isolated.handleHookPayload({ source: 'codex', event: 'Stop' })

    expect(deliverSpy).not.toHaveBeenCalled()
    expect(events.at(-1)).toMatchObject({
      type: 'unmatched',
      reason: 'ambiguous-terminal',
      delivered: false,
    })
  })
})
