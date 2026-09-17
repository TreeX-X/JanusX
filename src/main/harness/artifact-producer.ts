/**
 * @file Harness artifact producer for canvas edits (S4, pure)
 * @description Translates UI-level node edits into NoteChangeSet operations.
 *  Field-to-note mapping is explicit and lossy by design: title goes to H1,
 *  prose fields go to kind-appropriate sections, lifecycle follows status.
 *  Feature/todo/issue/analysis arrays are NOT writable here; those flows
 *  arrive with maintenance and execution (S6/S8) and report HARNESS_MANAGED.
 *  No filesystem, no Electron.
 */
import { randomUUID } from 'crypto'
import type { BlueprintNodeType } from '../../shared/janus/types'
import {
  parseNote,
  serializeNote,
  splitFrontmatter,
  validateNote,
  type ParsedNote,
} from '@janus-agent/harness-core'

export type NoteKind = 'idea' | 'initiative' | 'requirement' | 'decision' | 'task'

export function nodeTypeToKind(type: BlueprintNodeType, preferred?: NoteKind): NoteKind {
  if (preferred) return preferred
  switch (type) {
    case 'task':
      return 'task'
    case 'feature':
      return 'requirement'
    case 'issue':
      return 'requirement'
    case 'epic':
    default:
      return 'initiative'
  }
}

export interface ProducedOp {
  operationId: string
  type: 'create' | 'replace' | 'delete'
  uri: string
  expectedHash: string | null
  relativePath?: string
  afterMarkdown?: string
  dependsOn: string[]
  reason: string
  evidenceRefs: string[]
}

