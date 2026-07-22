import { promises as fs } from 'fs'
import { join } from 'path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Blueprint } from '../../src/shared/janus/types'

const context = vi.hoisted(() => ({
  userData: `${process.env.TEMP ?? process.cwd()}\\janusx-blueprint-store-${process.pid}`
}))

vi.mock('electron', () => ({ app: { getPath: () => context.userData } }))

import { BlueprintStore } from '../../src/main/janus/blueprint-store'
import { BLUEPRINT_SCHEMA_VERSION } from '../../src/main/janus/blueprint-migration'

const dataDir = join(context.userData, 'janusx')

beforeEach(async () => {
  await fs.rm(dataDir, { recursive: true, force: true })
})

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true })
})

describe('BlueprintStore graph invariants', () => {
  it('preserves parent-child consistency through create, move, delete, and root promotion', async () => {
    const store = new BlueprintStore()
    const blueprint = await store.createBlueprint('__global__', { name: 'Graph' })
    const rootId = blueprint.rootNodeId
    const child = await store.createNode('__global__', blueprint.id, { title: 'Child', type: 'task' }, rootId)
    expect(child).not.toBeNull()
    if (!child) return
    const leaf = await store.createNode('__global__', blueprint.id, { title: 'Leaf', type: 'task' }, child.id)
    expect(leaf).not.toBeNull()
    if (!leaf) return

    expect(await store.updateNode('__global__', blueprint.id, leaf.id, { parentId: rootId })).not.toBeNull()
    let loaded = await store.loadBlueprint('__global__', blueprint.id)
    expect(loaded?.nodes[child.id].children).toEqual([])
    expect(loaded?.nodes[rootId].children).toEqual([child.id, leaf.id])

    expect(await store.deleteNode('__global__', blueprint.id, rootId)).toBe(true)
    loaded = await store.loadBlueprint('__global__', blueprint.id)
    expect(loaded?.rootNodeId).toBe(child.id)
    expect(loaded?.nodes[child.id].parentId).toBeNull()
    expect(loaded?.nodes[leaf.id].parentId).toBeNull()
  })

  it('migrates and repairs a legacy persisted blueprint during read', async () => {
    const writer = new BlueprintStore()
    const created = await writer.createBlueprint('__global__', { name: 'Legacy' })
    const file = join(dataDir, 'blueprints', `${created.id}.json`)
    const persisted = JSON.parse(await fs.readFile(file, 'utf-8')) as Blueprint
    delete persisted.schemaVersion
    persisted.nodes[persisted.rootNodeId].description = 'Legacy requirement'
    persisted.nodes[persisted.rootNodeId].children = ['missing']
    await fs.writeFile(file, JSON.stringify(persisted), 'utf-8')

    const loaded = await new BlueprintStore().loadBlueprint('__global__', created.id)

    expect(loaded?.schemaVersion).toBe(BLUEPRINT_SCHEMA_VERSION)
    expect(loaded?.nodes[created.rootNodeId].features[0].title).toBe('Legacy requirement')
    expect(loaded?.nodes[created.rootNodeId].children).toEqual([])
    const saved = JSON.parse(await fs.readFile(file, 'utf-8')) as Blueprint
    expect(saved.schemaVersion).toBe(BLUEPRINT_SCHEMA_VERSION)
  })
})
