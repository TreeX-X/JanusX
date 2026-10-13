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
const { getRuntimeTelemetrySnapshot } = await import('../../src/main/runtime-telemetry/history')
const defaultReader = vi.mocked(getRuntimeTelemetrySnapshot).getMockImplementation()!

describe('TerminalContextCoordinator', () => {
  beforeEach(async () => {
    testContext.userData = await mkdtemp(join(tmpdir(), 'janusx-context-ledger-'))
    testContext.snapshots = []
    vi.mocked(getRuntimeTelemetrySnapshot).mockImplementation(defaultReader)
  })

  afterEach(async () => {
    vi.useRealTimers()
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

  it('rejects an in-flight history result after session rebinding', async () => {
    const coordinator = new TerminalContextCoordinator()
    coordinator.bindSession('t', 'codex', 'old')
    let resolve!: (snapshot: { sessionId: string; detectedModel: string }) => void
    vi.mocked(getRuntimeTelemetrySnapshot).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const pending = coordinator.getSnapshot({ terminalId: 't', preset: 'codex', cwd: 'C:/repo' })
    await Promise.resolve()
    await Promise.resolve()
    coordinator.bindSession('t', 'codex', 'new')
    resolve({ sessionId: 'old', detectedModel: 'old-model' })
    expect(await pending).toBeNull()
    expect(await coordinator.getSnapshot({ terminalId: 't', preset: 'codex', cwd: 'C:/repo' })).toMatchObject({ sessionId: 'new' })
  })

  it('rejects an in-flight result after terminal unbinding', async () => {
    const coordinator = new TerminalContextCoordinator()
    coordinator.bindSession('t', 'codex', 's')
    let resolve!: (snapshot: { sessionId: string }) => void
    vi.mocked(getRuntimeTelemetrySnapshot).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const pending = coordinator.getSnapshot({ terminalId: 't', preset: 'codex', cwd: 'C:/repo' })
    await Promise.resolve()
    await Promise.resolve()
    coordinator.unbindTerminal('t')
    resolve({ sessionId: 's' })
    expect(await pending).toBeNull()
  })

  it('collects without a renderer, retains usage after exit and resumes the same baseline', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    let input = 100
    vi.mocked(getRuntimeTelemetrySnapshot).mockImplementation(async request => ({ sessionId: request.sessionId, source: 'history', usageObservation: { engine: 'codex', namespace: '/native', sessionId: request.sessionId!, mode: 'cumulative', collectedAt: Date.now(), counters: { inputTokens: input, outputTokens: 0, totalTokens: input } } }))
    const coordinator = new TerminalContextCoordinator()
    coordinator.bindSession('t', 'codex', 's')
    coordinator.trackTerminal('t', 'codex', 'C:/repo')
    await coordinator.getSnapshot({ terminalId: 't', preset: 'codex', cwd: 'C:/repo', startedAt: 9999999 })
    expect(testContext.snapshots.at(-1)?.startedAt).not.toBe(9999999)
    input = 110
    await vi.advanceTimersByTimeAsync(10_000)
    input = 120
    await coordinator.releaseTerminal('t')
    const restored = new TerminalContextCoordinator()
    restored.bindSession('other', 'codex', 's')
    input = 125
    vi.setSystemTime(12_000)
    await restored.getSnapshot({ terminalId: 'other', preset: 'codex', cwd: 'C:/repo' })
    expect(restored.listUsage({ start: 0, end: 20_000 }).records.map(record => record.totalTokens)).toEqual([10, 10, 5])
    vi.mocked(getRuntimeTelemetrySnapshot).mockReset()
  })
})