const KIND_SECTIONS: Record<NoteKind, string[]> = {
  idea: ['Background', 'Idea', 'Open questions'],
  initiative: ['Goal', 'Scope', 'Acceptance criteria'],
  requirement: ['Problem', 'Expected behavior', 'Scope', 'Acceptance criteria'],
  decision: ['Problem', 'Proposal', 'Alternatives considered', 'Risks'],
  task: ['Scope', 'Acceptance criteria', 'Verification'],
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function frontmatter(lines: Record<string, string | string[] | undefined>): string {
  const out: string[] = []
  for (const [key, value] of Object.entries(lines)) {
    if (value === undefined) continue
    if (Array.isArray(value)) out.push(`${key}: [${value.join(', ')}]`)
    else out.push(`${key}: ${value}`)
  }
  return out.join('\n')
}

/** Fresh draft skeletons; the editor fills sections through replace ops. */
export function createNoteInput(kind: NoteKind, title: string, parentUri: string | null): { id: string; markdown: string } {
  const id = randomUUID()
  const sections = KIND_SECTIONS[kind].map((name) => `## ${name}\n\n${name === 'Open questions' ? 'None.' : 'TBD.'}`).join('\n\n')
  const fm: Record<string, string | string[] | undefined> = {
    schema: 'harness-note/1',
    id,
    kind,
    lifecycle: 'draft',
    created: today(),
  }
  if (parentUri) fm['parent'] = parentUri
  return { id, markdown: `---\n${frontmatter(fm)}\n---\n\n# ${title}\n\n${sections}\n` }
}

export function createNoteOp(repoId: string, kind: NoteKind, title: string, parentUri: string | null, reason: string): ProducedOp & { noteId: string } {
  const { id, markdown } = createNoteInput(kind, title, parentUri)
  return {
    operationId: `create-${id.slice(0, 8)}`,
    type: 'create',
    uri: `note://${repoId}/${id}`,
    expectedHash: null,
    afterMarkdown: markdown,
    dependsOn: [],
    reason,
    evidenceRefs: [],
    noteId: id,
  }
}

export interface NodeFieldPatch {
  title?: string
  description?: string
  positioning?: string
  techSolution?: string
  notes?: string
  status?: string
  tags?: string[]
  parentUri?: string | null
}

const MANAGED_ARRAYS = ['features', 'todos', 'issues', 'analyses', 'children'] as const

/** Rejects maintenance-owned arrays with HARNESS_MANAGED; maps the rest. */
export function checkWritablePatch(patch: Record<string, unknown>): { code: string; message: string } | null {
  for (const key of MANAGED_ARRAYS) {
    const value = patch[key]
    if (Array.isArray(value) && value.length > 0) {
      return { code: 'HARNESS_MANAGED', message: `${key} on project notes is managed by maintenance/execution flows` }
    }
  }
  return null
}

/** Line-based section replace used by the service merger (hash-stable slicing). */
export function setSection(body: string, name: string, text: string): string {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let cur: string | null = null
  let buf: string[] = []
  let fence = false
  const flush = (): void => {
    if (cur === null) return
    if (cur === name) out.push(`## ${name}`, '', text, '')
    else out.push(`## ${cur}`, '', ...buf)
    cur = null
    buf = []
  }
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      fence = !fence
      if (cur !== null) buf.push(line)
      else out.push(line)
      continue
    }
    if (!fence) {
      const h2 = /^##\s+(.+)$/.exec(line)
      if (h2) {
        flush()
        cur = h2[1].trim()
        continue
      }
      if (/^#\s+/.test(line)) {
        flush()
        out.push(line, '')
        continue
      }
    }
    if (cur !== null) buf.push(line)
    else out.push(line)
  }
  flush()
  if (!body.split('\n').some((l) => /^##\s+/.test(l) && l.trim() === `## ${name}`)) {
    out.push(`## ${name}`, '', text, '')
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

export interface NoteEdit {
  title?: string
  sections: Record<string, string>
  frontmatter: { tags?: string[]; parent?: string | null; lifecycle?: string }
}

/** Merge a structured edit onto parsed note bytes (frontmatter via data, prose via slices). */
export function mergeNoteEdit(note: ParsedNote, rawText: string, edit: NoteEdit, reason?: string): string {
  const meta = { ...(note.meta as unknown as Record<string, unknown>) } as Record<string, unknown> & ParsedNote['meta']
  if (edit.frontmatter.tags !== undefined) meta.tags = [...edit.frontmatter.tags]
  if (edit.frontmatter.parent !== undefined) {
    if (edit.frontmatter.parent === null) delete (meta as Record<string, unknown>)['parent']
    else meta.parent = edit.frontmatter.parent
  }
  if (edit.frontmatter.lifecycle !== undefined) {
    meta.lifecycle = edit.frontmatter.lifecycle as ParsedNote['meta']['lifecycle']
    if ((edit.frontmatter.lifecycle === 'archived' || edit.frontmatter.lifecycle === 'rejected') && meta.disposition === undefined) {
      meta.disposition = { reason: reason ?? 'updated from canvas' }
    }
    if (edit.frontmatter.lifecycle !== 'archived' && edit.frontmatter.lifecycle !== 'rejected') {
      delete (meta as Record<string, unknown>)['disposition']
    }
  }
  let body = splitFrontmatter(rawText).body
  if (edit.title !== undefined) {
    body = body.replace(/^#\s+.*$/m, `# ${edit.title}`)
    if (!/^#\s+/m.test(body)) body = `# ${edit.title}\n\n${body}`
  }
  for (const [name, text] of Object.entries(edit.sections)) {
    body = setSection(body, name, text)
  }
  const merged: ParsedNote = { ...note, meta: meta as ParsedNote['meta'], body }
  const out = serializeNote(merged)
  // Round-trip guard: the merger must never produce an invalid note.
  const reparsed = parseNote(out)
  const problems = validateNote(reparsed)
  if (problems.length > 0) {
    throw { code: 'SCHEMA_INVALID', message: problems[0].message, path: problems[0].path }
  }
  return out
}

/**
 * Translates a canvas field patch into a structured note edit. Frontmatter
 * writes (tags, parent, lifecycle) travel as data; the service merges them
 * and re-serializes through harness-core, preserving unknown fields.
 */
export function applyNodePatch(
  note: ParsedNote,
  patch: NodeFieldPatch,
): { edit: NoteEdit } | { code: string; message: string } {
  const kind = note.meta.kind as NoteKind
  const edit: NoteEdit = { sections: {}, frontmatter: {} }
  if (patch.title !== undefined) {
    if (!patch.title.trim()) return { code: 'SCHEMA_INVALID', message: 'title must not be empty' }
    edit.title = patch.title.trim()
  }
  const sectionFor: Record<string, string[]> = {
    description: kind === 'idea' ? ['Background'] : kind === 'initiative' ? ['Goal'] : ['Problem'],
    positioning: ['Background', 'Goal'],
    techSolution: kind === 'decision' ? ['Proposal', 'Decision'] : ['Scope'],
    notes: ['Open questions'],
  }
  for (const [field, names] of Object.entries(sectionFor)) {
    const value = patch[field as keyof NodeFieldPatch]
    if (typeof value === 'string') edit.sections[names[0]] = value
  }
  if (patch.tags !== undefined) edit.frontmatter.tags = [...patch.tags]
  if (patch.parentUri !== undefined) edit.frontmatter.parent = patch.parentUri
  if (patch.status !== undefined) {
    const mapped = mapStatusToLifecycle(kind, patch.status)
    if (!mapped.ok) return { code: mapped.code, message: mapped.message }
    edit.frontmatter.lifecycle = mapped.lifecycle
  }
  return { edit }
}

export function mapStatusToLifecycle(
  kind: NoteKind,
  status: string,
): { ok: true; lifecycle: string } | { ok: false; code: string; message: string } {
  if (status === 'archived') return { ok: true, lifecycle: 'archived' }
  if (status === 'done' && kind === 'task') {
    return { ok: false, code: 'HARNESS_MANAGED', message: 'task completion requires acceptance evidence (task flow)' }
  }
  switch (status) {
    case 'not-started':
    case 'planning':
      return { ok: true, lifecycle: 'draft' }
    case 'in-progress':
    case 'testing':
    case 'bug-fixing':
    case 'blocked':
    case 'paused':
    case 'done':
      return { ok: true, lifecycle: 'accepted' }
    default:
      return { ok: false, code: 'SCHEMA_INVALID', message: `unknown status ${status}` }
  }
}

/** Archive-by-default delete (C2): true removal needs explicit destructive scope (later). */
export function archiveNoteOp(
  uri: string,
  expectedHash: string,
  afterMarkdown: string,
  reason: string,
): ProducedOp {
  return {
    operationId: `archive-${uri.split('/').pop()?.slice(0, 8) ?? 'note'}`,
    type: 'replace',
    uri,
    expectedHash,
    afterMarkdown,
    dependsOn: [],
    reason,
    evidenceRefs: [],
  }
}
