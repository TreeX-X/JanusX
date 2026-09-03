import { describe, expect, it } from 'vitest'
import { EMPTY_ROUNDTABLE_STATE, reduceRoundtableEvent } from '../../src/shared/roundtable/state'
import { synthesizeHostDraft } from '../../src/shared/roundtable/host-synthesis'
import { RoundtableRuntime } from '../../src/main/roundtable/runtime'
import type { FixtureAgent, RoundtableEventEnvelope, RoundtableFact } from '../../src/shared/roundtable/events'
import type { WorkflowTemplate } from '../../src/shared/roundtable/workflow-template'

function fact(partial: Partial<RoundtableFact> & { id: string }): RoundtableFact {
  return {
    kind: 'evidence', status: 'proposal', title: partial.id, content: partial.id,
    sourceEventIds: [], updatedAt: '2026-01-01T00:00:00.000Z', ...partial,
  }
}

describe('synthesizeHostDraft', () => {
  it('returns a graceful empty draft without facts', () => {
    const draft = synthesizeHostDraft(EMPTY_ROUNDTABLE_STATE)

    expect(draft.conclusion).toBe('主持人尚未形成最终结论。')
    expect(draft.decisions).toEqual([])
    expect(draft.conflicts).toEqual([])
    expect(draft.final).toBe(false)
    expect(draft.sourceEventIds).toEqual([])
  })

  it('prefers the latest host summary lead sentence as conclusion', () => {
    const state = {
      ...EMPTY_ROUNDTABLE_STATE,
      roundNumber: 2,
      cards: [
        { id: 'c1', sessionId: 's', roundId: 'r1', agentId: 'host', role: 'host', title: 't', status: 'completed', summary: 'Adopt the layered cache. Details follow in later sections.', createdAt: '2026-01-01', updatedAt: '2026-01-01', sourceEventIds: [] },
      ],
    } as typeof EMPTY_ROUNDTABLE_STATE

    expect(synthesizeHostDraft(state).conclusion).toBe('Adopt the layered cache')
  })

  it('merges challenger concerns with overlapping refiner proposals', () => {
    const state = {
      ...EMPTY_ROUNDTABLE_STATE,
      roundNumber: 1,
      facts: [
        fact({ id: 'risk-1', kind: 'risk', status: 'concern', title: 'Latency risk', content: 'The cache layer may add latency risk under burst load', sourceEventIds: ['e1'] }),
        fact({ id: 'prop-1', kind: 'evidence', status: 'proposal', title: 'Cache proposal', content: 'Add a cache layer with TTL to absorb burst load', sourceEventIds: ['e2'] }),
        fact({ id: 'prop-2', kind: 'evidence', status: 'proposal', title: 'Unrelated', content: 'Rewrite the billing pipeline in another language', sourceEventIds: ['e3'] }),
      ],
    }

    const draft = synthesizeHostDraft(state)

    expect(draft.conflicts).toHaveLength(1)
    expect(draft.conflicts[0]).toMatchObject({ status: 'open', factIds: ['risk-1', 'prop-1'] })
    expect(draft.conflicts[0]?.sourceEventIds.sort()).toEqual(['e1', 'e2'])
  })

  it('pairs CJK concerns with proposals via character bigrams', () => {
    const state = {
      ...EMPTY_ROUNDTABLE_STATE,
      roundNumber: 1,
      facts: [
        fact({ id: 'risk-cn', kind: 'risk', status: 'concern', title: '延迟风险', content: '缓存层在突发流量下存在延迟风险' }),
        fact({ id: 'prop-cn', kind: 'evidence', status: 'proposal', title: '缓存方案', content: '引入缓存层并设置过期时间以吸收突发流量' }),
      ],
    }

    const draft = synthesizeHostDraft(state)

    expect(draft.conflicts).toHaveLength(1)
    expect(draft.conflicts[0]?.factIds).toEqual(['risk-cn', 'prop-cn'])
  })

  it('caps conflicts and includes sourceless facts without failing', () => {
    const facts: RoundtableFact[] = []
    for (let i = 0; i < 8; i += 1) {
      facts.push(fact({ id: `risk-${i}`, kind: 'risk', status: 'concern', title: `Risk ${i}`, content: 'shared cache layer latency burst load concern' }))
      facts.push(fact({ id: `prop-${i}`, kind: 'evidence', status: 'proposal', title: `Proposal ${i}`, content: 'shared cache layer latency burst load proposal' }))
    }
    const draft = synthesizeHostDraft({ ...EMPTY_ROUNDTABLE_STATE, roundNumber: 3, facts })

    expect(draft.conflicts.length).toBeLessThanOrEqual(5)
    expect(draft.sourceEventIds).toEqual([])
  })

  it('dedups decisions and separates pending from confirmed', () => {
    const state = {
      ...EMPTY_ROUNDTABLE_STATE,
      roundNumber: 1,
      facts: [
        fact({ id: 'd1', kind: 'decision', status: 'confirmed', title: 'D', content: 'Use the reducer' }),
        fact({ id: 'd2', kind: 'decision', status: 'confirmed', title: 'D', content: '  use THE reducer ' }),
        fact({ id: 'p1', kind: 'decision', status: 'pending-validation', title: 'P', content: 'Maybe use signals' }),
      ],
    }

    const draft = synthesizeHostDraft(state)

    expect(draft.decisions).toEqual(['Use the reducer'])
    expect(draft.pending).toEqual(['Maybe use signals'])
  })

  it('ignores card titles so generic summaries do not pair', () => {
    const state = {
      ...EMPTY_ROUNDTABLE_STATE,
      roundNumber: 1,
      facts: [
        fact({ id: 'c1', kind: 'risk', status: 'concern', title: 'challenger result', content: 'c1 done' }),
        fact({ id: 'r1', kind: 'evidence', status: 'proposal', title: 'refiner result', content: 'r1 done' }),
      ],
    }

    expect(synthesizeHostDraft(state).conflicts).toEqual([])
  })

  it('falls back to the title when the body has no keywords', () => {
    const state = {
      ...EMPTY_ROUNDTABLE_STATE,
      roundNumber: 1,
      facts: [
        fact({ id: 'c2', kind: 'risk', status: 'concern', title: 'Cache latency risk under load', content: '...' }),
        fact({ id: 'r2', kind: 'evidence', status: 'proposal', title: 'Other', content: 'Cache latency mitigation for load spikes' }),
      ],
    }

    const draft = synthesizeHostDraft(state)
    expect(draft.conflicts).toHaveLength(1)
    expect(draft.conflicts[0]?.factIds).toEqual(['c2', 'r2'])
  })
})

