import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '.'),
  },
  BrowserWindow: class BrowserWindow {},
}))

vi.mock('../../src/main/notifications/desktop-toast-window', () => ({
  desktopToastWindow: {
    show: vi.fn(() => true),
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
  const resolvedPayloads: AgentHookPayload[] = []

  const coordinator = new AgentHookCoordinator(() => null, {
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
    onResolvedPayload: (payload) => resolvedPayloads.push(payload),
  })

  return { coordinator, completions, attentionPayloads, events, resolvedPayloads }
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
        kind: 'done',
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

  it('emits normalized payloads after terminal resolution', () => {
    const { coordinator, resolvedPayloads } = createCoordinator(() => 1_000)

    coordinator.registerTerminal(codexTerminal)
    coordinator.handleHookPayload({
      source: 'codex',
      event: 'Stop',
    })

    expect(resolvedPayloads).toEqual([
      expect.objectContaining({
        source: 'codex',
        event: 'Stop',
        terminalId: 'term-1',
        workspaceId: 'workspace-1',
        cwd: 'C:/repo',
      }),
    ])
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
    const isolated = new AgentHookCoordinator(() => null, {
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

describe('AgentHookCoordinator synthetic turn ends', () => {
  const claudeTerminal: RegisteredHookTerminal = {
    terminalId: 'term-claude',
    engine: 'claude',
    workspaceId: 'workspace-1',
    cwd: 'C:/repo',
  }

  function startClaudeTurn(coordinator: AgentHookCoordinator): void {
    coordinator.registerTerminal(claudeTerminal)
    coordinator.handleHookPayload({
      source: 'claude',
      event: 'UserPromptSubmit',
      terminalId: 'term-claude',
      sessionId: 'session-1',
      raw: { session_id: 'session-1', transcript_path: 'C:/transcripts/session-1.jsonl' },
    })
  }

  it('completes an active turn as failed on a sentinel api-error event', async () => {
    let now = 1_000
    const { coordinator, completions, events } = createCoordinator(() => now)

    startClaudeTurn(coordinator)
    now = 60_000
    coordinator.handleHookPayload({
      source: 'claude',
      event: 'janusx.turn.api-error',
      terminalId: 'term-claude',
      message: 'API Error: 429 rate_limit_error',
    })
    await Promise.resolve()

    expect(completions).toEqual([
      expect.objectContaining({
        turnId: 'term-claude:1000',
        hookEvent: 'janusx.turn.api-error',
        kind: 'failed',
        failed: true,
        message: 'API Error: 429 rate_limit_error',
      }),
    ])
    expect(lifecycleTypes(events)).toEqual(['started', 'failed'])
  })

  it('drops synthetic end signals when no turn is active (first signal wins)', async () => {
    const { coordinator, completions, events } = createCoordinator(() => 1_000)

    coordinator.registerTerminal(claudeTerminal)
    for (const event of ['janusx.turn.api-error', 'janusx.turn.interrupted', 'janusx.turn.orphaned']) {
      coordinator.handleHookPayload({ source: 'claude', event, terminalId: 'term-claude' })
    }
    await Promise.resolve()

    expect(completions).toHaveLength(0)
    expect(lifecycleTypes(events)).toEqual(['ignored', 'ignored', 'ignored'])
    expect(events.at(-1)).toMatchObject({ reason: 'no-active-turn', delivered: false })
  })

  it('completes an active turn silently as interrupted on a user interrupt', async () => {
    const { coordinator, completions, events } = createCoordinator(() => 1_000)

    startClaudeTurn(coordinator)
    coordinator.handleHookPayload({
      source: 'claude',
      event: 'janusx.turn.interrupted',
      terminalId: 'term-claude',
    })
    await Promise.resolve()

    expect(completions).toEqual([
      expect.objectContaining({ kind: 'interrupted', failed: false }),
    ])
    expect(lifecycleTypes(events)).toEqual(['started', 'interrupted'])
  })

  it('treats SessionEnd as an interrupt only while a turn is active', async () => {
    const { coordinator, completions, events } = createCoordinator(() => 1_000)

    coordinator.registerTerminal(claudeTerminal)
    coordinator.handleHookPayload({ source: 'claude', event: 'SessionEnd', terminalId: 'term-claude' })
    await Promise.resolve()
    expect(completions).toHaveLength(0)
    expect(events.at(-1)).toMatchObject({ type: 'ignored', reason: 'no-active-turn' })

    startClaudeTurn(coordinator)
    coordinator.handleHookPayload({ source: 'claude', event: 'SessionEnd', terminalId: 'term-claude' })
    await Promise.resolve()
    expect(completions).toEqual([
      expect.objectContaining({ hookEvent: 'SessionEnd', kind: 'interrupted' }),
    ])
    expect(lifecycleTypes(events)).toEqual(['ignored', 'started', 'interrupted'])
  })

  it('keeps fallback delivery for a real Stop hook arriving after a sentinel abort', async () => {
    const { coordinator, completions } = createCoordinator(() => 1_000)

    startClaudeTurn(coordinator)
    coordinator.handleHookPayload({
      source: 'claude',
      event: 'janusx.turn.api-error',
      terminalId: 'term-claude',
    })
    // A late Stop means the sentinel judged too early; the completion corrects it.
    coordinator.handleHookPayload({ source: 'claude', event: 'Stop', terminalId: 'term-claude' })
    await Promise.resolve()

    expect(completions.map((completion) => completion.kind)).toEqual(['failed', 'done'])
  })

  it('notifies turn lifecycle callbacks with transcript binding info', () => {
    const started: unknown[] = []
    const ended: string[] = []
    const coordinator = new AgentHookCoordinator(() => null, {
      now: () => 1_000,
      deliverCompletion: () => true,
      deliverAttention: () => true,
      onTurnStarted: (turn) => started.push(turn),
      onTurnEnded: (terminalId) => ended.push(terminalId),
    })

    coordinator.registerTerminal(claudeTerminal)
    coordinator.handleHookPayload({
      source: 'claude',
      event: 'UserPromptSubmit',
      terminalId: 'term-claude',
      sessionId: 'session-1',
      raw: { transcript_path: 'C:/transcripts/session-1.jsonl' },
    })
    expect(started).toEqual([
      {
        terminalId: 'term-claude',
        engine: 'claude',
        source: 'claude',
        sessionId: 'session-1',
        transcriptPath: 'C:/transcripts/session-1.jsonl',
      },
    ])

    coordinator.handleHookPayload({ source: 'claude', event: 'Stop', terminalId: 'term-claude' })
    expect(ended).toEqual(['term-claude'])

    // Unregister with an open turn must also release the sentinel binding.
    coordinator.handleHookPayload({
      source: 'claude',
      event: 'UserPromptSubmit',
      terminalId: 'term-claude',
    })
    coordinator.unregisterTerminal('term-claude')
    expect(ended).toEqual(['term-claude', 'term-claude'])
    expect(coordinator.hasActiveTurn('term-claude')).toBe(false)
  })
})
