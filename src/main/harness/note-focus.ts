// Note: validated UI intent does not grant edit or execution authority — see .agents/notes/blueprint/navigation/requirements/module-focus-navigation.md
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { NOTE_URI_RE } from '@janus-agent/harness-core'
import type { NoteFocusEvent } from '../../shared/note-chat'
import type { HarnessNoteService } from './service'

const inputSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  focus: z.enum(['auto', 'explicit', 'none']).default('auto'),
  notes: z.array(z.object({ uri: z.string().regex(NOTE_URI_RE), role: z.enum(['target', 'reference', 'dependency']), reason: z.string().trim().min(1).max(500) }).strict()).max(32),
}).strict()
const displaySchema = inputSchema.extend({ action: z.enum(['preview', 'enter', 'locate']).optional() }).strict()

export async function resolveNoteFocus(service: HarnessNoteService, root: string, conversationId: string, mode: NoteFocusEvent['mode'], input: unknown, userText: string): Promise<NoteFocusEvent> {
  const args: z.infer<typeof displaySchema> = (mode === 'display' ? displaySchema : inputSchema).parse(input)
  const action = args.action
  if (new Set(args.notes.map(note => note.uri)).size !== args.notes.length) throw new Error('Duplicate Note in visual scope')
  const snapshot = await service.readSnapshot(root)
  const notes = []
  const primary = args.notes.find(note => note.role === 'target') ?? args.notes[0]
  for (const item of args.notes) {
    const read = await service.readNote(root, item.uri)
    if (action === 'enter' && item.uri === primary?.uri) {
      const doc = snapshot.entries.find(entry => entry.uri === item.uri)?.doc
      const module = doc?.kind === 'module' && doc.moduleState !== 'retired' && !['rejected', 'archived'].includes(doc.lifecycle)
        || doc?.kind === 'initiative' && doc.lifecycle === 'accepted' && !doc.tags.includes('architecture:example')
          && doc.tags.filter(tag => tag === 'architecture:module' || tag === 'architecture:project').length === 1
      if (!module) throw new Error('INVALID_TARGET: enter requires a current module')
    }
    notes.push({ ...item, title: /^#\s+(.+)$/m.exec(read.raw)?.[1] ?? item.uri })
  }
  if (action === 'enter' && !primary) throw new Error('INVALID_TARGET: enter requires a module')
  const explicit = /定位|聚焦|高亮|显示|选中|预览|进入|打开|查看|\b(?:locate|focus|highlight|show|preview|enter|open)\b/i.test(userText)
  return { id: randomUUID(), conversationId, workspacePath: root, mode, reason: args.reason, notes,
    ...(mode === 'display' ? { action: action ?? 'locate' } : {}),
    focus: mode === 'display' && explicit && args.focus !== 'none' && (args.focus === 'explicit' || action) ? 'explicit' : 'none' }
}

export const NOTE_SCOPE_SCHEMA = { type: 'object', properties: {
  reason: { type: 'string' }, focus: { type: 'string', enum: ['auto', 'explicit', 'none'] },
  notes: { type: 'array', items: { type: 'object', properties: { uri: { type: 'string' }, role: { type: 'string', enum: ['target', 'reference', 'dependency'] }, reason: { type: 'string' } }, required: ['uri', 'role', 'reason'], additionalProperties: false } },
}, required: ['reason', 'notes'], additionalProperties: false }
export const NOTE_FOCUS_SCHEMA = { ...NOTE_SCOPE_SCHEMA, properties: { ...NOTE_SCOPE_SCHEMA.properties,
  action: { type: 'string', enum: ['preview', 'enter', 'locate'], description: 'preview reads the Note without leaving its visible page; enter opens a module page; locate reveals a Note with its module parent. Defaults to locate.' },
} }
