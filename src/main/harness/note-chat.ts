import { z } from 'zod'
import { NOTE_URI_RE } from '@janus-agent/harness-core'
import { NOTE_TOOL_DEFINITIONS } from '@janus-agent/node-hosts'
// Note: Janus extends the shared agentX runtime — see .agents/notes/2026-10-04-agentx-harness-inheritance--bd7fd0c6.md
import { randomUUID } from 'node:crypto'
import { resolve, relative } from 'node:path'
import { createToolManifests, type ToolDefinition, type ToolResult } from '@janus-agent/agent-core'
import type { ChatTurnPorts } from '@janus-agent/janus-agent'
import { NoteChatEditor, hasNoteMutationIntent } from '@janus-agent/harness-node'
export { NoteChatEditor, hasNoteMutationIntent, listNoteChatChanges } from '@janus-agent/harness-node'
import { harnessNoteService } from './service'
import { NOTE_FOCUS_SCHEMA, resolveNoteFocus } from './note-focus'
import type { NoteChatChange, NoteFocusEvent } from '../../shared/note-chat'
const rootKey = (root: string) => process.platform === 'win32' ? resolve(root).toLowerCase() : resolve(root)
const fail = (error: unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error)

export const NOTE_CHAT_TOOLS = [
  { name: 'note.focus', actionRisk: 'read', description: 'Highlight existing Notes without changing the working scope or the user selection. Use explicit focus only when the user asks to locate/show Notes; ordinary background reads never move the canvas. No execution is started.', inputSchema: NOTE_FOCUS_SCHEMA },
  { name: 'note.scope', actionRisk: 'read', description: 'Set the current multi-Note working scope. Find and read relevant Notes first. Give each a target/reference/dependency role and a reason. Reference and dependency Notes are not edit or execution targets. User pins and removals take precedence. Auto focus only when entering a new primary target.', inputSchema: NOTE_FOCUS_SCHEMA },
  ...NOTE_TOOL_DEFINITIONS,
] as ToolDefinition[]

/** Per-turn host port: only Note tools bypass generic workspace write approval. */
export function attachNoteChatTools(ports: ChatTurnPorts, options: {
  conversationId: string; userText: string; signal: AbortSignal
  resources: Array<{ agentSessionId: string; workspaceId: string; workspacePath: string }>
  onChange: (change: NoteChatChange) => void
  onFocus?: (event: NoteFocusEvent) => void
}) {
  const original = ports.tools
  const editor = new NoteChatEditor(harnessNoteService)
  const authorized = hasNoteMutationIntent(options.userText)
  // Successful Note access remains visible even when the model omits a display tool.
  const accessed = new Map<string, { uri: string; title: string; role: 'target' | 'reference'; reason: string }>()
  const highlight = (root: string, notes: Array<{ uri: string; title: string }>, role: 'target' | 'reference') => {
    if (!options.onFocus || options.signal.aborted) return
    const reason = role === 'target' ? 'Updated in this conversation' : 'Read for this conversation'
    for (const note of notes) {
      const key = `${rootKey(root)}:${note.uri}`
      const previous = accessed.get(key)
      accessed.set(key, { ...note, role: previous?.role === 'target' ? 'target' : role, reason: previous?.role === 'target' ? previous.reason : reason })
    }
    const visible = [...accessed.entries()].filter(([key]) => key.startsWith(`${rootKey(root)}:note://`)).map(([, note]) => note).slice(-32)
    options.onFocus({ id: randomUUID(), conversationId: options.conversationId, workspacePath: root, mode: 'access', focus: 'none', reason, notes: visible })
  }
  const isSharedNoteTool = (name: string) => NOTE_TOOL_DEFINITIONS.some(tool => tool.name === name)
  const definitions = NOTE_CHAT_TOOLS.filter(tool => authorized || tool.actionRisk === 'read')
  ports.tools = {
    registry: { list: () => [...original.registry.list().filter(tool => !isSharedNoteTool(tool.name)), ...definitions],
      listManifests: () => [...(original.registry.listManifests?.() ?? createToolManifests(original.registry.list())).filter(tool => !isSharedNoteTool(tool.canonicalName)), ...createToolManifests(definitions)] },
    executeFunctionCall: async (input, callerId): Promise<ToolResult> => {
      // Isolated WorkflowX children use the shared runtime policy and their own session.
      if (!options.resources.some(item => item.agentSessionId === input.sessionId)) {
        return original.executeFunctionCall(input, callerId)
      }
      if (!NOTE_CHAT_TOOLS.some(tool => tool.name === input.call.toolName)) {
        const result = await original.executeFunctionCall(input, callerId)
        if (input.call.toolName !== 'workspace.read' || result.status !== 'completed' || options.signal.aborted) return result
        const resource = options.resources.find(item => item.agentSessionId === input.sessionId)
        const output = result.output as { path?: string; content?: string; sha256?: string; truncated?: boolean } | undefined
        if (!resource || typeof output?.path !== 'string') return result
        const outputPath = output.path
        try {
          const path = relative(resource.workspacePath, resolve(resource.workspacePath, outputPath)).replace(/\\/g, '/')
          if (!path.startsWith('.agents/notes/') || !path.endsWith('.md')) return result
          const snapshot = await harnessNoteService.readSnapshot(resource.workspacePath)
          const entry = snapshot.entries.find(item => item.relPath.replace(/\\/g, '/') === path && item.doc)
          if (!entry) return result
          if (!entry.uri) return result
          const read = await editor.read(resource.workspacePath, entry.uri)
          highlight(resource.workspacePath, [{ uri: read.uri, title: entry.doc!.title }], 'reference')
          return { ...result, output: { ...output, uri: read.uri, expectedHash: output.sha256 ?? read.expectedHash, workspacePath: resource.workspacePath,
            stale: output.sha256 !== read.expectedHash,
            markdown: `Workspace read excerpt (re-read with note_read for complete source):\n${output.content ?? ''}` } }
        } catch { return result } // A display lookup must not turn a successful file read into failure.
      }
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
          const read = await editor.readPage(resource.workspacePath, z.string().parse(input.call.input.uri), input.call.input)
          output = read
          highlight(resource.workspacePath, [{ uri: read.uri, title: read.title }], 'reference')
        }
        else if (input.call.toolName === 'note.focus' || input.call.toolName === 'note.scope') {
          const { workspaceId: _workspaceId, ...args } = input.call.input
          const event = await resolveNoteFocus(harnessNoteService, resource.workspacePath, options.conversationId, input.call.toolName === 'note.scope' ? 'scope' : 'display', args, options.userText)
          if (options.signal.aborted) throw new Error('Note operation cancelled')
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
