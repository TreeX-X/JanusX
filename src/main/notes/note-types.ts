/**
 * @file Note boundary types (V2 readonly refactor)
 * @description Structural note vocabulary owned by `src/main/notes/`. Deliberately
 *  free of harness-core/harness-node imports (not even type-only): the adapter
 *  below must stay usable from a fixture upgrade that touches only
 *  `note-to-blueprint.ts` plus golden snapshots. `note-provider.ts` converts the
 *  parsed representation into these shapes at the boundary.
 *  See .agents/notes/proposed/architecture/2026-09-22-blueprint-note-graph-readonly.md
 */

/** Frontmatter schema claimed by harness notes. */
export const NOTE_SCHEMA_VERSION = 'harness-note/1'

/** NoteAdapter version surfaced as `projectView.adapterVersion`. */
export const ADAPTER_VERSION = 'v1'

export type NoteKind = 'idea' | 'initiative' | 'requirement' | 'decision' | 'task'

export interface NoteSection {
  name: string
  text: string
}

export interface NoteAc {
  id: string
  text: string
}

export interface NoteRelationRef {
  type: string
  target: string
}

/**
 * Structural note document. `kind`/`lifecycle` stay `string` on purpose:
 * unknown values must flow through and degrade in the adapter (to
 * `issue`/`planning`/`related-to` with prose preserved), never throw.
 */
export interface NoteDoc {
  id: string
  kind: string
  lifecycle: string
  tags: string[]
  parent: string | null
  created?: string
  title: string
  sections: NoteSection[]
  acs: NoteAc[]
  relations: NoteRelationRef[]
}

/** One adapter input: document plus file identity for sha-pinned reads. */
export interface NoteGraphEntry {
  doc: NoteDoc
  relPath: string
  sha256: string
}

/** One workspace projection input: exactly one repo root. */
export interface NoteGraph {
  repoId: string | null
  repoName: string
  entries: NoteGraphEntry[]
  revision: number
}
