import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createVertex } from '@ai-sdk/google-vertex'
import { streamText } from 'ai'
import { runChatTurn, type ChatTurnPorts } from '@janus-agent/janus-agent'
import { withAiSdkV1StreamCompatibility } from '../../packages/llm-core/src/utils/stream-compat'
import { MemoStore } from '../../src/main/memo/store'
import { attachMemoChatTools } from '../../src/main/memo/chat-tools'

const directories: string[] = []
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }) })

it.each([false, true])('sends complete memo types through Vertex and creates the requested 092/093 schedule (unbound=%s)', async unbound => {
  const root = await mkdtemp(join(tmpdir(), 'memo-vertex-schema-'))
  directories.push(root)
  const store = new MemoStore(root)
  let memoId = unbound ? '' : (await store.create('工程排期')).id
  const ports = {} as ChatTurnPorts
  const prefix = await attachMemoChatTools(ports, { store, binding: unbound ? undefined : { memoId, messageId: 'schedule' }, messageId: 'schedule', onCreated: binding => { memoId = binding.memoId }, conversationId: 'schedule-chat', signal: new AbortController().signal })
  const requests: any[] = []
  const points = [['备忘录', 'shell功能扩展', '工具界面提升', '界面小改', '用量统计'], ['远程基座', 'docker（基础）', 'http（基础）']]
  function latestMemo(body: any) {
    let found: any
    function walk(value: any) {
      if (typeof value === 'string') { try { walk(JSON.parse(value)) } catch { /* prompt prose */ } }
      else if (Array.isArray(value)) value.forEach(walk)
      else if (value && typeof value === 'object') {
        if (value.id === memoId && Array.isArray(value.nodes)) found = value
        Object.values(value).forEach(walk)
      }
    }
    walk(body)
    return found
  }
  const vertex = createVertex({ apiKey: 'fixture-no-network', fetch: async (_url, init) => {
    const request = JSON.parse(String(init!.body))
    const index = requests.length - (unbound ? 1 : 0)
    requests.push(request)
    const current = latestMemo(request)
    const call = (name: string, args: unknown) => ({ functionCall: { name, args } })
    const part = index === -1 ? call('memo_create', { title: '工程排期' }) : index === 0 || index === 2 ? call('memo_read', {})
      : index === 1 ? call('memo_edit', { expectedRevision: current.revision, operations: [{ op: 'addNode', title: '092', afterId: null }, { op: 'addNode', title: '093' }] })
        : index === 3 ? call('memo_edit', { expectedRevision: current.revision, operations: current.nodes.flatMap((node: any, nodeIndex: number) => points[nodeIndex].map(text => ({ op: 'addPoint', nodeId: node.id, text }))) })
          : { text: '工程排期已保存' }
    return new Response(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [part] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } })}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
  } })
  Object.assign(ports, { model: { resolve: async () => ({ model: withAiSdkV1StreamCompatibility(vertex('gemini-2.5-pro') as never), modelId: 'gemini-2.5-pro' }), getMaxTurns: () => 8 },
    sessions: { getSession: () => null }, tools: { registry: { list: () => [] }, executeFunctionCall: async () => { throw new Error('Unexpected workspace tool') } }, streamTextFn: streamText })
  const result = await runChatTurn({ requestId: 'schedule-request', providerId: 'vertex-fixture', sourceTag: 'janus-chat', systemPromptPrefix: prefix,
    messages: [{ role: 'user', content: '帮我建立工程排期备忘录，092节点为备忘录/shell功能扩展/工具界面提升/界面小改/用量统计，093节点为远程基座/docker（基础）/http（基础）' }],
  }, ports)
  expect(result.text).toBe('工程排期已保存')
  expect(requests).toHaveLength(unbound ? 6 : 5)
  const saved = await store.get(memoId)
  expect(await store.list()).toHaveLength(1)
  expect(saved.nodes.map(node => node.title)).toEqual(['092', '093'])
  expect(saved.nodes.map(node => node.points.map(point => point.text))).toEqual(points)
  expect(saved.revision).toBe(2)
  expect(saved.nodes[0].points[0].source).toEqual({ conversationId: 'schedule-chat', messageId: 'schedule' })
  const definitions = requests.flatMap(request => request.tools.flatMap((tool: any) => tool.functionDeclarations ?? [])).filter(tool => tool.name.startsWith('memo_'))
  expect(new Set(definitions.map((tool: any) => tool.name))).toEqual(new Set(unbound ? ['memo_create', 'memo_read', 'memo_edit'] : ['memo_read', 'memo_edit']))
  const missing: string[] = []
  function check(schema: any, path: string) {
    if (!schema.type && !schema.anyOf && !schema.oneOf && !schema.allOf) missing.push(path)
    for (const [key, value] of Object.entries(schema.properties ?? {})) check(value, `${path}.${key}`)
    if (schema.items) check(schema.items, `${path}[]`)
    for (const key of ['anyOf', 'oneOf', 'allOf']) schema[key]?.forEach((item: any, index: number) => check(item, `${path}.${key}[${index}]`))
  }
  definitions.forEach((tool: any) => check(tool.parameters, tool.name))
  expect(missing).toEqual([])
  const edit = definitions.find((tool: any) => tool.name === 'memo_edit').parameters
  expect(edit.properties.operations.items.properties.afterId).toMatchObject({ type: 'string', nullable: true })
})
