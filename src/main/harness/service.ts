/**
 * @file Harness note service (S4)
 * @description The single managed gateway between JanusX and project note files.
 *  All project-note reads, edits, binds, and share exports flow through this
 *  service; no other main-process module touches `.agents/notes` directly.
 *  Legacy JSON blueprints keep their own lane (read + write) for old data;
 *  new project flows never write JSON. Electron-free: roots arrive from
 *  callers, change events leave through subscribed listeners (tests subscribe).
 *  See .agents/notes/implemented/architecture/2026-09-16-harness-project-graph-s4.md
 */
import { randomUUID } from 'crypto'
import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import { dirname, join, resolve } from 'path'
import {
  parseNote,
  validateReceiptShape,
  type Diagnostic,
  type ParsedNote,
} from '@janus-agent/harness-core'
import {
  applyChangeSet,
  buildNoteIndex,
  listTaskResults,
  proveRequirementCoverage,
  assertAssetPath,
  withAssetLock,
  readWorkspaceMap,
  sha256HexBytes,
  watchNotes,
  type NoteIndex,
  type WatchEvent,
} from '@janus-agent/harness-node'
import { projectGraph, projectGraphId, type ProjectedEntry } from './graph-projection'
import { mergeNoteEdit, type NoteEdit } from './artifact-producer'
import {
  assertNoLocalLeak,
  planShareImport,
  type IncomingSnapshot,
} from './share-import'
import type { Blueprint } from '../../shared/janus/types'

export { assertNoLocalLeak }

export interface ResolveResult {
  ok: boolean
  root?: string
  diagnostics: Diagnostic[]
}

export interface ProjectView {
  blueprint: Blueprint
  rev: number
  repoId: string | null
  repoName: string
  invalid: Array<{ relPath: string; diagnostics: Diagnostic[] }>
}

export interface ShareSelection {
  ids?: string[]
}

export interface ShareSnapshot {
  schema: 'harness-share/1'
  repoId: string | null
  repoName: string
  exportedAt: string
  notes: Array<{ id: string; uri: string | null; relPath: string; markdown: string; sha256: string }>
  repositories: Array<{ repoId: string | null; name: string }>
  unresolved: Array<{ from: string; target: string }>
  evidence: Array<{ id: string; json: string; sha256: string }>
}

export interface BindingRecord {
  repoId: string
  checkoutId: string
  path: string
  selected: boolean
}

export type ChangeListener = (event: { type: 'harness:changed'; root: string; rev: number; events: WatchEvent[] }) => void

/**
 * Own working notes share `.agents/notes/` with harness assets but belong to
 * a different namespace. Only files claiming `schema: harness-note/1` enter
 * the graph, coverage, execution, and share paths; everything else scans as
 * foreign-namespace and never surfaces as an invalid harness asset.
 */
// Note: own working notes stay outside the harness graph — see .agents/notes/implemented/architecture/2026-09-18-own-notes-namespace.md
export function claimsHarnessSchema(raw: string): boolean {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  const lines = text.split(/\r?\n/)
  if (lines.length < 2 || lines[0].trim() !== '---') return false
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() !== '---') continue
    for (let j = 1; j < i; j++) {
      const m = /^\s*schema\s*:\s*(['"]?)(.*?)\1\s*(?:#.*)?$/.exec(lines[j])
      if (m) return m[2].trim() === 'harness-note/1'
    }
    return false
  }
  return false
}

function diag(code: Diagnostic['code'], message: string, path?: string): Diagnostic {
  return path === undefined ? { code, message } : { code, message, path }
}

async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

export class HarnessNoteService {
  private indexes = new Map<string, { rev: number; index: NoteIndex }>()
  private watchers = new Map<string, { close: () => void }>()
  private listeners = new Set<ChangeListener>()

  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** A checkout root is a directory carrying `.agents/`. Nothing else qualifies. */
  async resolveRoot(cwd: string): Promise<ResolveResult> {
    const root = resolve(cwd)
    if (await isDir(join(root, '.agents'))) return { ok: true, root, diagnostics: [] }
    return { ok: false, diagnostics: [diag('NOT_FOUND', `no .agents here: ${root}`, root)] }
  }

