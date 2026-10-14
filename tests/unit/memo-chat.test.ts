import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runChatTurn, type ChatTurnPorts } from '@janus-agent/janus-agent'
import { MemoStore } from '../../src/main/memo/store'
import { attachMemoChatTools, memoSteeringContext } from '../../src/main/memo/chat-tools'
import type { MemoBinding } from '../../src/shared/memo'

const directories: string[] = []
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }) })
async function fixture(selection?: 'selected' | string | null) {
  const directory = await mkdtemp(join(tmpdir(), 'janus-memo-chat-'))
  directories.push(directory)
  const store = new MemoStore(directory)
  const empty = await store.create('A')
  const memo = await store.edit(empty.id, { expectedRevision: 0, operations: [{ op: 'addNode', title: 'Conclusions' }] })
  const controller = new AbortController()
  const ports: ChatTurnPorts = {
    model: { resolve: async () => ({ model: {}, modelId: 'fixture' }), getMaxTurns: () => 8 },
    sessions: { getSession: () => null },
    tools: { registry: { list: () => [] }, executeFunctionCall: async () => { throw new Error('Unexpected workspace tool') } },
    streamTextFn: async () => ({ textStream: (async function* () { yield 'Done' })() }),
  }
  const binding: MemoBinding = { memoId: memo.id, messageId: 'message-1', selectedNodeId: selection === 'selected' ? memo.nodes[0].id : selection }
  const prefix = await attachMemoChatTools(ports, { store, binding, conversationId: 'chat-1', signal: controller.signal })
  const call = async (name: string, args: unknown) => {
    const result = await ports.localTools!.find(tool => tool.name === name)!.execute({ id: 'call', name, arguments: args }, controller.signal)
    return { result, data: result.isError ? undefined : JSON.parse(result.content) }
  }
  return { store, memo, controller, ports, prefix, call, binding }
}

