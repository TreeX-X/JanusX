import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { MemoStore } from '../../src/main/memo/store'
import { memoSchema } from '../../src/shared/memo'

const directories: string[] = []
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'janus-memo-test-'))
  directories.push(directory)
  const store = new MemoStore(directory)
  const memo = await store.create('Release plan')
  return { store, memo, directory }
}
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }) })

describe('persistent milestone memo', () => {
  it('survives a new store instance with ordered nodes and no workspace mappings', async () => {
    const { store, memo, directory } = await fixture()
    const created = await store.edit(memo.id, { expectedRevision: 0, operations: [{ op: 'addNode', title: 'First', label: 'v1.0' }, { op: 'addNode', title: 'Second', label: 'Yesterday' }] })
    await store.edit(memo.id, { expectedRevision: 1, operations: [{ op: 'addPoint', nodeId: created.nodes[0].id, text: 'Recorded idea' }] })
    const restored = (await new MemoStore(directory).list())[0]
    expect(restored.nodes.map(node => node.title)).toEqual(['First', 'Second'])
    expect(restored.nodes[0].points[0].text).toBe('Recorded idea')
    expect(restored).not.toHaveProperty('unassigned')
    expect(restored).not.toHaveProperty('workspaces')
    expect(restored.revision).toBe(2)
  })
  it('changing labels never changes order or identities', async () => {
    const { store, memo } = await fixture()
    const created = await store.edit(memo.id, { expectedRevision: 0, operations: [{ op: 'addNode', title: 'A' }, { op: 'addNode', title: 'B' }] })
    const changed = await store.edit(memo.id, { expectedRevision: 1, operations: [{ op: 'editNode', nodeId: created.nodes[0].id, label: '2050' }, { op: 'editNode', nodeId: created.nodes[1].id, label: '2000' }] })
    expect(changed.nodes.map(node => node.id)).toEqual(created.nodes.map(node => node.id))
    expect(changed.nodes.map(node => node.label)).toEqual(['2050', '2000'])
  })
  it('moves points without duplication and preserves Chat source across edits', async () => {
    const { store, memo } = await fixture()
    const source = { conversationId: 'chat-a', messageId: 'message-a' }
    const created = await store.edit(memo.id, { expectedRevision: 0, operations: [{ op: 'addNode', title: 'A' }, { op: 'addNode', title: 'B' }] })
    const populated = await store.edit(memo.id, { expectedRevision: 1, operations: [{ op: 'addPoint', nodeId: created.nodes[0].id, text: 'Idea' }] }, source)
    const pointId = populated.nodes[0].points[0].id
    const moved = await store.edit(memo.id, { expectedRevision: 2, operations: [{ op: 'movePoint', pointId, nodeId: created.nodes[1].id }, { op: 'editPoint', pointId, text: 'Edited idea' }] })
    expect(moved.nodes[0].points).toEqual([])
    expect(moved.nodes[1].points).toEqual([{ id: pointId, text: 'Edited idea', source }])
  })
  it('removing a node deletes its points atomically and preserves the other star', async () => {
    const { store, memo } = await fixture()
    const node = await store.edit(memo.id, { expectedRevision: 0, operations: [{ op: 'addNode', title: 'A' }, { op: 'addNode', title: 'B' }] })
    const points = await store.edit(memo.id, { expectedRevision: 1, operations: [{ op: 'addPoint', nodeId: node.nodes[0].id, text: 'Delete with node' }, { op: 'addPoint', nodeId: node.nodes[1].id, text: 'Keep this record' }] })
    const removed = await store.edit(memo.id, { expectedRevision: 2, operations: [{ op: 'removeNode', nodeId: node.nodes[0].id }] })
    expect(removed.nodes).toEqual([points.nodes[1]])
    expect(removed.revision).toBe(points.revision + 1)
    expect(await store.get(memo.id)).toEqual(removed)
  })
  it('accepts only one concurrent write at a revision and keeps the winning content', async () => {
    const { store, memo } = await fixture()
    const results = await Promise.allSettled(['Manual', 'Model'].map(title => store.edit(memo.id, { expectedRevision: 0, operations: [{ op: 'rename', title }] })))
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
    expect(String((results[1] as PromiseRejectedResult).reason)).toContain('MEMO_CONFLICT')
    expect((await store.get(memo.id)).title).toBe('Manual')
  })
  it('deletes a star containing more records than the operation limit with one revision', async () => {
    const { store, memo, directory } = await fixture()
    const created = await store.edit(memo.id, { expectedRevision: 0, operations: [{ op: 'addNode', title: 'Large star' }] })
    const populated = memoSchema.parse({ ...created, nodes: [{ ...created.nodes[0], points: Array.from({ length: 80 }, (_, index) => ({ id: randomUUID(), text: `Owned record ${index}` })) }] })
    await writeFile(join(directory, `${memo.id}.json`), JSON.stringify(populated), 'utf8')
    const removed = await store.edit(memo.id, { expectedRevision: created.revision, operations: [{ op: 'removeNode', nodeId: created.nodes[0].id }] })
    expect(removed.nodes).toEqual([])
    expect(removed).not.toHaveProperty('unassigned')
    expect(removed.revision).toBe(created.revision + 1)
    expect((await new MemoStore(directory).get(memo.id))).toEqual(removed)
  })
  it('rejects an invalid batch atomically and emits no change', async () => {
    const { store, memo, directory } = await fixture()
    const changes: unknown[] = []
    store.subscribe(change => changes.push(change))
    const before = await readFile(join(directory, `${memo.id}.json`), 'utf8')
    await expect(store.edit(memo.id, { expectedRevision: 0, operations: [{ op: 'rename', title: 'Must not land' }, { op: 'moveNode', nodeId: randomUUID(), afterId: null }] })).rejects.toThrow('MEMO_TARGET_MISSING')
    expect(await readFile(join(directory, `${memo.id}.json`), 'utf8')).toBe(before)
    expect(changes).toEqual([])
  })
  it('rejects completion state and unsafe file identities', async () => {
    const { store, memo } = await fixture()
    expect(memoSchema.safeParse({ ...memo, nodes: [{ id: randomUUID(), title: 'A', label: '', points: [], status: 'completed' }] }).success).toBe(false)
    await expect(store.get('../outside')).rejects.toThrow()
    await expect(store.edit(memo.id, { expectedRevision: 0, operations: [{ op: 'rename', title: 'Cancelled' }] }, undefined, () => false)).rejects.toThrow('disabled')
    expect((await store.get(memo.id)).revision).toBe(0)
  })
  it('requires the latest revision for deletion and never recreates a deleted file', async () => {
    const { store, memo } = await fixture()
    await store.edit(memo.id, { expectedRevision: 0, operations: [{ op: 'rename', title: 'A' }] })
    await expect(store.remove(memo.id, 0)).rejects.toThrow('MEMO_CONFLICT')
    await store.remove(memo.id, 1)
    await expect(store.edit(memo.id, { expectedRevision: 1, operations: [{ op: 'rename', title: 'Late model' }] })).rejects.toThrow()
    expect(await store.list()).toEqual([])
  })
  it('reports a corrupt memo without silently discarding it', async () => {
    const { store, memo, directory } = await fixture()
    await writeFile(join(directory, `${memo.id}.json`), 'invalid', 'utf8')
    await expect(store.list()).rejects.toThrow()
    expect(await readFile(join(directory, `${memo.id}.json`), 'utf8')).toBe('invalid')
  })
})