  async rescan(root: string): Promise<{ rev: number; ms: number }> {
    const start = Date.now()
    const index = await withAssetLock(root, () => buildNoteIndex(root))
    const prev = this.indexes.get(root)?.rev ?? 0
    this.indexes.set(root, { rev: prev + 1, index })
    return { rev: prev + 1, ms: Date.now() - start }
  }

  private async cachedIndex(root: string): Promise<{ rev: number; index: NoteIndex }> {
    const hit = this.indexes.get(root)
    if (hit) return hit
    await this.rescan(root)
    return this.indexes.get(root) as { rev: number; index: NoteIndex }
  }

  async repoName(root: string): Promise<string> {
    try {
      const raw = await readFile(join(root, '.agents', 'harness.json'), 'utf8')
      const name = (JSON.parse(raw) as { name?: unknown }).name
      if (typeof name === 'string' && name.trim()) return name.trim()
    } catch {
      // Unnamed checkout: fall through to the stable default.
    }
    return 'Project'
  }

  async projectView(root: string): Promise<ProjectView> {
    const index = await withAssetLock(root, () => buildNoteIndex(root))
    const rev = this.indexes.get(root)?.rev ?? 0
    this.indexes.set(root, { rev, index })
    const entries: ProjectedEntry[] = []
    const invalid: ProjectView['invalid'] = []
    for (const e of index.entries) {
      if (e.note && e.diagnostics.length === 0) {
        entries.push({ note: e.note, relPath: e.relPath, sha256: e.sha256, diagnostics: [] })
        continue
      }
      // Foreign-namespace working notes never enter the invalid list; only
      // files claiming the harness schema keep INVALID diagnostics.
      if (e.note) {
        invalid.push({ relPath: e.relPath, diagnostics: e.diagnostics })
        continue
      }
      let raw: string | null = null
      try {
        raw = await readFile(join(root, e.relPath), 'utf8')
      } catch {
        raw = null
      }
      if (raw !== null && !claimsHarnessSchema(raw)) continue
      invalid.push({ relPath: e.relPath, diagnostics: e.diagnostics })
    }
    const repoName = await this.repoName(root)
    const ui = await this.loadUiState(root)
    const blueprint = projectGraph(
      { repoId: index.repoId, repoName, entries, revision: rev },
      root,
    )
    blueprint.canvasLayout = ui.canvasLayout
    blueprint.collapsedNodeIds = ui.collapsedNodeIds
    // Note: coverage comes from portable receipts - see .agents/notes/implemented/architecture/2026-09-18-harness-portable-results.md
    if (index.repoId) {
      const results = await listTaskResults(root)
      for (const node of Object.values(blueprint.nodes)) {
        const entry = entries.find((item) => item.note.meta.id === node.id)
        if (!entry) continue
        if (entry.note.meta.kind === 'task') {
          const result = results.find((item) => item.taskUri === node.sourceUri)
          if (result?.execution?.state === 'done' && result.validity === 'valid') { node.status = 'done'; node.progress = 100 }
        }
        if (entry.note.meta.kind === 'requirement') {
          const proof = await proveRequirementCoverage(root, index.repoId, node.sourceUri!, entry.note)
          for (const feature of node.features) {
            const covered = !proof.uncovered.includes(feature.id)
            feature.progress = covered ? 100 : 0
            feature.status = covered ? 'done' : 'planned'
          }
          node.progress = entry.note.acs.length ? Math.round(100 * (entry.note.acs.length - proof.uncovered.length) / entry.note.acs.length) : 0
          if (proof.covered) node.status = 'done'
        }
      }
    }
    return { blueprint, rev, repoId: index.repoId, repoName, invalid }
  }