describe('memo tools in the shared Chat turn', () => {
  it('creates and binds an unbound memo once, then edits the same file with message provenance', async () => {
    const { store, ports, controller } = await fixture()
    ports.localTools = []
    const bindings: MemoBinding[] = []
    const prefix = await attachMemoChatTools(ports, { store, conversationId: 'new-chat', messageId: 'create-message', signal: controller.signal, onCreated: binding => bindings.push(binding) })
    expect(prefix).toContain('No memo is bound')
    const call = (name: string, args: unknown) => ports.localTools!.find(tool => tool.name === name)!.execute({ id: name, name, arguments: args }, controller.signal)
    expect((await call('memo_edit', { expectedRevision: 0, operations: [{ op: 'rename', title: 'Wrong target' }] })).isError).toBe(true)
    const created = JSON.parse((await call('memo_create', { title: '工程排期' })).content)
    expect(created).toMatchObject({ created: true, title: '工程排期', revision: 0 })
    expect(JSON.parse((await call('memo_create', { title: 'Duplicate' })).content)).toMatchObject({ created: false, id: created.id })
    expect(bindings).toEqual([{ memoId: created.id, messageId: 'create-message', selectedNodeId: null }])
    await call('memo_edit', { expectedRevision: 0, operations: [{ op: 'addNode', title: '092' }, { op: 'addNode', title: '093' }] })
    const read = JSON.parse((await call('memo_read', {})).content)
    await call('memo_edit', { expectedRevision: read.revision, operations: [{ op: 'addPoint', nodeId: read.nodes[0].id, text: '备忘录' }] })
    expect((await store.get(created.id)).nodes[0].points[0]).toMatchObject({ text: '备忘录', source: { conversationId: 'new-chat', messageId: 'create-message' } })
    expect((await store.list()).map(memo => memo.title).sort()).toEqual(['A', '工程排期'])
  })

  it('never creates after cancellation or offers creation for an existing binding', async () => {
    const { store, ports, controller } = await fixture()
    expect(ports.localTools!.map(tool => tool.name)).not.toContain('memo_create')
    ports.localTools = []
    await attachMemoChatTools(ports, { store, conversationId: 'new-chat', messageId: 'new-message', signal: controller.signal, onCreated: () => { throw new Error('Unexpected binding') } })
    controller.abort()
    const result = await ports.localTools!.find(tool => tool.name === 'memo_create')!.execute({ id: 'create', name: 'memo_create', arguments: { title: 'Cancelled' } }, controller.signal)
    expect(result.isError).toBe(true)
    expect((await store.list()).map(memo => memo.title)).toEqual(['A'])
  })

  it('keeps operation-specific validation behind the portable model parameter schema', async () => {
    const { memo, ports, call, store } = await fixture()
    const parameters = ports.localTools!.find(tool => tool.name === 'memo_edit')!.parameters
    for (const operation of [{ op: 'addPoint', text: 'Missing target' }, { op: 'removeNode', nodeId: memo.nodes[0].id, text: 'Irrelevant field' }, { op: 'moveNode', nodeId: memo.nodes[0].id }]) {
      const input = { expectedRevision: memo.revision, operations: [operation] }
      expect(parameters.safeParse(input).success).toBe(true)
      expect((await call('memo_edit', input)).result.isError).toBe(true)
      expect((await store.get(memo.id)).revision).toBe(memo.revision)
    }
  })

  it('exposes the send-time selection in the prompt and fresh reads without retargeting', async () => {
    const { memo, prefix, call, binding } = await fixture('selected')
    const selectedNode = { status: 'selected', nodeId: memo.nodes[0].id }
    expect(prefix).toContain(JSON.stringify(selectedNode))
    expect(prefix).toContain('"messageId":"message-1"')
    binding.selectedNodeId = null
    const { data } = await call('memo_read', {})
    expect(data.selectedNode).toEqual(selectedNode)
    const { data: saved } = await call('memo_edit', { expectedRevision: data.revision, operations: [{ op: 'addPoint', nodeId: data.selectedNode.nodeId, text: 'Current star record' }] })
    expect(saved.success).toBe(true)
    expect(saved.selectedNode).toEqual(selectedNode)
  })

  it.each([undefined, null])('distinguishes unavailable selection from an empty selection: %s', async selection => {
    const { call } = await fixture(selection)
    expect((await call('memo_read', {})).data.selectedNode).toEqual({ status: selection === null ? 'none' : 'unavailable' })
  })

  it('reports deletion as missing for the running turn instead of selecting a surviving star', async () => {
    const { store, memo, call } = await fixture('selected')
    await store.edit(memo.id, { expectedRevision: memo.revision, operations: [{ op: 'addNode', title: 'Survivor' }, { op: 'removeNode', nodeId: memo.nodes[0].id }] })
    const { data } = await call('memo_read', {})
    expect(data.selectedNode).toEqual({ status: 'missing', nodeId: memo.nodes[0].id })
    expect(data.nodes).toHaveLength(1)
    expect((await call('memo_read', { nodeId: data.selectedNode.nodeId })).result.isError).toBe(true)
    expect((await call('memo_edit', { expectedRevision: data.revision, operations: [{ op: 'addPoint', nodeId: data.selectedNode.nodeId, text: 'Late' }] })).result.isError).toBe(true)
    expect((await store.get(memo.id)).nodes[0].points).toEqual([])
  })

  it('validates selection against the bound memo and still permits an explicitly named target', async () => {
    const foreignId = '00000000-0000-4000-8000-000000000123'
    const { memo, prefix, call } = await fixture(foreignId)
    expect(prefix).toContain(JSON.stringify({ status: 'missing', nodeId: foreignId }))
    expect((await call('memo_read', { nodeId: foreignId })).result.isError).toBe(true)
    expect((await call('memo_edit', { expectedRevision: memo.revision, operations: [{ op: 'addPoint', nodeId: memo.nodes[0].id, text: 'Explicit destination' }] })).data.success).toBe(true)
  })

  it('scopes steering selection to its own message and requires a node read', async () => {
    const { memo, binding } = await fixture('selected')
    const parse = (value: string) => JSON.parse(value.slice(value.indexOf('{')))
    expect(parse(memoSteeringContext(memo.id, 'steered-2', binding))).toEqual({ memoId: memo.id, messageId: 'steered-2', selectedNode: { status: 'unverified', nodeId: memo.nodes[0].id } })
    expect(parse(memoSteeringContext('another-memo', 'steered-3', binding)).selectedNode).toEqual({ status: 'unavailable' })
    expect(parse(memoSteeringContext(memo.id, 'steered-4', { ...binding, selectedNodeId: null })).selectedNode).toEqual({ status: 'none' })
    expect(parse(memoSteeringContext(memo.id, 'steered-5', { ...binding, selectedNodeId: 'invalid' })).selectedNode).toEqual({ status: 'unavailable' })
  })

  it('reads only node-owned records and rejects the retired null destination', async () => {
    const { store, memo, call } = await fixture()
    const { data: overview } = await call('memo_read', {})
    expect(overview).not.toHaveProperty('points')
    expect(overview).not.toHaveProperty('unassignedCount')
    const rejected = await call('memo_edit', { expectedRevision: memo.revision, operations: [{ op: 'addPoint', nodeId: null, text: 'Retired destination' }] })
    expect(rejected.result.isError).toBe(true)
    expect((await store.get(memo.id)).revision).toBe(memo.revision)
    expect((await call('memo_read', { nodeId: null })).result.isError).toBe(true)
    await call('memo_edit', { expectedRevision: memo.revision, operations: [{ op: 'addPoint', nodeId: memo.nodes[0].id, text: 'Owned conclusion' }] })
    const { data: page } = await call('memo_read', { nodeId: memo.nodes[0].id, limit: 1 })
    expect(page.points.map((point: { text: string }) => point.text)).toEqual(['Owned conclusion'])
    expect(page.total).toBe(1)
  })

  it('writes in the normal loop without a workspace or a separate model phase', async () => {
    const { store, memo, ports, prefix } = await fixture()
    let rounds = 0
    ports.streamTextFn = async options => {
      expect(Object.keys(options.tools as object)).toContain('memo_read')
      expect(Object.keys(options.tools as object)).toContain('memo_edit')
      const index = rounds++
      if (index < 2) return { textStream: (async function* () {})(), fullStream: (async function* () {
        yield { type: 'tool-call', toolCallId: `c${index}`, toolName: index === 0 ? 'memo_read' : 'memo_edit', args: index === 0 ? {} : { expectedRevision: memo.revision, operations: [{ op: 'addPoint', nodeId: memo.nodes[0].id, text: 'Remember this conclusion' }] } }
        yield { type: 'finish', finishReason: 'tool-calls' }
      })() }
      expect(JSON.stringify(options.messages)).toContain('Remember this conclusion')
      return { textStream: (async function* () { yield 'A updated' })() }
    }
    const result = await runChatTurn({ requestId: 'memo', providerId: 'fixture', sourceTag: 'janus-chat', systemPromptPrefix: prefix, messages: [{ role: 'user', content: 'Record this conclusion' }] }, ports)
    expect(result.text).toBe('A updated')
    expect(rounds).toBe(3)
    expect(result.toolTraces.map(trace => trace.toolName)).toEqual(['memo_read', 'memo_edit'])
    expect((await store.get(memo.id)).nodes[0].points[0].source).toEqual({ conversationId: 'chat-1', messageId: 'message-1' })
  })

  it('keeps the originating conversation memo when another file is selected', async () => {
    const { store, memo, call } = await fixture()
    const other = await store.create('B')
    const { data: read } = await call('memo_read', {})
    expect((await call('memo_edit', { expectedRevision: read.revision, operations: [{ op: 'rename', title: 'A updated' }] })).result.isError).toBeUndefined()
    expect((await store.get(memo.id)).title).toBe('A updated')
    expect((await store.get(other.id)).title).toBe('B')
  })

  it('reports conflict, requires a fresh read and retains manual edits', async () => {
    const { store, memo, call } = await fixture()
    const { data: read } = await call('memo_read', {})
    await store.edit(memo.id, { expectedRevision: read.revision, operations: [{ op: 'rename', title: 'Manual edit' }] })
    const conflict = await call('memo_edit', { expectedRevision: read.revision, operations: [{ op: 'addPoint', nodeId: memo.nodes[0].id, text: 'Model point' }] })
    expect(conflict.result.isError).toBe(true)
    expect(conflict.result.content).toContain('MEMO_CONFLICT')
    const { data: fresh } = await call('memo_read', {})
    await call('memo_edit', { expectedRevision: fresh.revision, operations: [{ op: 'addPoint', nodeId: memo.nodes[0].id, text: 'Model point' }] })
    expect((await store.get(memo.id)).title).toBe('Manual edit')
    expect((await store.get(memo.id)).nodes[0].points[0].text).toBe('Model point')
  })

  it('does not write after cancellation or recreate a deleted memo', async () => {
    const { store, memo, controller, call } = await fixture()
    controller.abort()
    expect((await call('memo_edit', { expectedRevision: 0, operations: [{ op: 'rename', title: 'Late' }] })).result.isError).toBe(true)
    expect((await store.get(memo.id)).revision).toBe(memo.revision)
    const next = await fixture()
    await next.store.remove(next.memo.id, next.memo.revision)
    expect((await next.call('memo_edit', { expectedRevision: 0, operations: [{ op: 'rename', title: 'Deleted' }] })).result.isError).toBe(true)
    expect(await next.store.list()).toEqual([])
  })
})
