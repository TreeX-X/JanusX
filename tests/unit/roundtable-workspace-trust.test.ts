import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RoundtableRuntime } from '../../src/main/roundtable/runtime'
import type { FixtureAgent, RoundtableEventEnvelope } from '../../src/shared/roundtable/events'
import type { WorkflowTemplate } from '../../src/shared/roundtable/workflow-template'

const template: WorkflowTemplate = {
  id: 'trust-workflow', version: '1', termination: 'user-only',
  participants: [
    { role: 'host', min: 1, max: 1, instances: [{ id: 'host', role: 'host', capabilities: [] }] },
    { role: 'refiner', min: 1, max: 1, instances: [{ id: 'r1', role: 'refiner', capabilities: [] }] },
    { role: 'challenger', min: 1, max: 1, instances: [{ id: 'c1', role: 'challenger', capabilities: [] }] },
  ],
  stages: [{ id: 'refiners', role: 'refiner' }, { id: 'challengers', role: 'challenger' }, { id: 'host', role: 'host' }],
}

const quietAgents: Record<string, FixtureAgent> = Object.fromEntries(
  ['r1', 'c1', 'host'].map((id) => [id, { run: async () => `${id} done` }]),
)

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'janusx-roundtable-trust-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ))
})

describe('roundtable workspace trust boundary', () => {
  it('rejects invalid workspace ids', async () => {
    const runtime = new RoundtableRuntime(quietAgents, template)
    await expect(runtime.start({
      prompt: 'Topic',
      workspaceResources: [{ workspaceId: '../escape', workspaceName: 'Evil', workspacePath: 'C:/evil' }],
    })).rejects.toMatchObject({ code: 'WORKSPACE_TOOL_INVALID_WORKSPACE_ID' })
  })

  it('rejects unregistered workspace ids when a registry resolver is present', async () => {
    const runtime = new RoundtableRuntime(quietAgents, template, {
      resolveWorkspace: async () => { throw new Error('Unknown workspace: ghost') },
    })
    await expect(runtime.start({
      prompt: 'Topic',
      workspaceResources: [{ workspaceId: 'ghost', workspaceName: 'Ghost', workspacePath: 'C:/ghost' }],
    })).rejects.toMatchObject({ code: 'WORKSPACE_TOOL_NOT_ATTACHED' })
  })

  it('ignores client-supplied paths and uses the registered root', async () => {
    const root = await temporaryDirectory()
    await writeFile(join(root, 'notes.txt'), 'registered content\n', 'utf-8')
    const runtime = new RoundtableRuntime(quietAgents, template, {
      resolveWorkspace: async (workspaceId: string) => {
        if (workspaceId !== 'w1') throw new Error(`Unknown workspace: ${workspaceId}`)
        return { path: root, name: 'Registered' }
      },
    })

    const state = await runtime.start({
      prompt: 'Forged path topic',
      workspaceResources: [{ workspaceId: 'w1', workspaceName: 'Forged', workspacePath: 'C:/forged-path' }],
    })

    expect(state.workspaceResources[0]?.workspacePath).toBe(await realpath(root))
    expect(state.workspaceResources[0]?.workspaceName).toBe('Registered')
    expect(state.workspaceContext).toContain('registered content')
  })

  it('rejects missing directories without a resolver', async () => {
    const runtime = new RoundtableRuntime(quietAgents, template)
    await expect(runtime.start({
      prompt: 'Topic',
      workspaceResources: [{ workspaceId: 'w1', workspaceName: 'Missing', workspacePath: join(tmpdir(), 'janusx-definitely-missing-xyz') }],
    })).rejects.toMatchObject({ code: 'WORKSPACE_TOOL_NOT_ATTACHED' })
  })
})

