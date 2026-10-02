// Note: conversational Note tools preserve transactions and highlight actual access — see .agents/notes/2026-10-02-blueprint-conversation-development--3efc89cf.md
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { parseNote, NOTE_URI_RE } from '@janus-agent/harness-core'
import { listPendingTx, readCommitted, readJournal } from '@janus-agent/harness-node'
import { createToolManifests, type ToolDefinition, type ToolResult } from '@janus-agent/agent-core'
import type { ChatTurnPorts } from '@janus-agent/janus-agent'
import type { NoteChatChange } from '../../shared/note-chat'
import { HarnessNoteService, harnessNoteService } from './service'
import { createNoteOp, mergeNoteEdit } from './artifact-producer'
import { previewUndo } from './undo'
import { NOTE_FOCUS_SCHEMA, resolveNoteFocus } from './note-focus'
import type { NoteFocusEvent } from '../../shared/note-chat'

const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const rootKey = (root: string) => process.platform === 'win32' ? resolve(root).toLowerCase() : resolve(root)
const directory = (root: string, conversationId: string) => join(root, '.agents', '.local', 'note-chat', hash(conversationId))
const fail = (error: unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error)

/** Discussion is read-only unless the current user turn actually requests a mutation. */
export function hasNoteMutationIntent(text: string): boolean {
  if (/(?:不要|不必|先别|暂不|不允许|先不|暂时不|不|do not|don't|without)\s*(?:修改|更新|编辑|新增|新建|写入|保存|创建|记录|改|edit|update|create|add|record|rename|replace|write|modify|save|change)/i.test(text)) return false
  if (/(?:分析|讨论|解释|建议|如何|怎么|怎样|是否|能否|analy[sz]e|discuss|explain|suggest|how (?:to|would|should))/i.test(text)
    && !/(?:直接|立即|现在|然后|并且|并|please)\s*(?:修改|更新|创建|新增|保存|写入|edit|update|create|save)/i.test(text)) return false
  return /(?:修改|更新|编辑|新增|新建|创建|写入|保存|记录到|补充|补上|改成|改为|改一下|按.{0,30}(?:调整|执行|更新)|\b(?:edit|update|create|write|save|rename|replace|add|record)\b)/i.test(text)
}

const operationSchema = z.object({
  type: z.enum(['create', 'update']),
  uri: z.string().regex(NOTE_URI_RE).optional(),
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  kind: z.enum(['idea', 'initiative', 'requirement', 'decision', 'task']).optional(),
  title: z.string().trim().min(1).max(300).refine(value => !/[\r\n]/.test(value)).optional(),
  sections: z.record(z.string().max(200_000)).default({}),
  tags: z.array(z.string().max(100)).max(32).optional(),
  parent: z.string().regex(NOTE_URI_RE).nullable().optional(),
  lifecycle: z.enum(['draft', 'proposed', 'accepted', 'archived', 'rejected']).optional(),
}).strict()
const writeSchema = z.object({ reason: z.string().trim().min(1).max(1000), operations: z.array(operationSchema).min(1).max(16) }).strict()
const changeSchema = z.object({
  id: z.string().uuid(), conversationId: z.string(), workspacePath: z.string(), reason: z.string(), createdAt: z.string().datetime(),
  txId: z.string().regex(/^[a-zA-Z0-9-]+$/).optional(), reverted: z.boolean().optional(),
  files: z.array(z.object({ uri: z.string().regex(NOTE_URI_RE), title: z.string(), before: z.string(), after: z.string() })).min(1).max(16),
})

async function saveChange(change: NoteChatChange): Promise<void> {
  const dir = directory(change.workspacePath, change.conversationId)
  await mkdir(dir, { recursive: true })
  const file = join(dir, `${change.id}.json`)
  const temporary = `${file}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(change), 'utf8')
  await rename(temporary, file)
}

/** A prewritten record plus the transaction journal survives a lost completion event. */
export async function listNoteChatChanges(root: string, conversationId: string): Promise<NoteChatChange[]> {
  const dir = directory(root, conversationId)
  const names = await readdir(dir).catch(error => { if (error.code === 'ENOENT') return [] as string[]; throw error })
  const changes: NoteChatChange[] = []
  for (const name of names.filter(name => /^[a-f0-9-]+\.json$/.test(name))) {
    const change: NoteChatChange = changeSchema.parse(JSON.parse(await readFile(join(dir, name), 'utf8')))
    if (change.conversationId !== conversationId || rootKey(change.workspacePath) !== rootKey(root)) continue
    if (!change.txId) {
      for (const txId of await listPendingTx(root)) {
        if ((await readJournal(root, txId))?.changeSetId === change.id && await readCommitted(root, txId)) { change.txId = txId; break }
      }
    }
    if (change.txId && await readCommitted(root, change.txId)) {
      const { preview } = await previewUndo(root, change.txId)
      change.reverted = !!preview?.files.length && preview.files.every(file => file.status === 'already-reverted')
      changes.push(change)
    }
  }
  return changes.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export class NoteChatEditor {
  private reads = new Map<string, string>()
  private writes = new Map<string, Promise<NoteChatChange | null>>()
  constructor(private readonly service: HarnessNoteService = harnessNoteService) {}

  async list(root: string, query: string, relatedTo?: string) {
    const snapshot = await this.service.readSnapshot(root)
    if (relatedTo) await this.service.readNote(root, relatedTo)
    const relations = relatedTo ? snapshot.relations.filter(edge => edge.sourceUri === relatedTo || edge.targetUri === relatedTo) : []
    const mentions = relatedTo ? snapshot.mentions.filter(edge => edge.sourceUri === relatedTo || edge.targetUri === relatedTo) : []
    const related = new Set([relatedTo, ...relations.flatMap(edge => [edge.sourceUri, edge.targetUri]), ...mentions.flatMap(edge => [edge.sourceUri, edge.targetUri])])
    const search = query.trim().toLowerCase()
    return { repoId: snapshot.repoId, coverage: snapshot.coverage, relations, mentions, notes: snapshot.entries.filter(entry => entry.doc && (!relatedTo || related.has(entry.uri)) && (!search
      || [entry.doc.title, entry.doc.body, ...entry.doc.tags].join('\n').toLowerCase().includes(search)))
      .slice(0, 100).map(entry => ({ uri: entry.uri, title: entry.doc!.title, kind: entry.doc!.kind, path: entry.relPath })),
      diagnostics: snapshot.diagnostics }
  }

  async read(root: string, uri: string) {
    if (!NOTE_URI_RE.test(uri)) throw new Error('Invalid Note URI')
    await this.service.readSnapshot(root)
    const result = await this.service.readNote(root, uri)
    this.reads.set(`${root}:${uri}`, result.sha256)
    return { uri, markdown: result.raw, expectedHash: result.sha256, path: result.relPath }
  }

  write(root: string, conversationId: string, callId: string, input: unknown, authorized: boolean, signal: AbortSignal): Promise<NoteChatChange | null> {
    const key = `${root}:${conversationId}:${callId}`
    const existing = this.writes.get(key)
    if (existing) return existing
    const writing = this.apply(root, conversationId, input, authorized, signal)
    this.writes.set(key, writing)
    return writing
  }

  private async apply(root: string, conversationId: string, input: unknown, authorized: boolean, signal: AbortSignal): Promise<NoteChatChange | null> {
    if (!authorized) throw new Error('This turn requests discussion only. Ask the user for a Note change instruction.')
    if (signal.aborted) throw new Error('Note edit cancelled')
    const args = writeSchema.parse(input)
    const snapshot = await this.service.readSnapshot(root)
    if (!snapshot.repoId) throw new Error('Project Note identity is missing')
    const files: NoteChatChange['files'] = []
    const ops: Parameters<HarnessNoteService['applyBundleChangeSet']>[1]['operations'] = []
    const seen = new Set<string>()
    for (const op of args.operations) {
      if (Object.keys(op.sections).some(name => !name.trim() || /[\r\n]/.test(name))) throw new Error('Invalid section name')
      let uri: string, before: string, after: string, expectedHash: string | null
      if (op.type === 'create') {
        if (!op.kind || !op.title || op.uri || op.expectedHash) throw new Error('Create requires kind and title; Note identity is host assigned')
        const created = createNoteOp(snapshot.repoId, op.kind, op.title, op.parent ?? null, args.reason)
        uri = created.uri; before = ''; expectedHash = null
        after = mergeNoteEdit(parseNote(created.afterMarkdown!), created.afterMarkdown!, { frontmatter: { tags: op.tags, lifecycle: op.lifecycle }, sections: op.sections }, args.reason)
      } else {
        if (!op.uri || !op.expectedHash || this.reads.get(`${root}:${op.uri}`) !== op.expectedHash) throw new Error('Read the Note with note_read before editing; use its exact expectedHash')
        const current = await this.service.readNote(root, op.uri)
        if (current.sha256 !== op.expectedHash) throw new Error('CONFLICT: Note changed since reading; read it again')
        if (current.note.meta.execution) throw new Error('Task has execution metadata; use the execution workflow to change its contract')
        if (op.kind && op.kind !== current.note.meta.kind) throw new Error('Note kind cannot be changed')
        uri = op.uri; before = current.raw; expectedHash = op.expectedHash
        after = mergeNoteEdit(current.note, before, { title: op.title, frontmatter: { tags: op.tags, parent: op.parent, lifecycle: op.lifecycle }, sections: op.sections }, args.reason)
      }
      if (seen.has(uri)) throw new Error('Duplicate Note in one write')
      seen.add(uri)
      if (before === after) continue
      files.push({ uri, title: /^#\s+(.+)$/m.exec(after)?.[1] ?? uri, before, after })
      ops.push({ operationId: randomUUID(), type: op.type === 'create' ? 'create' : 'replace', uri, expectedHash, afterMarkdown: after })
    }
    if (!ops.length) return null
    if (signal.aborted) throw new Error('Note edit cancelled')
    const change: NoteChatChange = { id: randomUUID(), conversationId, workspacePath: root, reason: args.reason, createdAt: new Date().toISOString(), files }
    await saveChange(change)
    if (signal.aborted) throw new Error('Note edit cancelled')
    const result = await this.service.applyBundleChangeSet(root, { id: change.id, revision: 1,
      source: { type: 'chat', id: conversationId, revision: 1 }, operations: ops }, args.reason)
    change.txId = result.txId
    // The committed transaction remains authoritative if saving the convenience reference fails.
    await saveChange(change).catch(() => undefined)
    return change
  }
}

export const NOTE_CHAT_TOOLS = [
  { name: 'note.focus', actionRisk: 'read', description: 'Highlight existing Notes without changing the working scope or the user selection. Use explicit focus only when the user asks to locate/show Notes; ordinary background reads never move the canvas. No execution is started.', inputSchema: NOTE_FOCUS_SCHEMA },
  { name: 'note.scope', actionRisk: 'read', description: 'Set the current multi-Note working scope. Find and read relevant Notes first. Give each a target/reference/dependency role and a reason. Reference and dependency Notes are not edit or execution targets. User pins and removals take precedence. Auto focus only when entering a new primary target.', inputSchema: NOTE_FOCUS_SCHEMA },
  { name: 'note.list', actionRisk: 'read', description: 'Find project Notes by title or content. Optional relatedTo Note URI returns explicit relations and Markdown mentions in either direction, preserving their types and unresolved references. No manual canvas selection is needed.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, relatedTo: { type: 'string' } }, additionalProperties: false } },
  { name: 'note.read', actionRisk: 'read', description: 'Read the complete Note source and its expectedHash. Required before updating that Note.', inputSchema: { type: 'object', properties: { uri: { type: 'string' } }, required: ['uri'], additionalProperties: false } },
  { name: 'note.write', actionRisk: 'write', description: 'Apply requested Note changes directly in one transaction. Only use for explicit user change instructions, never analysis. Create with kind/title/sections; update with uri/expectedHash and changed title/sections/tags/parent/lifecycle. Preserve unrelated sections. No execution metadata, code writes, or task completion claims.',
    inputSchema: { type: 'object', properties: { reason: { type: 'string' }, operations: { type: 'array', items: { type: 'object', properties: {
      type: { type: 'string', enum: ['create', 'update'] }, uri: { type: 'string' }, expectedHash: { type: 'string' }, kind: { type: 'string', enum: ['idea', 'initiative', 'requirement', 'decision', 'task'] }, title: { type: 'string' },
      sections: { type: 'object', additionalProperties: { type: 'string' } }, tags: { type: 'array', items: { type: 'string' } }, parent: { type: ['string', 'null'] }, lifecycle: { type: 'string', enum: ['draft', 'proposed', 'accepted', 'archived', 'rejected'] },
    }, required: ['type'], additionalProperties: false } } }, required: ['reason', 'operations'], additionalProperties: false } },
] as ToolDefinition[]

/** Per-turn host port: only Note tools bypass generic workspace write approval. */
export function attachNoteChatTools(ports: ChatTurnPorts, options: {
  conversationId: string; userText: string; signal: AbortSignal
  resources: Array<{ agentSessionId: string; workspaceId: string; workspacePath: string }>
  onChange: (change: NoteChatChange) => void
  onFocus?: (event: NoteFocusEvent) => void
}) {
  const original = ports.tools
  const editor = new NoteChatEditor()
  const authorized = hasNoteMutationIntent(options.userText)
  // Successful Note access remains visible even when the model omits a display tool.
  const accessed = new Map<string, { uri: string; title: string; role: 'target' | 'reference'; reason: string }>()
  let explicitScope = false
  const highlight = (root: string, notes: Array<{ uri: string; title: string }>, role: 'target' | 'reference') => {
    if (!options.onFocus || explicitScope || options.signal.aborted) return
    const reason = role === 'target' ? 'Updated in this conversation' : 'Read for this conversation'
    for (const note of notes) {
      const key = `${rootKey(root)}:${note.uri}`
      const previous = accessed.get(key)
      accessed.set(key, { ...note, role: previous?.role === 'target' ? 'target' : role, reason: previous?.role === 'target' ? previous.reason : reason })
    }
    const visible = [...accessed.entries()].filter(([key]) => key.startsWith(`${rootKey(root)}:note://`)).map(([, note]) => note).slice(-32)
    options.onFocus({ id: randomUUID(), conversationId: options.conversationId, workspacePath: root, mode: 'display', focus: 'none', reason, notes: visible })
  }
  const definitions = NOTE_CHAT_TOOLS.filter(tool => authorized || tool.actionRisk === 'read')
  ports.tools = {
    registry: { list: () => [...original.registry.list(), ...definitions],
      listManifests: () => [...(original.registry.listManifests?.() ?? createToolManifests(original.registry.list())), ...createToolManifests(definitions)] },
    executeFunctionCall: async (input, callerId): Promise<ToolResult> => {
      if (!input.call.toolName.startsWith('note.')) return original.executeFunctionCall(input, callerId)
      const startedAt = new Date().toISOString()
      const correlationId = input.call.correlationId ?? randomUUID()
      const resource = options.resources.find(item => item.agentSessionId === input.sessionId)
      const result = { workspaceId: resource?.workspaceId ?? '', sessionId: input.sessionId, correlationId, toolName: input.call.toolName, startedAt }
      try {
        const live = ports.sessions.getSession(input.sessionId)
        if (!resource || !live || live.status !== 'running' || live.workspaceId !== resource.workspaceId || live.workspaceRoot !== resource.workspacePath) throw new Error('PERMISSION_DENIED: Note workspace session unavailable')
        if (options.signal.aborted) throw new Error('Note operation cancelled')
        let output: unknown
        if (input.call.toolName === 'note.list') output = await editor.list(resource.workspacePath, z.string().max(1000).parse(input.call.input.query ?? ''), z.string().regex(NOTE_URI_RE).optional().parse(input.call.input.relatedTo))
        else if (input.call.toolName === 'note.read') {
          const read = await editor.read(resource.workspacePath, z.string().parse(input.call.input.uri))
          output = read
          highlight(resource.workspacePath, [{ uri: read.uri, title: /^#\s+(.+)$/m.exec(read.markdown)?.[1] ?? read.uri }], 'reference')
        }
        else if (input.call.toolName === 'note.focus' || input.call.toolName === 'note.scope') {
          const { workspaceId: _workspaceId, ...args } = input.call.input
          const event = await resolveNoteFocus(harnessNoteService, resource.workspacePath, options.conversationId, input.call.toolName === 'note.scope' ? 'scope' : 'display', args, options.userText)
          if (options.signal.aborted) throw new Error('Note operation cancelled')
          explicitScope = true
          options.onFocus?.(event)
          output = { status: 'validated', notes: event.notes, message: 'Display requested. Hidden or unavailable canvas nodes are reported by the UI; this does not edit or execute Notes.' }
        } else if (input.call.toolName === 'note.write') {
          const { workspaceId: _workspaceId, ...args } = input.call.input
          const change = await editor.write(resource.workspacePath, options.conversationId, correlationId, args, authorized, options.signal)
          if (change) {
            options.onChange(change)
            highlight(resource.workspacePath, change.files, 'target')
          }
          output = change ? { status: 'applied', id: change.id, txId: change.txId, files: change.files.map(({ uri, title }) => ({ uri, title })) } : { status: 'unchanged' }
        } else throw new Error('Unknown Note tool')
        return { ...result, status: 'completed', completedAt: new Date().toISOString(), durationMs: Date.now() - Date.parse(startedAt), summary: 'Note operation completed', output }
      } catch (error) { return { ...result, status: 'failed', completedAt: new Date().toISOString(), durationMs: Date.now() - Date.parse(startedAt), summary: fail(error), error: fail(error) } }
    },
  }
}
