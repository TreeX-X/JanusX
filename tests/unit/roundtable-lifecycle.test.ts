import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RoundtableRuntime } from '../../src/main/roundtable/runtime'
import { RoundtableStore } from '../../src/main/roundtable/store'
import { exportRoundtableMarkdown } from '../../src/shared/roundtable/export'
import type { FixtureAgent, RoundtableEventEnvelope, RoundtableState } from '../../src/shared/roundtable/events'
import type { WorkflowTemplate } from '../../src/shared/roundtable/workflow-template'

const template: WorkflowTemplate = {
  id: 'lifecycle', version: '1', termination: 'user-only',
  participants: [
    { role: 'host', min: 1, max: 1, instances: [{ id: 'host', role: 'host', capabilities: [] }] },
    { role: 'refiner', min: 1, max: 1, instances: [{ id: 'r1', role: 'refiner', capabilities: [] }] },
    { role: 'challenger', min: 1, max: 1, instances: [{ id: 'c1', role: 'challenger', capabilities: [] }] },
  ],
  stages: [{ id: 'refiners', role: 'refiner' }, { id: 'challengers', role: 'challenger' }, { id: 'host', role: 'host' }],
}

const agents: Record<string, FixtureAgent> = {
  r1: { run: async () => 'Propose a cache layer with TTL to absorb burst load' },
  c1: { run: async () => 'The cache layer may add latency risk under burst load' },
  host: {
    run: async ({ workspaceTools }) => {
      await workspaceTools?.execute('workspace.read', { workspaceId: 'w1', path: 'notes.txt' })
      return 'Adopt the cache plan. Grounded in the workspace notes.'
    },
  },
}

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'janusx-roundtable-life-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ))
})

describe('roundtable acceptance chain', () => {
  it('binds workspace, reads dynamically, synthesizes, advances, restores, ends and exports', async () => {
    const root = await temporaryDirectory()
    await writeFile(join(root, 'notes.txt'), 'first line\nsecond line\nthird line\n', 'utf-8')
    await writeFile(join(root, 'spec.md'), '# Spec\nCache everything.\n', 'utf-8')

    const runtime = new RoundtableRuntime(agents, template)
    const events: RoundtableEventEnvelope[] = []
    runtime.onEvent((event) => events.push(event))

    // Bind + first round with dynamic reads.
    const first = await runtime.start({
      prompt: 'Cache strategy',
      workspaceResources: [{ workspaceId: 'w1', workspaceName: 'Project', workspacePath: root }],
    })
    expect(first.phase).toBe('awaiting-user')
    expect(first.userMessages.map((item) => item.text)).toEqual(['Cache strategy'])
    expect(first.workspaceEvidenceRefs?.some((ref) => ref.origin === 'snapshot' && ref.relativePath === 'notes.txt')).toBe(true)
    expect(events.some((event) => event.type === 'workspace:tool-completed')).toBe(true)
    const hostCard = first.cards.find((card) => card.agentId === 'host')
    expect(hostCard?.evidenceRefs?.some((ref) => ref.kind === 'workspace-file' && ref.origin === 'tool' && ref.lineStart === 1)).toBe(true)
    // Host synthesis draft with merged conflict.
    expect(first.hostDrafts).toHaveLength(1)
    expect(first.hostDrafts?.[0]).toMatchObject({ roundNumber: 1, final: false, conclusion: 'Adopt the cache plan' })
    expect(first.hostDrafts?.[0]?.conflicts).toHaveLength(1)

    // Second round with supplement, then restore through the store.
    const second = await runtime.advance('Prefer Redis', 'life-key')
    expect(second.roundNumber).toBe(2)
    expect(second.userMessages.map((item) => item.text)).toEqual(['Cache strategy', 'Prefer Redis'])
    expect(second.hostDrafts).toHaveLength(2)

    const dir = await temporaryDirectory()
    const store = new RoundtableStore({ journalPath: join(dir, 'events.jsonl') })
    for (const event of events) await store.append(event.sessionId, event, runtime.getState())
    const loaded = await store.load(first.sessionId!)
    expect(loaded?.state.userMessages).toHaveLength(2)
    expect(loaded?.state.hostDrafts).toHaveLength(2)

    const restored = new RoundtableRuntime(agents, template)
    restored.hydrate(loaded!.state)
    const ended = restored.end()
    expect(ended.phase).toBe('ended')
    expect(ended.hostDrafts?.[2]).toMatchObject({ final: true })

    const markdown = exportRoundtableMarkdown(ended)
    expect(markdown).toContain('## Conclusion')
    expect(markdown).toContain('Adopt the cache plan')
    expect(markdown).toContain('## Conflicts')
    expect(markdown).toContain('## Source Index')
  })

  it('caps large workspaces at the snapshot budget', async () => {
    const root = await temporaryDirectory()
    await mkdir(join(root, 'bulk'))
    await Promise.all(Array.from({ length: 60 }, (_, index) =>
      writeFile(join(root, 'bulk', `file-${index}.txt`), `content ${index}\n`, 'utf-8'),
    ))
    await writeFile(join(root, 'big.txt'), `${'x'.repeat(1024)}\n`.repeat(30), 'utf-8')

    const quiet: Record<string, FixtureAgent> = Object.fromEntries(
      ['r1', 'c1', 'host'].map((id) => [id, { run: async () => `${id} done` }]),
    )
    const runtime = new RoundtableRuntime(quiet, template)
    const state: RoundtableState = await runtime.start({
      prompt: 'Large repo',
      workspaceResources: [{ workspaceId: 'w1', workspaceName: 'Big', workspacePath: root }],
    })

    expect(state.workspaceContextFiles!.length).toBeLessThanOrEqual(40)
    expect(Buffer.byteLength(state.workspaceContext ?? '', 'utf8')).toBeLessThanOrEqual(96 * 1024)
  })

  it('exports legacy states without drafts or conflicts', async () => {
    const quiet: Record<string, FixtureAgent> = Object.fromEntries(
      ['r1', 'c1', 'host'].map((id) => [id, { run: async () => `${id} done` }]),
    )
    // No workspace: no tool evidence, host stays pending, no conflicts section.
    const runtime = new RoundtableRuntime(quiet, template)
    const state = await runtime.start('Minimal topic')
    const markdown = exportRoundtableMarkdown(state)
    expect(markdown).toContain('## Conclusion')
    expect(markdown).not.toContain('## Conflicts')
  })
})
