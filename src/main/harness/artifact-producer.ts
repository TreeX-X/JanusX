/**
 * @file Harness artifact merge engine + op factories (S4, pure)
 * @description V2 readonly refactor: every mapping table (kind->type,
 *  lifecycle->status, kind->sections, patch translation) moved to NoteAdapter
 *  v1 (`src/main/notes/note-to-blueprint.ts`). What stays here is the merge
 *  engine (section slicing, round-trip guard) and the op factories used by
 *  Agent write flows. Mapping names are re-exported as deprecated shims.
 *  No filesystem, no Electron.
 *  See .agents/notes/proposed/architecture/2026-09-22-blueprint-note-graph-readonly.md
 */
import { randomUUID } from 'crypto'
import {
  parseNote,
  serializeNote,
  splitFrontmatter,
  validateNote,
  type ParsedNote,
} from '@janus-agent/harness-core'
import { KIND_SECTIONS, type NoteEdit, type NoteKind } from '../notes/note-to-blueprint'

/** @deprecated Import mapping tables from NoteAdapter v1 instead. */
export {
  applyNodePatch,
  checkWritablePatch,
  mapStatusToLifecycle,
  nodeTypeToKind,
  type NodeFieldPatch,
} from '../notes/note-to-blueprint'

/** @deprecated `NoteKind` now lives in `src/main/notes/note-types.ts`. */
export type { NoteKind } from '../notes/note-to-blueprint'

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

export type { NoteEdit }
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
