import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

const testContext = vi.hoisted(() => ({ userData: '', snapshots: [] as Array<Record<string, unknown>> }))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => testContext.userData) },
}))

vi.mock('../../src/main/runtime-telemetry/history', () => ({
  getRuntimeTelemetrySnapshot: vi.fn(async (request: Record<string, unknown>) => {
    testContext.snapshots.push(request)
    return request.sessionId
      ? { sessionId: request.sessionId, contextTokens: 100, contextWindowTokens: 200, source: 'history', confidence: 'authoritative' }
      : { contextTokens: 0, contextWindowTokens: 200, source: 'configuration', confidence: 'declared' }
  }),
}))

const { TerminalContextCoordinator } = await import('../../src/main/runtime-telemetry/coordinator')

describe('TerminalContextCoordinator', () => {
  beforeEach(async () => {
    testContext.userData = await mkdtemp(join(tmpdir(), 'janusx-context-ledger-'))
    testContext.snapshots = []
  })

  afterEach(async () => {
    await rm(testContext.userData, { recursive: true, force: true })
  })

  it('keeps an external session exclusively bound to one JanusX terminal', async () => {
    const coordinator = new TerminalContextCoordinator()
    expect(coordinator.bindSession('terminal-a', 'codex', 'session-1')).toBe(true)
    expect(coordinator.bindSession('terminal-b', 'codex', 'session-1')).toBe(false)

    const first = await coordinator.getSnapshot({ terminalId: 'terminal-a', preset: 'codex', cwd: 'C:/repo' })
    const second = await coordinator.getSnapshot({ terminalId: 'terminal-b', preset: 'codex', cwd: 'C:/repo', sessionId: 'session-1' })

    expect(first).toMatchObject({ sessionId: 'session-1', sessionBinding: 'exact' })
    expect(second).toMatchObject({ source: 'configuration' })
    expect(testContext.snapshots).toEqual([
      expect.objectContaining({ sessionId: 'session-1' }),
      expect.objectContaining({ sessionId: undefined }),
    ])
  })

  it('persists an exact binding for renderer reloads', async () => {
    const first = new TerminalContextCoordinator()
    first.bindSession('terminal-a', 'codex', 'session-1')

    const restored = new TerminalContextCoordinator()
    const snapshot = await restored.getSnapshot({ terminalId: 'terminal-a', preset: 'codex', cwd: 'C:/repo' })

    expect(snapshot).toMatchObject({ sessionId: 'session-1', sessionBinding: 'exact' })
  })

  it('releases a session when its terminal exits', async () => {
    const coordinator = new TerminalContextCoordinator()
    coordinator.bindSession('terminal-a', 'opencode', 'session-1')
    coordinator.unbindTerminal('terminal-a')

    expect(coordinator.bindSession('terminal-b', 'opencode', 'session-1')).toBe(true)
    const restored = new TerminalContextCoordinator()
    const snapshot = await restored.getSnapshot({ terminalId: 'terminal-a', preset: 'opencode', cwd: 'C:/repo' })
    expect(snapshot).toMatchObject({ source: 'configuration' })
  })
})
