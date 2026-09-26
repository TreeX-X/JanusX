/**
 * @file Incremental note-index patch (blueprint R7 perf)
 * @description Targeted alternative to a full `buildNoteIndex` rescan: re-read
 *  and re-parse only the files a watcher probe reports as changed, then
 *  rebuild the derived graph maps from the already-parsed entries. No disk
 *  reads beyond the changed files; the full YAML/mdast parse of the untouched
 *  corpus is skipped. Derived-map wiring mirrors
 *  `harness-node/repository.ts` `buildNoteIndex` tail using the same exported
 *  primitives (`resolveNoteReference`, `deriveMentions`, `checkAcyclic`); a
 *  unit test pins patch output equal to a fresh full build for sample
 *  mutations, so sibling-side algorithm changes surface as test failures.
 *  See .agents/notes/2026-09-26-note-graph-r7-perf--58f0e24f.md
 */
import { join, resolve } from 'path'
import {
  checkAcyclic,
  parseNote,
  readMarkdownView,
  validateNote,
  type Diagnostic,
  type ParsedNote,
  type RelationType,
} from '@janus-agent/harness-core'
import {
  claimsHarnessSchema,
  deriveMentions,
  listNoteFiles,
  noteUri,
  readHarnessIdentity,
  readNoteFile,
  resolveNoteReference,
  sha256HexBytes,
  type Backlink,
  type IndexEntry,
  type IndexedRelation,
  type NoteIndex,
  type WatchEvent,
} from '@janus-agent/harness-node'

