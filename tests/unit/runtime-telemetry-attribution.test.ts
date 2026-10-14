import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

const testContext = vi.hoisted(() => ({ homeDir: '', userData: '' }))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => testContext.userData) },
}))

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>()
  return {
    ...actual,
    default: { ...actual.default, homedir: () => testContext.homeDir },
  }
})

const { TerminalContextCoordinator } = await import('../../src/main/runtime-telemetry/coordinator')

const CWD = 'C:/repo'
// Real clock: the coordinator stamps terminal start with Date.now(), and the
// correlation window compares against it, so fixture writes must be current.
const NOW = Date.now()
const SESSION_ID = '01a11111-1111-4111-8111-111111111111'

async function writeCodexSession(cwd: string, mtime: number) {
  const dir = join(testContext.homeDir, '.codex', 'sessions', '2026', '10', '14')
  await mkdir(dir, { recursive: true })
  const file = join(dir, `rollout-2026-10-14T06-00-00-${SESSION_ID}.jsonl`)
  await writeFile(file, [
    JSON.stringify({ timestamp: '2026-10-14T06:00:00Z', ordinal: 0, type: 'session_meta', payload: { id: SESSION_ID, cwd } }),
    JSON.stringify({ timestamp: '2026-10-14T06:04:00Z', ordinal: 1, type: 'turn_context', payload: { model: 'gpt-6-astra', cwd } }),
  ].join('\n'))
  await utimes(file, new Date(mtime), new Date(mtime))
  return file
}

describe('terminal attribution without hooks', () => {
  beforeEach(async () => {
    vi.stubEnv('CODEX_HOME', '')
    testContext.homeDir = await mkdtemp(join(tmpdir(), 'janusx-attribution-home-'))
    testContext.userData = await mkdtemp(join(tmpdir(), 'janusx-attribution-data-'))
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await rm(testContext.homeDir, { recursive: true, force: true })
    await rm(testContext.userData, { recursive: true, force: true })
  })

  it('binds an unbound terminal to the session its pty activity matches', async () => {
    await writeCodexSession(CWD, NOW)
    const coordinator = new TerminalContextCoordinator()
    coordinator.trackTerminal('terminal-1', 'codex', CWD)
    coordinator.noteTerminalActivity('terminal-1', NOW)

    await coordinator.runAttributionPass()

    const snapshot = await coordinator.getSnapshot({ terminalId: 'terminal-1', preset: 'codex', cwd: CWD })
    expect(snapshot).toMatchObject({ sessionId: SESSION_ID, sessionBinding: 'correlated', detectedModel: 'gpt-6-astra' })
  })

  it('never re-attributes a terminal that already has a hook binding', async () => {
    await writeCodexSession(CWD, NOW)
    const coordinator = new TerminalContextCoordinator()
    coordinator.trackTerminal('terminal-1', 'codex', CWD)
    // The hook asserted this session first; correlation must not disturb it.
    expect(coordinator.bindSession('terminal-1', 'codex', SESSION_ID, 'hook')).toBe(true)
    coordinator.noteTerminalActivity('terminal-1', NOW)

    await coordinator.runAttributionPass()

    const snapshot = await coordinator.getSnapshot({ terminalId: 'terminal-1', preset: 'codex', cwd: CWD })
    expect(snapshot?.sessionBinding).toBe('exact')
    expect(snapshot?.sessionId).toBe(SESSION_ID)
  })

  it('lets a hook assertion upgrade a correlated binding', async () => {
    await writeCodexSession(CWD, NOW)
    const coordinator = new TerminalContextCoordinator()
    coordinator.trackTerminal('terminal-1', 'codex', CWD)
    coordinator.noteTerminalActivity('terminal-1', NOW)
    await coordinator.runAttributionPass()
    expect((await coordinator.getSnapshot({ terminalId: 'terminal-1', preset: 'codex', cwd: CWD }))?.sessionBinding).toBe('correlated')

    // Same session asserted by the hook: the binding source upgrades.
    expect(coordinator.bindSession('terminal-1', 'codex', SESSION_ID, 'hook')).toBe(true)
    const snapshot = await coordinator.getSnapshot({ terminalId: 'terminal-1', preset: 'codex', cwd: CWD })
    expect(snapshot?.sessionBinding).toBe('exact')

    // A different hook session replaces the correlated one entirely. The new
    // session has no file on disk, so the snapshot is null; the persisted
    // binding is what records the replacement and its source.
    expect(coordinator.bindSession('terminal-1', 'codex', 'hook-session-2', 'hook')).toBe(true)
    const replaced = await coordinator.getSnapshot({ terminalId: 'terminal-1', preset: 'codex', cwd: CWD })
    expect(replaced).toBeNull()
    const persisted = JSON.parse(await readFile(join(testContext.userData, 'janusx', 'terminal-context-ledger.json'), 'utf8')) as {
      terminals: Record<string, { sessionId: string; source?: string }>
    }
    expect(persisted.terminals['terminal-1']).toMatchObject({ sessionId: 'hook-session-2', source: 'hook' })
  })

  it('keeps one session exclusive across terminals', async () => {
    await writeCodexSession(CWD, NOW)
    const coordinator = new TerminalContextCoordinator()
    coordinator.trackTerminal('terminal-1', 'codex', CWD)
    coordinator.trackTerminal('terminal-2', 'codex', CWD)
    coordinator.noteTerminalActivity('terminal-1', NOW)
    coordinator.noteTerminalActivity('terminal-2', NOW)

    await coordinator.runAttributionPass()

    // Both terminals correlate the same file; the first claim wins and the
    // second stays unbound rather than sharing one session.
    const first = await coordinator.getSnapshot({ terminalId: 'terminal-1', preset: 'codex', cwd: CWD })
    const second = await coordinator.getSnapshot({ terminalId: 'terminal-2', preset: 'codex', cwd: CWD })
    const bound = [first, second].filter(snapshot => snapshot?.sessionId === SESSION_ID)
    expect(bound).toHaveLength(1)
    expect([first, second].filter(snapshot => snapshot?.sessionId === undefined)).toHaveLength(1)
  })

  it('stays unbound without pty activity even when a session file exists', async () => {
    await writeCodexSession(CWD, NOW)
    const coordinator = new TerminalContextCoordinator()
    coordinator.trackTerminal('terminal-1', 'codex', CWD)

    await coordinator.runAttributionPass()

    const snapshot = await coordinator.getSnapshot({ terminalId: 'terminal-1', preset: 'codex', cwd: CWD })
    expect(snapshot?.sessionBinding).toBeUndefined()
    expect(snapshot?.sessionId).toBeUndefined()
  })
})