  projectIdForRoot(root: string, repoId: string | null): string {
    return projectGraphId(repoId, root)
  }

  /** Raw note plus identity for merge/apply flows. Throws coded NOT_FOUND. */
  async readNote(
    root: string,
    id: string,
  ): Promise<{ note: ParsedNote; raw: string; relPath: string; sha256: string }> {
    const { index } = await this.cachedIndex(root)
    const entry = index.byId.get(id)
    if (!entry?.note) {
      throw { code: 'NOT_FOUND', message: `unknown note: ${id}`, path: id }
    }
    const raw = await readFile(join(root, entry.relPath), 'utf8')
    return { note: parseNote(raw), raw, relPath: entry.relPath, sha256: entry.sha256 }
  }

  /** Canvas-only overlay state. Local, never shared, best effort. */
  async loadUiState(root: string): Promise<{ canvasLayout: Record<string, { x: number; y: number }>; collapsedNodeIds: string[] | null }> {
    try {
      const raw = await readFile(join(root, '.agents', '.local', 'ui', 'project.json'), 'utf8')
      const data = JSON.parse(raw) as { canvasLayout?: unknown; collapsedNodeIds?: unknown }
      return {
        canvasLayout: (data.canvasLayout ?? {}) as Record<string, { x: number; y: number }>,
        collapsedNodeIds: Array.isArray(data.collapsedNodeIds) ? (data.collapsedNodeIds as string[]) : null,
      }
    } catch {
      return { canvasLayout: {}, collapsedNodeIds: null }
    }
  }

