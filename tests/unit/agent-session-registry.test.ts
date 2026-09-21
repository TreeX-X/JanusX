import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentSessionRegistry } from '../../src/main/sessions/session-registry'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/janusx-test-userdata' },
}))

const roots: string[] = []
const registries: AgentSessionRegistry[] = []
afterEach(async () => {
  for (const registry of registries.splice(0)) await registry.flush()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function userDataDir() {
  const path = await mkdtemp(join(tmpdir(), 'agent-sessions-'))
  roots.push(path)
  return path
}
function track(registry: AgentSessionRegistry): AgentSessionRegistry {
  registries.push(registry)
  return registry
}

function createInput(terminalId: string, workspaceId = 'ws-1') {
  return {
    terminalId,
    workspaceId,
    engine: 'claude',
    cwd: '/repo',
    shell: 'pwsh',
    preset: 'claude',
  }
}

describe('agent session registry', () => {
  it('creates sessions bound to terminals with stable ids', async () => {
    const registry = track(new AgentSessionRegistry(await userDataDir()))
    const record = registry.createSession(createInput('term-1'))
    expect(record.id).toBeTruthy()
    expect(registry.sessionIdForTerminal('term-1')).toBe(record.id)
    expect(registry.listSessions()).toHaveLength(1)
  })

  it('records prompts, checkpoints, and turn ends on one session', async () => {
    const registry = track(new AgentSessionRegistry(await userDataDir()))
    const record = registry.createSession(createInput('term-1'))
    registry.notePrompt('term-1', 'do the thing')
    registry.noteCheckpoint('term-1', 'cp-1')
    registry.recordTurnEnd('term-1', 'done', 'cp-1')
    const detail = registry.getSession(record.id)
    expect(detail?.firstPrompt).toBe('do the thing')
    expect(detail?.turnCount).toBe(1)
    expect(detail?.status).toBe('done')
    expect(detail?.turns).toHaveLength(1)
    expect(detail?.turns[0]).toMatchObject({ kind: 'done', checkpointId: 'cp-1' })
    const [summary] = registry.listSessions({ workspaceId: 'ws-1' })
    expect(summary).toMatchObject({ checkpointCount: 1, turnCount: 1 })
  })

  it('retains only live checkpoint ids so the card count matches storage', async () => {
    const registry = track(new AgentSessionRegistry(await userDataDir()))
    const record = registry.createSession(createInput('term-1'))
    registry.noteCheckpoint('term-1', 'cp-1')
    registry.noteCheckpoint('term-1', 'cp-2')
    registry.noteCheckpoint('term-1', 'cp-3')
    registry.retainCheckpoints(record.id, new Set(['cp-1', 'cp-3']))
    expect(registry.getSession(record.id)).toMatchObject({ checkpointCount: 2 })
    const [summary] = registry.listSessions({ workspaceId: 'ws-1' })
    expect(summary).toMatchObject({ checkpointCount: 2 })
    // Unknown sessions and fully-live ledgers persist nothing.
    registry.retainCheckpoints('missing', new Set())
    registry.retainCheckpoints(record.id, new Set(['cp-1', 'cp-3']))
    expect(registry.getSession(record.id)).toMatchObject({ checkpointCount: 2 })
  })

  it('filters by workspace and hides archived sessions by default', async () => {
    const registry = track(new AgentSessionRegistry(await userDataDir()))
    const first = registry.createSession(createInput('term-1'))
    registry.createSession(createInput('term-2', 'ws-2'))
    expect(registry.listSessions({ workspaceId: 'ws-1' })).toHaveLength(1)
    expect(registry.listSessions()).toHaveLength(2)
    registry.archiveSession(first.id)
    expect(registry.listSessions()).toHaveLength(1)
    expect(registry.listSessions({ includeArchived: true })).toHaveLength(2)
  })

  it('round-trips shell-restore layouts with caps and validation', async () => {
    const registry = track(new AgentSessionRegistry(await userDataDir()))
    expect(await registry.getLayout()).toBeNull()
    const terminals = Array.from({ length: 15 }, (_, i) => ({
      cwd: `/repo-${i}`,
      preset: 'claude',
      name: `t-${i}`,
    }))
    await registry.saveLayout({
      version: 1,
      savedAt: 'x',
      workspaces: [
        { workspaceId: 'ws-1', terminals },
        { workspaceId: 'ws-2', terminals: [{ cwd: '', preset: 'shell', name: 'bad' }] },
      ],
    })
    const layout = await registry.getLayout()
    expect(layout?.workspaces).toHaveLength(1)
    expect(layout?.workspaces[0].terminals).toHaveLength(10)
    expect(layout?.workspaces[0].terminals[0]).toMatchObject({ cwd: '/repo-0', preset: 'claude' })
    await registry.clearLayout()
    expect(await registry.getLayout()).toBeNull()
  })

  it('archives sessions by worktree path on disk removal', async () => {
    const registry = track(new AgentSessionRegistry(await userDataDir()))
    const kept = registry.createSession(createInput('term-1'))
    const removed = registry.createSession({ ...createInput('term-2'), cwd: '/repo-a' })
    expect(registry.archiveSessionsByCwd('/repo-a')).toEqual([removed.id])
    expect(registry.getSession(removed.id)?.archived).toBe(true)
    expect(registry.getSession(kept.id)?.archived).toBe(false)
    expect(registry.listSessions()).toHaveLength(1)
    expect(registry.listSessions({ includeArchived: true })).toHaveLength(2)
  })

  it('detaching a terminal keeps the session for resume', async () => {    const registry = track(new AgentSessionRegistry(await userDataDir()))
    const record = registry.createSession(createInput('term-1'))
    registry.detachTerminal('term-1')
    expect(registry.sessionIdForTerminal('term-1')).toBeNull()
    expect(registry.getSession(record.id)).not.toBeNull()
  })

  it('persists across reloads and recovers from corrupt stores', async () => {
    const dir = await userDataDir()
    const registry = track(new AgentSessionRegistry(dir))
    const record = registry.createSession(createInput('term-1'))
    registry.notePrompt('term-1', 'hello')
    await registry.flush()
    const reloaded = track(new AgentSessionRegistry(dir))
    await reloaded.load()
    expect(reloaded.getSession(record.id)?.firstPrompt).toBe('hello')

    await writeFile(join(dir, 'janusx', 'agent-sessions.json'), '{broken')
    const corrupt = track(new AgentSessionRegistry(dir))
    await corrupt.load()
    expect(corrupt.listSessions()).toEqual([])
  })

  it('caps stored sessions and turns', async () => {
    const registry = track(new AgentSessionRegistry(await userDataDir()))
    for (let i = 0; i < 205; i++) {
      registry.createSession(createInput(`term-${i}`, `ws-${i}`))
    }
    expect(registry.listSessions().length).toBeLessThanOrEqual(200)
  })

  function seedDoc(sessions: Array<Record<string, unknown>>) {
    return JSON.stringify({ version: 1, sessions })
  }

  function seedRecord(id: string, cwd: string): Record<string, unknown> {
    return {
      id,
      workspaceId: 'ws-1',
      engine: 'claude',
      cwd,
      firstPrompt: 'seeded',
      lastPrompt: 'seeded',
      turnCount: 1,
      checkpointCount: 0,
      checkpointIds: [],
      status: 'done',
      terminalIds: [],
      turns: [],
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:00:00.000Z',
      archived: false,
    }
  }

  it('never clobbers disk state it has not read yet', async () => {
    const dir = await userDataDir()
    const storePath = join(dir, 'janusx', 'agent-sessions.json')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(dir, 'janusx'), { recursive: true })
    await writeFile(storePath, seedDoc([seedRecord('seed-1', '/repo')]))
    // No explicit load: the first mutation gates on it internally.
    const registry = track(new AgentSessionRegistry(dir))
    registry.createSession(createInput('term-new'))
    await registry.flush()
    const reloaded = track(new AgentSessionRegistry(dir))
    await reloaded.load()
    expect(reloaded.getSession('seed-1')?.firstPrompt).toBe('seeded')
    expect(reloaded.listSessions()).toHaveLength(2)
  })

  it('refuses to overwrite a corrupt store and keeps a rollback copy', async () => {
    const dir = await userDataDir()
    const storePath = join(dir, 'janusx', 'agent-sessions.json')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(dir, 'janusx'), { recursive: true })
    await writeFile(storePath, seedDoc([seedRecord('seed-1', '/repo')]))
    const registry = track(new AgentSessionRegistry(dir))
    await registry.load()
    // Healthy write leaves a rollback copy of the previous bytes.
    registry.createSession(createInput('term-new'))
    await registry.flush()
    expect(await readFile(`${storePath}.prev`, 'utf8')).toBe(seedDoc([seedRecord('seed-1', '/repo')]))

    await writeFile(storePath, '{broken')
    const corrupt = track(new AgentSessionRegistry(dir))
    await corrupt.load()
    expect(corrupt.listSessions()).toEqual([])
    corrupt.createSession(createInput('term-x'))
    await corrupt.flush()
    expect(await readFile(storePath, 'utf8')).toBe('{broken')
  })
})
