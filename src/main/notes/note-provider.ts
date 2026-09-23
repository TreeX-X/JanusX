/**
 * @file Note file provider (V2 readonly refactor)
 * @description The only module on the blueprint read path allowed to touch
 *  note files (via harness-node index + harness-core parse). Execution lanes
 *  (receipts, runs, tasks, share import) keep their direct harness imports;
 *  this boundary covers listing/parsing for projection only.
 *  See .agents/notes/proposed/architecture/2026-09-22-blueprint-note-graph-readonly.md
 */
import type { Diagnostic, ParsedNote } from '@janus-agent/harness-core'
import { buildNoteIndex, withAssetLock, type NoteIndex } from '@janus-agent/harness-node'
import type { NoteDoc } from './note-types'

export interface LoadedNoteEntry {
  doc: NoteDoc
  /** Parsed bytes for execution-lane overlays (receipts); projection uses `doc`. */
  raw: ParsedNote
  relPath: string
  sha256: string
}

export interface LoadedNotes {
  repoId: string | null
  /** Index retained so callers keep their revision cache without re-scanning. */
  index: NoteIndex
  entries: LoadedNoteEntry[]
  invalid: Array<{ relPath: string; diagnostics: Diagnostic[] }>
}

/** Boundary conversion: parsed representation -> structural document. */
export function toNoteDoc(note: ParsedNote): NoteDoc {
  const meta = note.meta as unknown as Record<string, unknown>
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
  const tags = Array.isArray(meta['tags']) ? (meta['tags'] as unknown[]).filter((t): t is string => typeof t === 'string') : []
  const relations = Array.isArray((note.meta as { relations?: unknown }).relations)
    ? ((note.meta as { relations: Array<{ type: string; target: string }> }).relations ?? [])
    : []
  return {
    id: note.meta.id,
    kind: str(meta['kind']) ?? 'idea',
    lifecycle: str(meta['lifecycle']) ?? 'draft',
    tags,
    parent: str(meta['parent']),
    created: str(meta['created']) ?? undefined,
    title: note.title,
    sections: note.sections.map((s) => ({ name: s.name, text: s.text })),
    acs: note.acs.map((ac) => ({ id: ac.id, text: ac.text })),
    relations: relations.map((r) => ({ type: r.type, target: r.target })),
  }
}

/**
 * Lists one root's notes: valid entries convert to documents, broken harness
 * files land in `invalid`, foreign (non-harness) files are skipped silently.
 */
export async function loadNoteEntries(root: string): Promise<LoadedNotes> {
  const index = await withAssetLock(root, () => buildNoteIndex(root))
  const entries: LoadedNoteEntry[] = []
  const invalid: LoadedNotes['invalid'] = index.diagnostics.map((problem) => ({
    relPath: problem.path ?? '.agents/harness.json',
    diagnostics: [problem],
  }))
  for (const e of index.entries) {
    if (e.note && e.diagnostics.length === 0) {
      entries.push({ doc: toNoteDoc(e.note), raw: e.note, relPath: e.relPath, sha256: e.sha256 })
      continue
    }
    if (e.foreign) continue
    invalid.push({ relPath: e.relPath, diagnostics: e.diagnostics })
  }
  return { repoId: index.repoId, index, entries, invalid }
}