function diag(code: Diagnostic['code'], message: string, path?: string): Diagnostic {
  return path === undefined ? { code, message } : { code, message, path }
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export interface ChangeProbe {
  changed: string[]
  removed: string[]
  /** Directory walk problems; a non-clean probe must fall back to full rescan. */
  scanDiagnostics: Diagnostic[]
  complete: boolean
}

/**
 * Hash-only probe: lists files and compares bytes against the cached index.
 * No YAML/mdast parsing. New files count as changed; vanished paths as removed.
 */
export async function probeChangedPaths(root: string, index: NoteIndex): Promise<ChangeProbe> {
  const { files, diagnostics, complete } = await listNoteFiles(root)
  const seen = new Set<string>()
  const changed: string[] = []
  const removed: string[] = []
  for (const f of files) {
    seen.add(f.relPath)
    const cached = index.byPath.get(f.relPath)
    if (!cached || cached.sourceHash === null) {
      changed.push(f.relPath)
      continue
    }
    let read: { sha256: string }
    try {
      read = await readNoteFile(f.absPath)
    } catch {
      changed.push(f.relPath)
      continue
    }
    if (read.sha256 !== cached.sourceHash) changed.push(f.relPath)
  }
  for (const entry of index.entries) {
    if (!seen.has(entry.relPath)) removed.push(entry.relPath)
  }
  changed.sort(compareText)
  removed.sort(compareText)
  return { changed, removed, scanDiagnostics: diagnostics, complete }
}

function classifyRead(absPath: string, relPath: string, text: string, sha256: string): IndexEntry {
  if (!claimsHarnessSchema(text)) {
    const view = readMarkdownView(text)
    const classification = view.headings.find((heading) => heading.depth === 1)?.text.startsWith('Agent Note:') ? 'legacy' : 'foreign'
    return { relPath, sha256, sourceHash: sha256, classification, view, diagnostics: [], foreign: true }
  }
  try {
    const note: ParsedNote = parseNote(text)
    const problems = validateNote(note)
    return { relPath, sha256, sourceHash: sha256, classification: problems.length ? 'malformed' : 'valid', note, view: readMarkdownView(note.body), diagnostics: problems }
  } catch (e) {
    const code = (e as { code?: Diagnostic['code'] }).code ?? 'SCHEMA_INVALID'
    return { relPath, sha256, sourceHash: sha256, classification: 'malformed', diagnostics: [diag(code, (e as Error).message, relPath)] }
  }
}

function watchEventFor(entry: IndexEntry): WatchEvent {
  if (entry.classification === 'valid' || entry.classification === 'legacy' || entry.classification === 'foreign') {
    return { type: 'upsert', relPath: entry.relPath, sha256: entry.sha256 }
  }
  if (entry.classification === 'unreadable') return { type: 'invalid', relPath: entry.relPath, diagnostics: entry.diagnostics }
  return { type: 'invalid', relPath: entry.relPath, diagnostics: entry.diagnostics.length ? entry.diagnostics : [diag('SCHEMA_INVALID', `Note classification: ${entry.classification}`, entry.relPath)] }
}

/**
 * Applies changed/removed paths onto a cached index. Returns a NEW index
 * object (the cached one is never mutated) plus per-file watch events.
 * Identity-collision and relation-derivation rules mirror a full build.
 */
export async function patchNoteIndex(
  root: string,
  previous: NoteIndex,
  changed: string[],
  removed: string[],
  scanDiagnostics: Diagnostic[] = [],
): Promise<{ index: NoteIndex; events: WatchEvent[] }> {
  const resolvedRoot = resolve(root)
  const removedSet = new Set(removed)
  const changedSet = new Set(changed)
  // Note: kept entries are cloned so conflict marking never mutates the
  // cached index the patch was derived from; repeated patches stay idempotent.
  const kept = previous.entries
    .filter((entry) => !removedSet.has(entry.relPath) && !changedSet.has(entry.relPath))
    .map((entry) => ({ ...entry, diagnostics: [...entry.diagnostics] }))
  const next: IndexEntry[] = [...kept]
  const events: WatchEvent[] = removed.map((relPath) => ({ type: 'remove', relPath }) as WatchEvent)
  for (const relPath of changed) {
    const absPath = join(resolvedRoot, relPath)
    let entry: IndexEntry
    try {
      const read = await readNoteFile(absPath)
      entry = classifyRead(absPath, relPath, read.text, read.sha256)
    } catch {
      entry = { relPath, sha256: '', sourceHash: null, classification: 'unreadable', diagnostics: [diag('IO_ERROR', `unreadable: ${relPath}`, relPath)] }
    }
    next.push(entry)
    events.push(watchEventFor(entry))
  }
  next.sort((a, b) => compareText(a.relPath, b.relPath))

  const byId = new Map<string, IndexEntry>()
  const byUri = new Map<string, IndexEntry>()
  const byPath = new Map(next.map((entry) => [entry.relPath, entry]))
  const conflicts = new Map<string, IndexEntry[]>()
  const diagnostics: Diagnostic[] = [...scanDiagnostics]
  const idGroups = new Map<string, IndexEntry[]>()
  const pathGroups = new Map<string, IndexEntry[]>()
  for (const entry of next) {
    const pathKey = entry.relPath.toLowerCase()
    pathGroups.set(pathKey, [...(pathGroups.get(pathKey) ?? []), entry])
    if (entry.note) {
      const id = entry.note.meta.id
      idGroups.set(id, [...(idGroups.get(id) ?? []), entry])
    }
  }
  const markConflict = (group: IndexEntry[], message: string): void => {
    for (const entry of group) {
      const problem = diag('SCHEMA_INVALID', message, entry.relPath)
      entry.classification = 'conflicting-identity'
      entry.diagnostics.push(problem)
      diagnostics.push(problem)
    }
  }
  for (const group of pathGroups.values()) {
    if (group.length > 1) markConflict(group, `case-colliding paths: ${group.map((e) => e.relPath).join(', ')}`)
  }
  const repoIdentity = await readHarnessIdentity(resolvedRoot)
  const repoId = repoIdentity.repoId
  diagnostics.push(...repoIdentity.diagnostics)
  for (const [id, group] of idGroups) {
    if (group.length > 1) markConflict(group, `duplicate note id ${id}: ${group.map((e) => e.relPath).join(', ')}`)
    if (group.some((entry) => entry.classification === 'conflicting-identity')) {
      conflicts.set(id, group)
      continue
    }
    const entry = group[0]
    byId.set(id, entry)
    if (repoId && entry.diagnostics.length === 0) byUri.set(noteUri(repoId, id), entry)
  }
  const outgoing = new Map<string, IndexedRelation[]>()
  const backlinks = new Map<string, Backlink[]>()
  const relations: IndexedRelation[] = []
  // Note: entry-relative coverage placeholder; the snapshot hash below is authoritative.
  const coverageDiagnostics: Diagnostic[] = [...scanDiagnostics, ...next.filter((entry) => entry.classification === 'unreadable').flatMap((entry) => entry.diagnostics)]
  const stubIndex = { repoId, entries: next, byId, byUri, byPath, conflicts, coverage: previous.coverage, outgoing, backlinks, relations, mentions: [], mentionBacklinks: new Map(), readDiagnostics: [], diagnostics } as NoteIndex
  for (const [sourceUri, e] of byUri) {
    const addRelation = (relation: { type: RelationType; target: string; criteria?: string[]; scope?: 'full' | 'partial'; reason?: string }, declaration: string): void => {
      const existing = (outgoing.get(sourceUri) ?? []).find((edge) => edge.type === relation.type && edge.targetUri === relation.target &&
        JSON.stringify(edge.criteria) === JSON.stringify(relation.criteria) && edge.scope === relation.scope && edge.reason === relation.reason)
      if (existing) { existing.declarations.push(declaration); return }
      const edge: IndexedRelation = {
        sourceUri,
        targetUri: relation.target,
        type: relation.type,
        declarations: [declaration],
        resolution: resolveNoteReference(stubIndex, relation.target),
        ...(relation.criteria ? { criteria: [...relation.criteria] } : {}),
        ...(relation.scope ? { scope: relation.scope } : {}),
        ...(relation.reason ? { reason: relation.reason } : {}),
      }
      relations.push(edge)
      const outgoingEdges = outgoing.get(sourceUri) ?? []
      outgoingEdges.push(edge)
      outgoing.set(sourceUri, outgoingEdges)
      const incoming = backlinks.get(edge.targetUri) ?? []
      incoming.push({
        sourceUri,
        type: edge.type,
        ...(edge.criteria ? { criteria: edge.criteria } : {}),
        ...(edge.scope ? { scope: edge.scope } : {}),
        ...(edge.reason ? { reason: edge.reason } : {}),
      })
      backlinks.set(edge.targetUri, incoming)
    }
    const meta = e.note!.meta
    if (meta.parent) addRelation({ type: 'parent', target: meta.parent }, 'parent')
    for (const [position, relation] of (meta.relations ?? []).entries()) addRelation(relation, `relations[${position}]`)
  }
  for (const incoming of backlinks.values()) incoming.sort((a, b) => compareText(a.sourceUri, b.sourceUri) || compareText(a.type, b.type))
  for (const edges of outgoing.values()) edges.sort((a, b) => compareText(a.targetUri, b.targetUri) || compareText(a.type, b.type))
  relations.sort((a, b) => compareText(a.sourceUri, b.sourceUri) || compareText(a.targetUri, b.targetUri) || compareText(a.type, b.type))
  const mentions = deriveMentions(stubIndex)
  const mentionBacklinks = new Map(stubIndex.mentionBacklinks)
  for (const mention of mentions) {
    if (!mention.targetUri || mention.resolution.status === 'invalid' || mention.resolution.status === 'ambiguous') continue
    const incoming = mentionBacklinks.get(mention.targetUri) ?? []
    incoming.push(mention)
    mentionBacklinks.set(mention.targetUri, incoming)
  }
  const readDiagnostics = [
    ...checkAcyclic([...byUri].map(([uri, entry]) => ({ uri, note: entry.note! }))),
    ...relations.flatMap((edge) => edge.resolution.diagnostics.map((problem) => ({ ...problem, path: edge.sourceUri }))),
    ...mentions.flatMap((mention) => mention.resolution.diagnostics.map((problem) => ({ ...problem, path: mention.sourceUri }))),
  ]
  const coverage = {
    checkoutRoot: resolve(root),
    status: coverageDiagnostics.length === 0 ? 'complete' as const : 'incomplete' as const,
    snapshotHash: sha256HexBytes(Buffer.from(JSON.stringify([resolve(root), repoId, repoIdentity.diagnostics, next.map((entry) => [entry.relPath, entry.sourceHash, entry.classification]), coverageDiagnostics]))),
    diagnostics: coverageDiagnostics,
  }
  const index: NoteIndex = { repoId, entries: next, byId, byUri, byPath, conflicts, coverage, outgoing, backlinks, relations, mentions, mentionBacklinks, readDiagnostics, diagnostics }
  return { index, events }
}
