import { describe, expect, it } from 'vitest'
import { RoundtableRuntime } from '../../src/main/roundtable/runtime'
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

  it('derives structured facts and exports a traceable markdown record', async () => {
    const runtime = new RoundtableRuntime(agents, template)
    const state = await runtime.start('Export topic')
    expect(state.facts.length).toBe(5)
    expect(state.facts.some((fact) => fact.kind === 'decision' && fact.status === 'confirmed')).toBe(true)
  })
})
