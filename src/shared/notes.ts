// Note: shared reads retain source identity before UI projection — see .agents/notes/2026-09-25-note-blueprint-r2-read--fa17e06b.md
import type { Diagnostic, HarnessNoteMeta, MarkdownView } from '@janus-agent/harness-core'
import type { IndexedMention, IndexedRelation, IndexEntry, NoteCoverage } from '@janus-agent/harness-node'

/** Serializable source vocabulary. Type imports do not ship a parser to the UI. */
export interface NoteDoc {
  id: string
  kind: string
  lifecycle: string
  tags: string[]
  parent: string | null
  created?: string
  title: string
  sections: Array<{ name: string; text: string }>
  acs: Array<{ id: string; text: string; checked?: boolean }>
  relations: Array<{ type: string; target: string; criteria?: string[]; scope?: 'full' | 'partial'; reason?: string }>
  /** Full source metadata/body, present for every provider-produced document. */
  metadata?: HarnessNoteMeta
  unknownFields?: Record<string, unknown>
  body?: string
}

export interface NoteReadEntry {
  uri?: string
  relPath: string
  sourceHash: string | null
  classification: IndexEntry['classification']
  doc?: NoteDoc
  view?: MarkdownView
  diagnostics: Diagnostic[]
}

/** Fresh source bytes and the shared Markdown model, scoped to one checkout. */
export interface NoteSourceRead {
  uri: string
  relPath: string
  raw: string
  sourceHash: string
  indexedSourceHash: string | null
  matchesSnapshot: boolean
  doc: NoteDoc
  view: MarkdownView
}

/** One disposable read snapshot for one explicitly selected checkout. */
export interface NoteReadSnapshot {
  repoId: string | null
  coverage: NoteCoverage
  entries: NoteReadEntry[]
  relations: IndexedRelation[]
  mentions: IndexedMention[]
  diagnostics: Diagnostic[]
}
