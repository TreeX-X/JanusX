import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RoundtableRuntime, withTimeout } from '../../src/main/roundtable/runtime'
import { AgentRegistry } from '../../src/main/roundtable/agent-registry'
import type { FixtureAgent } from '../../src/shared/roundtable/events'
import type { WorkflowTemplate } from '../../src/shared/roundtable/workflow-template'

const template: WorkflowTemplate = {
  id: 'test-workflow', version: '1', termination: 'user-only',
  participants: [
    { role: 'host', min: 1, max: 1, instances: [{ id: 'host', role: 'host', capabilities: [] }] },
    { role: 'refiner', min: 1, max: 2, instances: [{ id: 'r1', role: 'refiner', capabilities: [] }, { id: 'r2', role: 'refiner', capabilities: [] }] },
    { role: 'challenger', min: 1, max: 2, instances: [{ id: 'c1', role: 'challenger', capabilities: [] }, { id: 'c2', role: 'challenger', capabilities: [] }] },
  ],
  stages: [{ id: 'refiners', role: 'refiner' }, { id: 'challengers', role: 'challenger' }, { id: 'host', role: 'host' }],
}

const agents: Record<string, FixtureAgent> = Object.fromEntries(['r1', 'r2', 'c1', 'c2'].map((id) => [id, { run: async () => `${id} completed` }]))

describe('RoundtableRuntime', () => {
  it('accepts a registry without coupling the workflow to a fixed agent count', async () => {
    const registry = new AgentRegistry()
    for (const [id, role] of [['r1', 'refiner'], ['r2', 'refiner'], ['c1', 'challenger'], ['c2', 'challenger']] as const) {
      registry.register({ id, role, capabilities: [], run: async () => `${id} completed` })
    }
    const state = await new RoundtableRuntime(registry, template).start('Registry workflow')
    expect(state.cards.map((card) => card.agentId)).toEqual(['r1', 'r2', 'c1', 'c2', 'host'])
  })

  it('starts only from non-empty initial input and dynamically runs configured agents', async () => {
    const runtime = new RoundtableRuntime(agents, template)
    await expect(runtime.start('   ')).rejects.toThrow()
    const events: string[] = []
    runtime.onEvent((event) => events.push(event.type))
    const state = await runtime.start('Design a resilient workflow')
    expect(state.phase).toBe('awaiting-user')
    expect(state.cards).toHaveLength(5)
    expect(events[0]).toBe('session:created')
    expect(events.filter((type) => type === 'agent:working')).toHaveLength(5)
  })

  it('requires explicit advance and accepts empty input for the next round', async () => {
    const runtime = new RoundtableRuntime(agents, template)
    await runtime.start('Initial requirement')
    await expect(runtime.advance()).resolves.toMatchObject({ roundNumber: 2, phase: 'awaiting-user' })
    await expect(runtime.advance('Add a latency constraint')).resolves.toMatchObject({ roundNumber: 3, userInput: 'Add a latency constraint' })
  })

  it('captures an individual agent failure without losing other cards', async () => {
    const failing: Record<string, FixtureAgent> = { ...agents, r2: { run: async () => { throw new Error('timeout') } } }
    const runtime = new RoundtableRuntime(failing, template)
    const state = await runtime.start('Test failure recovery')
    expect(state.cards).toHaveLength(4)
    expect(state.errors).toEqual(['r2: timeout'])
  })

  it('derives structured facts and keeps host claims pending without tool evidence', async () => {
    const runtime = new RoundtableRuntime(agents, template)
    const state = await runtime.start('Export topic')
    expect(state.facts.length).toBe(5)
    // Stage B gate: fixture agents never call workspace tools, so the host
    // synthesis must not self-confirm.
    expect(state.facts.some((fact) => fact.kind === 'decision' && fact.status === 'pending-validation')).toBe(true)
    expect(state.facts.some((fact) => fact.kind === 'decision' && fact.status === 'confirmed')).toBe(false)
  })

  it('preserves workspace snapshot and context across hydrate', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'janusx-roundtable-hydrate-'))
    try {
      await writeFile(join(dir, 'notes.txt'), 'hydrate me', 'utf-8')
      const runtime = new RoundtableRuntime(agents, template)
      const state = await runtime.start({ prompt: 'Workspace topic', workspaceResources: [{ workspaceId: 'w1', workspaceName: 'Project', workspacePath: dir }] })
      const restored = new RoundtableRuntime(agents, template)
      restored.hydrate(state)
      expect(restored.getState().workspaceResources).toEqual(state.workspaceResources)
      expect(restored.getState().workspaceContextFiles).toEqual(state.workspaceContextFiles)
      expect(restored.getState().facts).toEqual(state.facts)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('logs user messages on start and non-empty advances, never on empty advances', async () => {
    const runtime = new RoundtableRuntime(agents, template)
    const types: string[] = []
    runtime.onEvent((event) => types.push(event.type))

    const first = await runtime.start('Initial requirement')
    expect(first.userMessages.map((item) => [item.text, item.roundNumber])).toEqual([['Initial requirement', 1]])

    const second = await runtime.advance()
    expect(second.userMessages).toHaveLength(1)

    const third = await runtime.advance('Add a latency constraint')
    expect(third.userMessages.map((item) => [item.text, item.roundNumber])).toEqual([
      ['Initial requirement', 1],
      ['Add a latency constraint', 3],
    ])
    expect(types.filter((type) => type === 'user:message')).toHaveLength(2)
  })

  it('preserves user messages across hydrate', async () => {
    const runtime = new RoundtableRuntime(agents, template)
    const state = await runtime.start('Hydrate messages')
    const restored = new RoundtableRuntime(agents, template)
    restored.hydrate(state)
    expect(restored.getState().userMessages).toEqual(state.userMessages)
    expect(restored.getState().userMessages[0]?.text).toBe('Hydrate messages')
  })

  it('answers same-key advance retries idempotently while running', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let calls = 0
    const blocking: Record<string, FixtureAgent> = {
      r1: { run: async () => { calls += 1; if (calls > 1) await gate; return 'r1 done' } },
      c1: { run: async () => 'c1 done' },
      host: { run: async () => 'host done' },
    }
    const runtime = new RoundtableRuntime(blocking, template)
    await runtime.start('Idempotent topic')
    const pending = runtime.advance('first', 'key-1')
    await new Promise((resolve) => setTimeout(resolve, 50))
    const retry = await runtime.advance('retry-text', 'key-1')
    expect(retry.phase).toBe('running')
    expect(retry.roundNumber).toBe(2)
    await expect(runtime.advance('other', 'key-2')).rejects.toThrow()
    release()
    const done = await pending
    expect(done.phase).toBe('awaiting-user')
    expect(done.userMessages.map((item) => item.text)).toEqual(['Idempotent topic', 'first'])
    expect(done.advanceKeys?.['key-1']).toBe(2)
  })

  it('withTimeout rejects hanging tasks and passes fast ones', async () => {
    await expect(withTimeout(new Promise(() => undefined), 20, 'WORKSPACE_TOOL_TIMEOUT', 'timed out')).rejects.toMatchObject({ code: 'WORKSPACE_TOOL_TIMEOUT' })
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'X', 'x')).resolves.toBe('ok')
  })
})
