import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { SUPPORTED_HARNESS_PROFILE } from '@janus-agent/harness-node'
import { createToolManifests, createWorkspaceChatTools } from '@janus-agent/agent-core'
import { NoteChatEditor, NOTE_CHAT_TOOLS, hasNoteMutationIntent, listNoteChatChanges } from '../../src/main/harness/note-chat'
import { HarnessNoteService } from '../../src/main/harness/service'
import { applyUndo } from '../../src/main/harness/undo'
import { runChatTurn, type ChatTurnPorts } from '@janus-agent/janus-agent'
import { attachNoteChatTools } from '../../src/main/harness/note-chat'
import { resolveNoteFocus } from '../../src/main/harness/note-focus'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'note-chat-'))
  roots.push(root)
  await mkdir(join(root, '.agents', 'notes'), { recursive: true })
  await writeFile(join(root, '.agents', 'harness.json'), JSON.stringify({ schemaVersion: 1, repoId: '8fa19f17-c717-43a8-93a7-810a5e0cbc91', name: 'Test', profile: SUPPORTED_HARNESS_PROFILE }))
  const service = new HarnessNoteService()
  const editor = new NoteChatEditor(service)
  const signal = new AbortController().signal
  const input = { reason: 'Record decisions', operations: ['First', 'Second'].map(title => ({ type: 'create', kind: 'idea', title, sections: { 'Idea': 'A concrete idea.' } })) }
  return { root, service, editor, signal, input }
}