const wiringTemplate: WorkflowTemplate = {
  id: 'synthesis-wiring', version: '1', termination: 'user-only',
  participants: [
    { role: 'host', min: 1, max: 1, instances: [{ id: 'host', role: 'host', capabilities: [] }] },
    { role: 'refiner', min: 1, max: 1, instances: [{ id: 'r1', role: 'refiner', capabilities: [] }] },
    { role: 'challenger', min: 1, max: 1, instances: [{ id: 'c1', role: 'challenger', capabilities: [] }] },
  ],
  stages: [{ id: 'refiners', role: 'refiner' }, { id: 'challengers', role: 'challenger' }, { id: 'host', role: 'host' }],
}

const wiringAgents: Record<string, FixtureAgent> = Object.fromEntries(
  ['r1', 'c1', 'host'].map((id) => [id, { run: async () => `${id} synthesis summary. Second sentence.` }]),
)

describe('host synthesis runtime wiring', () => {
  it('emits one draft per round and a final draft on end', async () => {
    const runtime = new RoundtableRuntime(wiringAgents, wiringTemplate)
    const types: string[] = []
    runtime.onEvent((event) => types.push(event.type))

    const first = await runtime.start('Synthesis topic')
    expect(first.hostDrafts).toHaveLength(1)
    expect(first.hostDrafts?.[0]).toMatchObject({ roundNumber: 1, final: false })
    expect(first.hostDrafts?.[0]?.conclusion).toBe('host synthesis summary')

    const second = await runtime.advance('More context')
    expect(second.hostDrafts).toHaveLength(2)
    expect(second.hostDrafts?.[1]).toMatchObject({ roundNumber: 2, final: false })

    const ended = runtime.end()
    expect(ended.phase).toBe('ended')
    expect(ended.hostDrafts).toHaveLength(3)
    expect(ended.hostDrafts?.[2]).toMatchObject({ roundNumber: 2, final: true })
    // Public fact pool keeps full history alongside drafts.
    expect(ended.facts.length).toBeGreaterThan(0)
    expect(types.filter((type) => type === 'host:synthesis')).toHaveLength(3)
  })

  it('replaces same round+final drafts instead of duplicating', () => {
    const synthesis = synthesizeHostDraft({ ...EMPTY_ROUNDTABLE_STATE, roundNumber: 1 })
    const first: RoundtableEventEnvelope = { type: 'host:synthesis', sessionId: 's', roundId: 'r', synthesis, eventId: 'h1', occurredAt: '2026-01-01T00:00:00.000Z' }
    const again: RoundtableEventEnvelope = { ...first, eventId: 'h2' }
    const state = reduceRoundtableEvent(reduceRoundtableEvent(EMPTY_ROUNDTABLE_STATE, first), again)

    expect(state.hostDrafts).toHaveLength(1)
  })

  it('preserves drafts across hydrate', async () => {
    const runtime = new RoundtableRuntime(wiringAgents, wiringTemplate)
    const state = await runtime.start('Hydrate synthesis')
    const restored = new RoundtableRuntime(wiringAgents, wiringTemplate)
    restored.hydrate(state)

    expect(restored.getState().hostDrafts).toEqual(state.hostDrafts)
  })
})
