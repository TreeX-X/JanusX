import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const context = vi.hoisted(() => ({
  userData: `${process.env.TEMP ?? process.cwd()}\\janusx-harness-branch-${process.pid}`,
}))

vi.mock('electron', () => ({ app: { getPath: () => context.userData } }))

import { BlueprintStore, isProjectGraphId } from '../../src/main/janus/blueprint-store'

const REPO = '8fa19f17-c717-43a8-93a7-810a5e0cbc91'
const NOTE_ID = '33333333-3333-4333-8333-333333333333'

const NOTE = [
  '---',
  'schema: harness-note/1',
  `id: ${NOTE_ID}`,
  'kind: requirement',
  'lifecycle: proposed',
  'created: 2026-09-16',
  '---',
  '',
  '# T',
  '',
  '## Problem',
  '',
  'P.',
  '',
  '## Expected behavior',
  '',
  'E.',
  '',
  '## Scope',
  '',
  'S.',
  '',
  '## Acceptance criteria',
  '',
  '- [ ] AC-1: One.',
  '',
].join('\n')

const roots: string[] = []

async function makeRoot(withId = true): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), 'harness-branch-'))
  roots.push(root)
  await fs.mkdir(join(root, '.agents', 'notes'), { recursive: true })
  if (withId) {
    await fs.writeFile(join(root, '.agents', 'harness.json'), JSON.stringify({ schemaVersion: 1, repoId: REPO, name: 'B' }))
  }
  await fs.writeFile(join(root, '.agents', 'notes', '2026-09-16-t--33333333.md'), NOTE)
  return root
}

afterEach(async () => {
  await fs.rm(context.userData, { recursive: true, force: true })
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true })
})

describe('blueprint store project lane', () => {
  it('lists and loads the project graph beside legacy blueprints', async () => {
    const store = new BlueprintStore()
    const root = await makeRoot()
    const legacy = await store.createBlueprint('__global__', { name: 'Old' })
    const list = await store.listBlueprints(root)
    expect(list.some((b) => b.id === legacy.id && b.source !== 'harness')).toBe(true)
    const project = list.find((b) => isProjectGraphId(b.id))
    expect(project?.source).toBe('harness')
    const loaded = await store.loadBlueprint(root, project?.id as string)
    expect(loaded?.nodes[NOTE_ID]?.title).toBe('T')
    expect(loaded?.nodes[NOTE_ID]?.sourceHash).toHaveLength(64)
  })

  it('routes canvas create/update/archive through note files', async () => {
    const store = new BlueprintStore()
    const root = await makeRoot()
    const project = (await store.listBlueprints(root)).find((b) => isProjectGraphId(b.id))
    const projectId = project?.id as string
    const created = await store.createNode(root, projectId, { title: 'New', type: 'task' }, null)
    expect(created?.sourceUri).toContain('note://')
    const updated = await store.updateNode(root, projectId, NOTE_ID, { title: 'T2' })
    expect(updated?.title).toBe('T2')
    const bytes = await fs.readFile(join(root, '.agents', 'notes', '2026-09-16-t--33333333.md'), 'utf8')
    expect(bytes).toContain('# T2')
    expect(await store.deleteNode(root, projectId, NOTE_ID)).toBe(true)
    const archived = await fs.readFile(join(root, '.agents', 'notes', '2026-09-16-t--33333333.md'), 'utf8')
    expect(archived).toContain('lifecycle: archived')
  })

  it('refuses stale saves and managed arrays with coded errors', async () => {
    const store = new BlueprintStore()
    const root = await makeRoot()
    const projectId = (await store.listBlueprints(root)).find((b) => isProjectGraphId(b.id))?.id as string
    const before = await store.loadBlueprint(root, projectId)
    const staleHash = before?.nodes[NOTE_ID]?.sourceHash as string
    // External terminal write first.
    await fs.writeFile(join(root, '.agents', 'notes', '2026-09-16-t--33333333.md'), NOTE.replace('# T', '# Terminal'))
    await expect(store.updateNode(root, projectId, NOTE_ID, { title: 'UI', sourceHash: staleHash })).rejects.toMatchObject({
      code: 'HARNESS_CONFLICT',
    })
    await expect(
      store.updateNode(root, projectId, NOTE_ID, { features: [{ title: 'x' }] } as never),
    ).rejects.toMatchObject({ code: 'HARNESS_MANAGED' })
    await expect(store.updateBlueprint(root, projectId, { name: 'X' })).rejects.toMatchObject({
      code: 'HARNESS_READONLY',
    })
  })

  it('keeps legacy JSON writes untouched', async () => {
    const store = new BlueprintStore()
    const root = await makeRoot()
    const bp = await store.createBlueprint('__global__', { name: 'Legacy lane' })
    expect(bp.source ?? 'json').toBe('json')
    const node = await store.createNode('__global__', bp.id, { title: 'L', type: 'task' }, null)
    expect(node?.sourceUri).toBeUndefined()
  })

  it('refuses analyzer and candidate writes on project graphs (S4/S6 lane closeout)', async () => {
    const store = new BlueprintStore()
    const root = await makeRoot()
    const projectId = (await store.listBlueprints(root)).find((b) => isProjectGraphId(b.id))?.id as string
    const analysis = {
      id: 'a1',
      nodeId: NOTE_ID,
      trigger: 'manual',
      inputSummary: { blueprint: 'T', actual: 'one commit' },
      result: null,
      applied: false,
      createdAt: '2026-09-18T00:00:00.000Z',
    } as never
    await expect(store.appendAnalysis(root, projectId, NOTE_ID, analysis)).rejects.toMatchObject({
      code: 'HARNESS_MANAGED',
    })
    await expect(store.applyAnalysisPatch(root, projectId, NOTE_ID, { progress: 10 })).rejects.toMatchObject({
      code: 'HARNESS_MANAGED',
    })
    await expect(store.upsertRequirementCandidates(root, projectId, NOTE_ID, 'a1', [], [])).rejects.toMatchObject({
      code: 'HARNESS_MANAGED',
    })
    await expect(store.setCursor(root, projectId, NOTE_ID, 'abcdef')).rejects.toMatchObject({
      code: 'HARNESS_MANAGED',
    })
    // No legacy shadow file forks the projection.
    expect(await fs.readdir(join(root, '.agents', 'notes'))).toHaveLength(1)
  })

  it('keeps analyzer writes on the legacy lane', async () => {
    const store = new BlueprintStore()
    const bp = await store.createBlueprint('__global__', { name: 'Legacy analysis' })
    const created = await store.createNode('__global__', bp.id, { title: 'N', type: 'task' }, null)
    const nodeId = created?.id as string
    const analysis = {
      id: 'a1',
      nodeId,
      trigger: 'manual',
      inputSummary: { blueprint: 'N', actual: 'one commit' },
      result: null,
      applied: false,
      createdAt: '2026-09-18T00:00:00.000Z',
    } as never
    const appended = await store.appendAnalysis('__global__', bp.id, nodeId, analysis)
    expect(appended?.analyses).toHaveLength(1)
    const patched = await store.applyAnalysisPatch('__global__', bp.id, nodeId, { progress: 30 })
    expect(patched?.progress).toBe(30)
    await expect(store.setCursor('__global__', bp.id, nodeId, 'abcdef')).resolves.toBeUndefined()
  })
})