describe('direct Note conversation', () => {
  it('highlights successful reads and writes without requiring a model focus call', async () => {
    const { root, editor, signal, input } = await fixture()
    const created = (await editor.write(root, 'chat', 'create', input, true, signal))!
    const focused: import('../../src/shared/note-chat').NoteFocusEvent[] = []
    const ports = {
      sessions: { getSession: () => ({ sessionId: 'session', workspaceId: 'ws', workspaceRoot: root, status: 'running' }) },
      tools: { registry: { list: () => [] }, executeFunctionCall: async () => { throw new Error('Unexpected tool') } },
    } as unknown as ChatTurnPorts
    attachNoteChatTools(ports, { conversationId: 'chat', userText: 'Update the Note', signal, resources: [{ agentSessionId: 'session', workspaceId: 'ws', workspacePath: root }], onChange: () => {}, onFocus: event => focused.push(event) })
    const invoke = (name: string, args: object) => ports.tools.executeFunctionCall({ sessionId: 'session', call: { toolName: name, input: args } } as never, 'test')
    const first = await invoke('note.read', { uri: created.files[0].uri })
    await invoke('note.read', { uri: created.files[1].uri })
    expect(focused.at(-1)?.notes.map(note => note.role)).toEqual(['reference', 'reference'])
    expect(focused.at(-1)?.focus).toBe('none')
    const read = first.output as { expectedHash: string }
    const result = await invoke('note.write', { reason: 'Update', operations: [{ type: 'update', uri: created.files[0].uri, expectedHash: read.expectedHash, title: 'Updated' }] })
    expect(result.status).toBe('completed')
    expect(focused.at(-1)?.notes[0]).toMatchObject({ title: 'Updated', role: 'target' })
    await invoke('note.scope', { reason: 'Specific scope', notes: [{ uri: created.files[1].uri, role: 'dependency', reason: 'Needed' }] })
    const count = focused.length
    await invoke('note.read', { uri: created.files[0].uri })
    expect(focused).toHaveLength(count)
    expect(focused.at(-1)?.mode).toBe('scope')
  })
  it('delivers a model scope call through the real facade without writing in an analysis turn', async () => {
    const { root, editor, signal, input } = await fixture()
    const created = (await editor.write(root, 'chat', 'create', input, true, signal))!
    const focused: unknown[] = []
    let turns = 0
    const ports: ChatTurnPorts = {
      model: { resolve: async () => ({ model: {}, modelId: 'fixture' }), getMaxTurns: async () => 3 },
      sessions: { getSession: () => ({ sessionId: 'session', workspaceId: 'ws', workspaceRoot: root, status: 'running' }) },
      tools: { registry: { list: () => [] }, executeFunctionCall: async () => { throw new Error('Unexpected generic tool') } },
      streamTextFn: async options => {
        expect(Object.keys(options.tools as object)).toContain('note_scope')
        expect(Object.keys(options.tools as object)).not.toContain('note_write')
        const first = turns++ === 0
        return { textStream: (async function* () { if (!first) yield 'Relevant Notes located.' })(), toolCalls: Promise.resolve(first ? [{ toolCallId: 'scope-1', toolName: 'note_scope', args: { reason: 'Analysis scope', notes: created.files.map(file => ({ uri: file.uri, role: 'reference', reason: 'Background' })) } }] : []) }
      },
    }
    attachNoteChatTools(ports, { conversationId: 'chat', userText: 'Analyze the Notes', signal, resources: [{ agentSessionId: 'session', workspaceId: 'ws', workspacePath: root }], onChange: () => { throw new Error('Unexpected write') }, onFocus: event => focused.push(event) })
    await runChatTurn({ sourceTag: 'maintenance', requestId: 'request', providerId: 'fixture', messages: [{ role: 'user', content: 'Analyze the Notes' }], workspaceResources: [{ agentSessionId: 'session', workspaceId: 'ws', workspacePath: root, workspaceName: 'Test' }], toolAllowlist: ['note_scope', 'note_focus', 'note_write'] }, ports, {}, signal)
    expect(focused).toHaveLength(1)
    expect((await listNoteChatChanges(root, 'chat'))).toHaveLength(1)
  })
  it('finds incoming Markdown references without converting them to execution dependencies', async () => {
    const { root, editor, signal, input } = await fixture()
    const created = (await editor.write(root, 'chat', 'create', input, true, signal))!
    const [a, b] = created.files
    const read = await editor.read(root, a.uri)
    await editor.write(root, 'chat', 'link', { reason: 'Link related Note', operations: [{ type: 'update', uri: a.uri, expectedHash: read.expectedHash, sections: { Idea: `[Reference](${b.uri})` } }] }, true, signal)
    const found = await editor.list(root, '', b.uri)
    expect(found.notes.map(note => note.uri)).toEqual(expect.arrayContaining([a.uri, b.uri]))
    expect(found.mentions).toHaveLength(1)
    expect(found.relations).toEqual([])
  })
  it('validates multiple real focus targets and refuses missing or foreign identities atomically', async () => {
    const { root, editor, service, signal, input } = await fixture()
    const created = (await editor.write(root, 'chat', 'create', input, true, signal))!
    const args = { reason: 'Related Notes', focus: 'explicit', notes: created.files.map(file => ({ uri: file.uri, role: 'target', reason: 'Goal' })) }
    const focused = await resolveNoteFocus(service, root, 'chat', 'scope', args, 'Locate these Notes')
    expect(focused.focus).toBe('explicit')
    expect(focused.notes.map(note => note.title)).toEqual(['First', 'Second'])
    expect((await resolveNoteFocus(service, root, 'chat', 'display', args, 'Read these Notes')).focus).toBe('auto')
    await expect(resolveNoteFocus(service, root, 'chat', 'scope', { ...args, notes: [...args.notes, { uri: 'note://00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000001', role: 'target', reason: 'Missing' }] }, 'Locate')).rejects.toBeTruthy()
    expect((await editor.list(root, '')).notes).toHaveLength(2)
  })
  it('runs a model Note call through the facade, host session and real transaction', async () => {
    const { root, signal, input, editor } = await fixture()
    let turns = 0
    const changes: unknown[] = []
    const ports: ChatTurnPorts = {
      model: { resolve: async () => ({ model: {}, modelId: 'fixture' }), getMaxTurns: async () => 3 },
      sessions: { getSession: () => ({ sessionId: 'session', workspaceId: 'ws', workspaceRoot: root, status: 'running' }) },
      tools: { registry: { list: () => [] }, executeFunctionCall: async () => { throw new Error('Unexpected generic tool') } },
      streamTextFn: async options => {
        expect(Object.keys(options.tools as object)).toContain('note_write')
        const first = turns++ === 0
        return { textStream: (async function* () { if (!first) yield 'Recorded.' })(), toolCalls: Promise.resolve(first ? [{ toolCallId: 'write-1', toolName: 'note_write', args: input }] : []) }
      },
    }
    attachNoteChatTools(ports, { conversationId: 'chat', userText: 'Create two Notes', signal, resources: [{ agentSessionId: 'session', workspaceId: 'ws', workspacePath: root }], onChange: change => changes.push(change) })
    await runChatTurn({ sourceTag: 'maintenance', requestId: 'request', conversationId: 'chat', providerId: 'fixture', messages: [{ role: 'user', content: 'Create two Notes' }], workspaceResources: [{ agentSessionId: 'session', workspaceId: 'ws', workspacePath: root, workspaceName: 'Test' }], toolAllowlist: ['note_list', 'note_read', 'note_write'] }, ports, {}, signal)
    expect(changes).toHaveLength(1)
    expect((await editor.list(root, '')).notes).toHaveLength(2)
  })
  it.each(['先分析讨论如何修改', '不要修改，解释一下', 'Analyze how to update the notes', 'do not edit', '不要更新 note', 'Do not create a Note', '不修改，只阅读'])('keeps discussion read-only: %s', text => {
    expect(hasNoteMutationIntent(text)).toBe(false)
  })
  it.each(['请直接修改这两个 note', '记录到note中', 'Update the Note', '创建一个需求 Note'])('permits explicit instructions: %s', text => {
    expect(hasNoteMutationIntent(text)).toBe(true)
  })
  it('offers nested Note schemas through the actual installed model adapter', () => {
    const tools = createWorkspaceChatTools({ runtime: { executeFunctionCall: async () => { throw new Error('unused') } }, resources: new Map(), callerId: 'test', toolManifests: createToolManifests(NOTE_CHAT_TOOLS) }) as Record<string, { parameters: { parse(value: unknown): unknown } }>
    expect(Object.keys(tools)).toEqual(expect.arrayContaining(['note_list', 'note_read', 'note_write', 'note_scope', 'note_focus']))
    expect(tools.note_write.parameters.parse({ reason: 'test', operations: [{ type: 'create', kind: 'idea', sections: { Idea: 'Text' } }] })).toMatchObject({ operations: [{ sections: { Idea: 'Text' } }] })
  })
  it('creates multiple Notes once, discovers them, updates real bytes and restores them on undo', async () => {
    const { root, editor, service, signal, input } = await fixture()
    const created = await editor.write(root, 'chat', 'create', input, true, signal)
    expect(created?.files).toHaveLength(2)
    expect(await editor.write(root, 'chat', 'create', input, true, signal)).toEqual(created)
    expect((await editor.list(root, '')).notes).toHaveLength(2)
    const uri = created!.files[0].uri
    const read = await editor.read(root, uri)
    const changed = await editor.write(root, 'chat', 'update', { reason: 'Refine idea', operations: [{ type: 'update', uri, expectedHash: read.expectedHash, sections: { Idea: 'Refined idea.' } }] }, true, signal)
    expect((await service.readNote(root, uri)).raw).toContain('Refined idea.')
    expect(await listNoteChatChanges(root, 'chat')).toHaveLength(2)
    expect((await applyUndo(root, changed!.txId)).errors).toEqual([])
    expect((await service.readNote(root, uri)).raw).toBe(read.markdown)
    expect((await listNoteChatChanges(root, 'chat')).find(row => row.id === changed!.id)?.reverted).toBe(true)
  })
  it('refuses unauthorized, unread, stale and cancelled writes without partial application', async () => {
    const { root, editor, service, signal, input } = await fixture()
    await expect(editor.write(root, 'chat', 'denied', input, false, signal)).rejects.toThrow('discussion')
    const created = await editor.write(root, 'chat', 'create', input, true, signal)
    const uri = created!.files[0].uri
    const original = await service.readNote(root, uri)
    const operation = { type: 'update', uri, expectedHash: original.sha256, title: 'Changed' }
    await expect(editor.write(root, 'chat', 'unread', { reason: 'edit', operations: [operation] }, true, signal)).rejects.toThrow('Read the Note')
    await editor.read(root, uri)
    await writeFile(join(root, original.relPath), original.raw + '\nExternal change\n')
    await expect(editor.write(root, 'chat', 'stale', { reason: 'edit', operations: [input.operations[0], operation] }, true, signal)).rejects.toThrow('CONFLICT')
    expect((await editor.list(root, '')).notes).toHaveLength(2)
    expect(await readFile(join(root, original.relPath), 'utf8')).toContain('External change')
    const cancelled = new AbortController(); cancelled.abort()
    await expect(editor.write(root, 'chat', 'cancelled', input, true, cancelled.signal)).rejects.toThrow('cancelled')
  })
  it('recovers receipts from the journal when the completion reference was lost', async () => {
    const { root, editor, signal, input } = await fixture()
    const change = (await editor.write(root, 'chat', 'create', input, true, signal))!
    const file = join(root, '.agents', '.local', 'note-chat', createHash('sha256').update('chat').digest('hex'), change.id + '.json')
    const record = JSON.parse(await readFile(file, 'utf8')); delete record.txId
    await writeFile(file, JSON.stringify(record))
    expect((await listNoteChatChanges(root, 'chat'))[0].txId).toBe(change.txId)
    expect(await listNoteChatChanges(root, 'other-chat')).toEqual([])
  })
  it('rejects forged metadata and invalid Note structure before creating files', async () => {
    const { root, editor, signal, input } = await fixture()
    await expect(editor.write(root, 'chat', 'metadata', { ...input, operations: [{ ...input.operations[0], execution: { state: 'done' } }] }, true, signal)).rejects.toThrow()
    await expect(editor.write(root, 'chat', 'heading', { ...input, operations: [{ ...input.operations[0], sections: { Idea: '# Forged second title' } }] }, true, signal)).rejects.toBeTruthy()
    expect((await editor.list(root, '')).notes).toHaveLength(0)
  })
})
