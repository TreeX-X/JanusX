import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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

  it('detaching a terminal keeps the session for resume', async () => {
    const registry = track(new AgentSessionRegistry(await userDataDir()))
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
})