  async saveUiState(
    root: string,
    patch: { canvasLayout?: Record<string, { x: number; y: number }>; collapsedNodeIds?: string[] | null },
  ): Promise<void> {
    const current = await this.loadUiState(root)
    const next = {
      canvasLayout: patch.canvasLayout ?? current.canvasLayout,
      collapsedNodeIds: patch.collapsedNodeIds !== undefined ? patch.collapsedNodeIds : current.collapsedNodeIds,
    }
    const file = join(root, '.agents', '.local', 'ui', 'project.json')
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(next, null, 2), 'utf8')
  }

  /** Merge a structured edit onto parsed note bytes (pure; see artifact-producer). */
  mergeNoteEdit(note: ParsedNote, rawText: string, edit: NoteEdit, reason?: string): string {
    return mergeNoteEdit(note, rawText, edit, reason)
  }

  async applyOperations(
    root: string,
    operations: Array<{
      operationId: string
      type: 'create' | 'replace' | 'delete'
      uri: string
      expectedHash: string | null
      relativePath?: string
      afterMarkdown?: string
    }>,
    reason: string,
    opts?: { allowDelete?: boolean },
  ): Promise<{ txId: string; applied: Array<{ operationId: string; relPath?: string }> }> {
    const cs = {
      id: randomUUID(),
      revision: 1,
      source: { type: 'harness' as const, id: 'janusx-desktop', revision: 1 },
      operations: operations.map((o) => ({ ...o, dependsOn: [] as string[], reason, evidenceRefs: [] as string[], noteDiagnostics: [] as Diagnostic[] })),
    }
    const digest = sha256HexBytes(Buffer.from(JSON.stringify(cs.operations), 'utf8'))
    return this.runChangeSet(root, cs, digest, opts)
  }

  /**
   * Applies a caller-owned changeset (roundtable bundles, S5) without
   * re-minting its identity, so retries of the same bundle hit the same
   * idempotency key instead of duplicating notes.
   */
  async applyBundleChangeSet(
    root: string,
    changeSet: {
      id: string
      revision: number
      source: { type: 'roundtable' | 'chat' | 'harness' | 'manual'; id: string; revision: number }
      operations: Array<{
        operationId: string
        type: 'create' | 'replace' | 'delete'
        uri: string
        expectedHash: string | null
        relativePath?: string
        afterMarkdown?: string
        dependsOn?: string[]
        evidenceRefs?: string[]
      }>
    },
    reason: string,
    opts?: { requestDigest?: string },
  ): Promise<{ txId: string; applied: Array<{ operationId: string; relPath?: string }> }> {
    const cs = {
      ...changeSet,
      operations: changeSet.operations.map((o) => ({
        ...o,
        dependsOn: o.dependsOn ?? ([] as string[]),
        reason,
        evidenceRefs: o.evidenceRefs ?? ([] as string[]),
        noteDiagnostics: [] as Diagnostic[],
      })),
    }
    const digest = opts?.requestDigest ?? sha256HexBytes(Buffer.from(JSON.stringify(cs.operations), 'utf8'))
    return this.runChangeSet(root, cs, digest)
  }

  private async runChangeSet(
    root: string,
    cs: {
      id: string
      revision: number
      source: { type: 'roundtable' | 'chat' | 'harness' | 'manual'; id: string; revision: number }
      operations: Array<{
        operationId: string
        type: 'create' | 'replace' | 'delete'
        uri: string
        expectedHash: string | null
        relativePath?: string
        afterMarkdown?: string
        dependsOn: string[]
        reason: string
        evidenceRefs: string[]
        noteDiagnostics: Diagnostic[]
      }>
    },
    digest: string,
    opts?: { allowDelete?: boolean },
  ): Promise<{ txId: string; applied: Array<{ operationId: string; relPath?: string }> }> {
    const report = await applyChangeSet(root, cs, { requestDigest: digest, ...(opts?.allowDelete ? { allowDelete: true } : {}) })
    if (!report.ok) {
      const conflict = report.errors.find((e) => e.code === 'CONFLICT')
      if (conflict) {
        throw { code: 'HARNESS_CONFLICT', message: conflict.message, path: conflict.path }
      }
      const first = report.errors[0]
      throw { code: first?.code ?? 'SCHEMA_INVALID', message: first?.message ?? 'apply failed', path: first?.path }
    }
    await this.rescan(root)
    return { txId: report.txId, applied: report.results.map((r) => ({ operationId: r.operationId, relPath: r.relPath })) }
  }

  async watch(root: string): Promise<void> {
    if (this.watchers.has(root)) return
    const handle = await watchNotes(root, (events) => {
      void this.rescan(root).then(({ rev }) => {
        for (const listener of this.listeners) {
          listener({ type: 'harness:changed', root, rev, events })
        }
      })
    })
    this.watchers.set(root, handle)
  }

  unwatchAll(): void {
    for (const handle of this.watchers.values()) handle.close()
    this.watchers.clear()
  }

  // ── bindings (.local convenience data; never shared) ──────────────

  async getBindings(root: string): Promise<BindingRecord[]> {
    const { map } = await readWorkspaceMap(root)
    return (map?.bindings ?? []) as BindingRecord[]
  }

  async setBinding(root: string, binding: BindingRecord): Promise<BindingRecord[]> {
    if (!(await isDir(binding.path))) {
      throw { code: 'NOT_FOUND', message: `checkout path missing: ${binding.path}` }
    }
    const { map } = await readWorkspaceMap(root)
    const bindings: BindingRecord[] = [...(map?.bindings ?? [])]
    const at = bindings.findIndex((b) => b.checkoutId === binding.checkoutId)
    const row = { ...binding }
    if (row.selected) {
      for (const b of bindings) {
        if (b.repoId === row.repoId) b.selected = false
      }
    }
    if (at >= 0) bindings[at] = row
    else bindings.push(row)
    const file = join(root, '.agents', '.local', 'workspace-map.json')
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify({ version: 1, bindings }, null, 2), 'utf8')
    return bindings
  }

  // ── share (whitelist export; .local/machine paths/credentials never leave) ──

  async shareSnapshot(root: string, selection: ShareSelection = {}): Promise<ShareSnapshot> {
    return withAssetLock(root, async () => {
      const index = await buildNoteIndex(root)
      const repoName = await this.repoName(root)
      const wanted = selection.ids ? new Set(selection.ids) : null
      const notes: ShareSnapshot['notes'] = []
      for (const e of index.entries) {
        if (!e.note || e.diagnostics.length > 0) continue
        if (wanted && !wanted.has(e.note.meta.id)) continue
        const raw = await readFile(join(root, e.relPath), 'utf8')
        notes.push({
          id: e.note.meta.id,
          uri: index.repoId ? `note://${index.repoId}/${e.note.meta.id}` : null,
          relPath: e.relPath,
          markdown: raw,
          sha256: e.sha256,
        })
      }
      const evidence: ShareSnapshot['evidence'] = []
      const receiptIds = new Set(notes.flatMap((item) => parseNote(item.markdown).meta.execution?.receipts ?? []))
      for (const id of receiptIds) {
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw { code: 'SCHEMA_INVALID', message: 'invalid receipt id' }
        const relPath = `.agents/evidence/${id}.json`
        await assertAssetPath(root, relPath)
        const json = await readFile(join(root, relPath), 'utf8')
        const receipt = JSON.parse(json)
        if (validateReceiptShape(receipt).length || receipt.id !== id) throw { code: 'SCHEMA_INVALID', message: `invalid formal receipt: ${id}` }
        evidence.push({ id, json, sha256: sha256HexBytes(Buffer.from(json)) })
      }
      return {
        schema: 'harness-share/1',
        repoId: index.repoId,
        repoName,
        exportedAt: new Date().toISOString(),
        notes,
        repositories: [{ repoId: index.repoId, name: repoName }],
        unresolved: [],
        evidence,
      }
    })
  }

  /** Export + leak gate in one step: the file lands only when clean. */
  async exportSnapshot(root: string, selection: ShareSelection, outPath: string): Promise<{ outPath: string; notes: number }> {
    const snapshot = await this.shareSnapshot(root, selection)
    const text = JSON.stringify(snapshot, null, 2)
    const leaks = assertNoLocalLeak(root, text)
    if (leaks.length > 0) {
      throw { code: 'PERMISSION_DENIED', message: `share blocked: ${leaks[0].message}`, path: leaks[0].path }
    }
    await mkdir(dirname(outPath), { recursive: true })
    await writeFile(outPath, text, 'utf8')
    return { outPath, notes: snapshot.notes.length }
  }

  /** Preview-only import plan: no bytes move, conflicts stay hypothetical. */
  async previewShareImport(root: string, snapshot: IncomingSnapshot): Promise<ReturnType<typeof planShareImport>> {
    return withAssetLock(root, async () => {
      const text = JSON.stringify(snapshot)
      const leaks = assertNoLocalLeak(root, text)
      if (leaks.length > 0) {
        throw { code: 'PERMISSION_DENIED', message: `share blocked: ${leaks[0].message}`, path: leaks[0].path }
      }
      const index = await buildNoteIndex(root)
      return planShareImport(index, snapshot, index.repoId)
    })
  }

  /**
   * Applies a snapshot into this checkout and reports per-note outcomes.
   * Receipts land first (immutable, identical bytes are kept, divergent
   * bytes with the same id refuse); notes follow in one transaction, so a
   * concurrent edit fails the whole apply instead of half-applying.
   * Re-running converges: applied notes become identical skips. The method
   * takes no outer lock because the transaction locks internally; the
   * expected hashes compiled above are the concurrency control, and a
   * conflict simply asks the caller to re-preview.
   */
  async applyShareImport(root: string, snapshot: IncomingSnapshot): Promise<{
    notes: Array<{ id: string; action: 'applied' | 'identical' | 'invalid'; reason?: string }>
    receipts: Array<{ id: string; action: 'applied' | 'kept' | 'invalid' | 'conflict'; reason?: string }>
  }> {
    const text = JSON.stringify(snapshot)
    const leaks = assertNoLocalLeak(root, text)
    if (leaks.length > 0) {
      throw { code: 'PERMISSION_DENIED', message: `share blocked: ${leaks[0].message}`, path: leaks[0].path }
    }
    const index = await buildNoteIndex(root)
    const plan = planShareImport(index, snapshot, index.repoId)
    const receipts: Array<{ id: string; action: 'applied' | 'kept' | 'invalid' | 'conflict'; reason?: string }> = []
    for (const item of plan.receipts) {
      if (item.action === 'invalid') {
        receipts.push({ id: item.id, action: 'invalid', ...(item.reason ? { reason: item.reason } : {}) })
        continue
      }
      const incoming = snapshot.evidence.find((row) => row.id === item.id)
      if (!incoming) {
        receipts.push({ id: item.id, action: 'invalid', reason: 'snapshot dropped the receipt body' })
        continue
      }
      const relPath = `.agents/evidence/${item.id}.json`
      await assertAssetPath(root, relPath)
      let current: string | null = null
      try {
        current = await readFile(join(root, relPath), 'utf8')
      } catch {
        current = null
      }
      if (current !== null) {
        if (current === incoming.json) receipts.push({ id: item.id, action: 'kept' })
        else receipts.push({ id: item.id, action: 'conflict', reason: 'a different receipt already owns this id' })
        continue
      }
      await mkdir(dirname(join(root, relPath)), { recursive: true })
      await writeFile(join(root, relPath), incoming.json, 'utf8')
      receipts.push({ id: item.id, action: 'applied' })
    }
    const notes: Array<{ id: string; action: 'applied' | 'identical' | 'invalid'; reason?: string }> = []
    const operations: Array<{
      operationId: string
      type: 'create' | 'replace'
      uri: string
      expectedHash: string | null
      relativePath?: string
      afterMarkdown: string
    }> = []
    const operationOf = new Map<string, string>()
    for (const item of plan.notes) {
      if (item.kind !== 'create' && item.kind !== 'replace') continue
      const operationId = `import-${item.id.slice(0, 8)}-${item.kind}`
      operationOf.set(item.id, operationId)
      operations.push({
        operationId,
        type: item.kind,
        uri: item.uri,
        expectedHash: item.kind === 'replace' ? item.expectedHash : null,
        ...(item.kind === 'create' ? { relativePath: item.relPath.replace(/^\.agents\/notes\//, '') } : {}),
        afterMarkdown: item.afterMarkdown,
      })
    }
    let applied = new Set<string>()
    if (operations.length > 0) {
      const reason = `share import from ${snapshot.repoName ?? snapshot.repoId ?? 'snapshot'}`
      const report = await this.applyOperations(root, operations, reason)
      applied = new Set(report.applied.map((row) => row.operationId))
    }
    for (const item of plan.notes) {
      if (item.kind === 'identical') {
        notes.push({ id: item.id, action: 'identical' })
        continue
      }
      if (item.kind === 'invalid') {
        notes.push({ id: item.id, action: 'invalid', reason: item.reason })
        continue
      }
      const operationId = operationOf.get(item.id)
      if (operationId && applied.has(operationId)) notes.push({ id: item.id, action: 'applied' })
    }
    return { notes, receipts }
  }
}

/** Strip userinfo (and local schemes) from shared remote descriptors. */
export function stripRemoteCreds(url: string): string | null {
  if (!url || url.startsWith('file:') || url.startsWith('/') || /^[A-Za-z]:/.test(url)) return null
  try {
    if (url.includes('@') && !url.startsWith('git@')) {
      const withoutProto = url.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '')
      const at = withoutProto.lastIndexOf('@')
      const proto = url.slice(0, url.length - withoutProto.length)
      return `${proto}${withoutProto.slice(at + 1)}`
    }
    return url
  } catch {
    return null
  }
}

export const harnessNoteService = new HarnessNoteService()
