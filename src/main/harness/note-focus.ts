// Note: validated visual scope is separate from edit and execution authority — see .agents/notes/2026-10-02-blueprint-conversation-development--3efc89cf.md
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

export async function resolveNoteFocus(service: HarnessNoteService, root: string, conversationId: string, mode: NoteFocusEvent['mode'], input: unknown, userText: string): Promise<NoteFocusEvent> {
  const args = inputSchema.parse(input)
  if (new Set(args.notes.map(note => note.uri)).size !== args.notes.length) throw new Error('Duplicate Note in visual scope')
  await service.readSnapshot(root)
  const notes = []
  for (const item of args.notes) {
    const read = await service.readNote(root, item.uri)
    notes.push({ ...item, title: /^#\s+(.+)$/m.exec(read.raw)?.[1] ?? item.uri })
  }
  const explicit = /定位|聚焦|高亮|显示.*节点|选中|\b(?:locate|focus|highlight|show)\b/i.test(userText)
  return { id: randomUUID(), conversationId, workspacePath: root, mode, reason: args.reason, notes,
    focus: args.focus === 'explicit' && !explicit ? 'auto' : args.focus }
}

export const NOTE_FOCUS_SCHEMA = { type: 'object', properties: {
  reason: { type: 'string' }, focus: { type: 'string', enum: ['auto', 'explicit', 'none'] },
  notes: { type: 'array', items: { type: 'object', properties: { uri: { type: 'string' }, role: { type: 'string', enum: ['target', 'reference', 'dependency'] }, reason: { type: 'string' } }, required: ['uri', 'role', 'reason'], additionalProperties: false } },
}, required: ['reason', 'notes'], additionalProperties: false }
