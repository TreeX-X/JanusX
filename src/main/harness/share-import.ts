// Note: share import lands twin-checkout snapshots here — see .agents/notes/2026-09-19-share-import--eece2e89.md
/**
 * @file Share import planning (J3-JanusX).
 * @description Pure planner for applying an exported harness snapshot into
 *  this checkout. Identity is the note id, never the file path: missing ids
 *  become creates, matching hashes become identical skips, and anything else
 *  becomes an expected-hash replace that the managed transaction either
 *  lands or refuses. The planner writes nothing; the service applies the
 *  compiled operations through the single transaction, so retrying an
 *  import converges instead of duplicating.
 */
import {
  parseNote,
  validateReceiptShape,
  type Diagnostic,
} from '@janus-agent/harness-core'
import type { NoteIndex } from '@janus-agent/harness-node'

function diag(code: Diagnostic['code'], message: string, path?: string): Diagnostic {
  return path === undefined ? { code, message } : { code, message, path }
}

/** Whitelist gate: machine paths, local state, and credentials refuse export. */
export function assertNoLocalLeak(root: string, text: string): Diagnostic[] {
  const out: Diagnostic[] = []
  const needles: Array<[string, string]> = [
    [root, 'absolute checkout path'],
    ['.local/', 'local state'],
    ['.local\\', 'local state'],
    ['file://', 'file URL'],
  ]
  for (const [needle, label] of needles) {
    if (needle && text.includes(needle)) out.push(diag('PERMISSION_DENIED', `share leaks ${label}`, needle))
  }
  const cred = /:\/\/[^/\s]*:[^/\s]*@/.exec(text)
  if (cred) out.push(diag('PERMISSION_DENIED', 'share leaks credentials', cred[0]))
  return out
}

export interface IncomingNote {
  id: string
  uri: string | null
  relPath: string
  markdown: string
  sha256: string
}

export interface IncomingReceipt {
  id: string
  json: string
  sha256: string
}

export interface IncomingSnapshot {
  schema: string
  repoId: string | null
  repoName?: string
  notes: IncomingNote[]
  evidence: IncomingReceipt[]
}

export type ImportNoteAction =
  | { kind: 'create'; id: string; uri: string; relPath: string; afterMarkdown: string }
  | { kind: 'replace'; id: string; uri: string; expectedHash: string; afterMarkdown: string }
  | { kind: 'identical'; id: string }
  | { kind: 'invalid'; id: string; reason: string }

export interface ImportReceiptAction {
  id: string
  action: 'write' | 'keep' | 'invalid' | 'conflict'
  reason?: string
}

export interface ImportPlan {
  notes: ImportNoteAction[]
  receipts: ImportReceiptAction[]
}

const RECEIPT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/

function slugify(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return slug || 'note'
}

function sanitizeRelPath(relPath: string): string | null {
  const normalized = relPath.replace(/\\/g, '/').replace(/^(\.\/)+/, '')
  if (!normalized.startsWith('.agents/notes/') || !normalized.endsWith('.md')) return null
  const rest = normalized.slice('.agents/notes/'.length)
  if (!rest || rest.includes('..') || rest.startsWith('/')) return null
  return normalized
}

/** Plans one snapshot against a scanned index. Throws coded failures on envelope or scope violations. */
export function planShareImport(index: NoteIndex, snapshot: IncomingSnapshot, repoId: string | null): ImportPlan {
  if (!snapshot || snapshot.schema !== 'harness-share/1') {
    throw { code: 'SCHEMA_INVALID', message: 'snapshot is not a harness-share/1 export' }
  }
  if (snapshot.repoId && repoId && snapshot.repoId !== repoId) {
    throw { code: 'UNRESOLVED_REFERENCE', message: `snapshot targets repo ${snapshot.repoId}, this checkout is ${repoId}` }
  }
  const taken = new Set(index.entries.map((e) => e.relPath.toLowerCase()))
  const notes: ImportNoteAction[] = []
  for (const item of snapshot.notes ?? []) {
    if (!item || typeof item.id !== 'string' || !item.id || typeof item.markdown !== 'string') {
      throw { code: 'SCHEMA_INVALID', message: 'snapshot note needs an id and markdown' }
    }
    let title: string
    try {
      const parsed = parseNote(item.markdown)
      if (parsed.meta.id !== item.id) {
        notes.push({ kind: 'invalid', id: item.id, reason: 'note identity differs from its file identity' })
        continue
      }
      title = parsed.title
    } catch (error) {
      notes.push({ kind: 'invalid', id: item.id, reason: error instanceof Error ? error.message : String(error) })
      continue
    }
    const uri = item.uri ?? (repoId ? `note://${repoId}/${item.id}` : `note://local/${item.id}`)
    const hit = index.byId.get(item.id)
    if (!hit?.note) {
      const clean = sanitizeRelPath(item.relPath)
      let relPath = clean ?? `.agents/notes/imported/${slugify(title)}--${item.id.slice(0, 8)}.md`
      if (taken.has(relPath.toLowerCase())) {
        relPath = `.agents/notes/imported/${slugify(title)}--${item.id.slice(0, 8)}.md`
      }
      taken.add(relPath.toLowerCase())
      notes.push({ kind: 'create', id: item.id, uri, relPath, afterMarkdown: item.markdown })
      continue
    }
    if (hit.sha256 === item.sha256) {
      notes.push({ kind: 'identical', id: item.id })
      continue
    }
    notes.push({ kind: 'replace', id: item.id, uri, expectedHash: hit.sha256, afterMarkdown: item.markdown })
  }
  const receipts: ImportReceiptAction[] = []
  for (const item of snapshot.evidence ?? []) {
    if (!item || !RECEIPT_ID_RE.test(item.id ?? '')) {
      receipts.push({ id: String(item?.id ?? ''), action: 'invalid', reason: 'invalid receipt id' })
      continue
    }
    let receipt: unknown
    try {
      receipt = JSON.parse(item.json)
    } catch {
      receipts.push({ id: item.id, action: 'invalid', reason: 'receipt is not JSON' })
      continue
    }
    if (validateReceiptShape(receipt).length || (receipt as { id?: unknown }).id !== item.id) {
      receipts.push({ id: item.id, action: 'invalid', reason: 'receipt fails shape validation' })
      continue
    }
    receipts.push({ id: item.id, action: 'write' })
  }
  return { notes, receipts }
}