describe('roundtable host confirmation gate', () => {
  it('confirms host facts only with tool-derived file evidence', async () => {
    const root = await temporaryDirectory()
    await writeFile(join(root, 'notes.txt'), 'first line\nsecond line\n', 'utf-8')
    const agents: Record<string, FixtureAgent> = {
      r1: { run: async () => 'r1 done' },
      c1: { run: async () => 'c1 done' },
      host: {
        run: async ({ workspaceTools }) => {
          await workspaceTools?.execute('workspace.read', { workspaceId: 'w1', path: 'notes.txt' })
          return 'host synthesis grounded in notes.txt'
        },
      },
    }
    const runtime = new RoundtableRuntime(agents, template)
    const events: RoundtableEventEnvelope[] = []
    runtime.onEvent((event) => events.push(event))

    const state = await runtime.start({
      prompt: 'Grounded topic',
      workspaceResources: [{ workspaceId: 'w1', workspaceName: 'Project', workspacePath: root }],
    })

    const hostFact = state.facts.find((fact) => fact.kind === 'decision')
    expect(hostFact?.status).toBe('confirmed')
    const hostCard = state.cards.find((card) => card.agentId === 'host')
    const toolRef = hostCard?.evidenceRefs?.find((ref) => ref.kind === 'workspace-file' && ref.origin === 'tool')
    expect(toolRef).toMatchObject({ relativePath: 'notes.txt', lineStart: 1, lineEnd: 2 })
    expect(events.some((event) => event.type === 'workspace:tool-completed')).toBe(true)
  })

  it('does not leak symlinked content through tool reads', async () => {
    const state = await temporaryDirectory()
    const root = join(state, 'workspace')
    const outside = join(state, 'outside')
    await mkdir(root)
    await mkdir(outside)
    await writeFile(join(outside, 'secret.txt'), 'outside secret', 'utf-8')
    try {
      await symlink(join(outside, 'secret.txt'), join(root, 'linked.txt'), 'file')
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && ['EACCES', 'EPERM'].includes(String(error.code))) return
      throw error
    }
    const agents: Record<string, FixtureAgent> = {
      r1: { run: async () => 'r1 done' },
      c1: { run: async () => 'c1 done' },
      host: {
        run: async ({ workspaceTools }) => {
          try {
            await workspaceTools?.execute('workspace.read', { workspaceId: 'w1', path: 'linked.txt' })
            return 'host read link'
          } catch {
            return 'host blocked as expected'
          }
        },
      },
    }
    const runtime = new RoundtableRuntime(agents, template)
    const testState = await runtime.start({
      prompt: 'Symlink topic',
      workspaceResources: [{ workspaceId: 'w1', workspaceName: 'Project', workspacePath: root }],
    })
    const hostCard = testState.cards.find((card) => card.agentId === 'host')
    expect(hostCard?.summary).not.toContain('outside secret')
  })
})

describe('roundtable workspace tool cancellation', () => {
  it('emits tool-cancelled and surfaces WORKSPACE_TOOL_CANCELLED', async () => {
    const root = await temporaryDirectory()
    await writeFile(join(root, 'notes.txt'), 'hello\n', 'utf-8')
    let observed: RoundtableEventEnvelope | undefined
    const agents: Record<string, FixtureAgent> = {
      r1: { run: async () => 'r1 done' },
      c1: { run: async () => 'c1 done' },
      host: {
        run: async ({ workspaceTools }) => {
          try {
            await workspaceTools?.execute('workspace.read', { workspaceId: 'w1', path: 'notes.txt' })
            return 'unexpected success'
          } catch (error) {
            return `cancelled:${error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown'}`
          }
        },
      },
    }
    const runtime = new RoundtableRuntime(agents, template)
    runtime.onEvent((event) => { if (event.type === 'workspace:tool-cancelled') observed = event })
    // Start first so resources attach, then cancel before the host tool runs.
    const started = runtime.start({
      prompt: 'Cancel topic',
      workspaceResources: [{ workspaceId: 'w1', workspaceName: 'Project', workspacePath: root }],
    })
    runtime.cancel()
    const state = await started
    // The pre-cancelled controller forces every tool call down the cancelled path.
    expect(observed?.type).toBe('workspace:tool-cancelled')
    expect(state.cards.some((card) => card.summary.includes('WORKSPACE_TOOL_CANCELLED'))).toBe(true)
  })
})
