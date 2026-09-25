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
import type { NoteReadSnapshot } from '../../shared/notes'

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
  snapshot: NoteReadSnapshot
  entries: LoadedNoteEntry[]
  invalid: Array<{ relPath: string; classification?: string; diagnostics: Diagnostic[] }>
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
    acs: note.acs.map((ac) => ({ ...ac })),
    relations: relations.map((r) => ({ ...r })),
    metadata: structuredClone(note.meta),
    unknownFields: structuredClone(note.unknownFields),
    body: note.body,
  }
}

// Note: every scanned file remains visible — see .agents/notes/2026-09-25-note-blueprint-r2-read--fa17e06b.md
export function toReadSnapshot(index: NoteIndex): NoteReadSnapshot {
  return {
    repoId: index.repoId,
    coverage: index.coverage,
    entries: index.entries.map((entry) => ({
      ...(entry.note && index.repoId ? { uri: `note://${index.repoId}/${entry.note.meta.id}` } : {}),
      relPath: entry.relPath,
      sourceHash: entry.sourceHash,
      classification: entry.classification,
      ...(entry.note ? { doc: toNoteDoc(entry.note) } : {}),
      ...(entry.view ? { view: entry.view } : {}),
      diagnostics: entry.diagnostics,
    })),
    relations: index.relations,
    mentions: index.mentions,
    diagnostics: [...index.diagnostics, ...index.readDiagnostics],
  }
}

/**
 * Lists one root's notes: valid entries convert to documents, broken harness
 * files and unmanaged assets remain classified in the shared read snapshot.
 */
export async function loadNoteEntries(root: string): Promise<LoadedNotes> {
  const index = await withAssetLock(root, () => buildNoteIndex(root))
  const entries: LoadedNoteEntry[] = []
  const invalid: LoadedNotes['invalid'] = index.diagnostics.map((problem) => ({
    relPath: problem.path ?? '.agents/harness.json',
    diagnostics: [problem],
  }))
  for (const e of index.entries) {
    if (e.note && e.classification === 'valid') {
      entries.push({ doc: toNoteDoc(e.note), raw: e.note, relPath: e.relPath, sha256: e.sha256 })
      continue
    }
    invalid.push({ relPath: e.relPath, classification: e.classification, diagnostics: e.diagnostics.length ? e.diagnostics : [{ code: 'NOT_READY', message: `Note classification: ${e.classification}` }] })
  }
  const grouped = new Map<string, LoadedNotes['invalid'][number]>()
  for (const item of invalid) {
    const previous = grouped.get(item.relPath)
    grouped.set(item.relPath, { ...previous, ...item, diagnostics: [...new Map([...(previous?.diagnostics ?? []), ...item.diagnostics].map((d) => [JSON.stringify(d), d])).values()] })
  }
  return { repoId: index.repoId, index, snapshot: toReadSnapshot(index), entries, invalid: [...grouped.values()] }
}
