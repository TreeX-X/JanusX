// Note: reversible managed writes — see .agents/notes/implemented/architecture/2026-09-18-harness-undo.md
/**
 * @file Harness undo (S8-JanusX, legacy-loop equivalence).
 * @description Reverses one committed managed write as a new transacted
 *  changeset: preview classifies every touched file against the journal
 *  before/after hashes, and apply refuses the whole package on any conflict
 *  without writing a byte. Reverse operations rebuild note identities from
 *  snapshot bytes code-side, so no second truth is kept. Evidence, receipts,
 *  and audit history are never touched: only file bytes move, and the undo
 *  itself lands journaled as the next undoable write.
 *  No Electron import, so unit tests drive real temp checkouts.
 */
import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseNote, type Diagnostic } from '@janus-agent/harness-core'
import {
  buildNoteIndex,
  classifyFile,
  currentHash,
  listPendingTx,
  readCommitted,
  readJournal,
  readTxFile,
  type JournalFile,
} from '@janus-agent/harness-node'
import { harnessNoteService } from './service'

export interface UndoFilePreview {
  operationId: string
  relPath: string
  status: 'reversible' | 'already-reverted' | 'conflict' | 'unsupported'
  beforeHash: string | null
  afterHash: string | null
}

export interface UndoPreview {
  txId: string
  changeSetId: string
  revision: number
  files: UndoFilePreview[]
  reversible: boolean
}

function diag(code: Diagnostic['code'], message: string, path?: string): Diagnostic {
  return path === undefined ? { code, message } : { code, message, path }
}

/** Newest committed transaction, or null when no managed write ever landed. */
export async function latestCommittedTx(root: string): Promise<string | null> {
  const ids = await listPendingTx(root)
  let best: { id: string; mtime: number } | null = null
  for (const id of ids) {
    const committed = await readCommitted(root, id)
    if (!committed) continue
    try {
      const mtime = (await stat(join(resolve(root, '.agents', '.local', 'transactions', id), 'journal.json'))).mtimeMs
      if (!best || mtime > best.mtime) best = { id, mtime }
    } catch {
      continue
    }
  }
  return best?.id ?? null
}

async function previewTx(root: string, txId: string): Promise<UndoPreview> {
  const journal = await readJournal(root, txId)
  if (!journal) throw { code: 'NOT_FOUND', message: `no managed write ${txId}` }
  const committed = await readCommitted(root, txId)
  if (!committed) throw { code: 'NOT_READY', message: `write ${txId} never committed; only committed writes reverse` }
  const files: UndoFilePreview[] = []
  for (const row of journal.files) {
    const current = await currentHash(root, row.relPath)
    const cls = classifyFile(current, row)
    files.push({
      operationId: row.operationId,
      relPath: row.relPath,
      status: cls === 'after' ? 'reversible' : cls === 'before' ? 'already-reverted' : 'conflict',
      beforeHash: row.beforeHash,
      afterHash: row.afterHash,
    })
  }
  return {
    txId,
    changeSetId: journal.changeSetId,
    revision: journal.revision,
    files,
    reversible: files.length > 0 && files.every((file) => file.status !== 'conflict'),
  }
}

/** Classifies one committed write without moving a byte. Empty txId previews the latest write. */
export async function previewUndo(root: string, txId?: string): Promise<{ preview: UndoPreview | null; errors: Diagnostic[] }> {
  try {
    const id = txId ?? (await latestCommittedTx(root))
    if (!id) return { preview: null, errors: [diag('NOT_FOUND', 'no managed writes to reverse')] }
    return { preview: await previewTx(root, id), errors: [] }
  } catch (error) {
    const failure = error as Partial<Diagnostic> & { message?: string }
    return { preview: null, errors: [{ code: failure.code ?? 'IO_ERROR', message: failure.message ?? String(error) }] }
  }
}

interface ReverseOp {
  operationId: string
  type: 'create' | 'replace' | 'delete'
  uri: string
  expectedHash: string | null
  relativePath?: string
  afterMarkdown?: string
}

async function noteUriFor(root: string, markdown: string, relPath: string): Promise<string> {
  let parsed: { meta?: { id?: unknown } }
  try {
    parsed = parseNote(markdown) as { meta?: { id?: unknown } }
  } catch {
    throw { code: 'CAPABILITY_UNAVAILABLE', message: `cannot reverse ${relPath}: snapshot is not a readable note`, path: relPath }
  }
  const id = parsed.meta?.id
  if (typeof id !== 'string' || !id) throw { code: 'CAPABILITY_UNAVAILABLE', message: `cannot reverse ${relPath}: snapshot carries no note identity`, path: relPath }
  const index = await buildNoteIndex(root)
  if (!index.repoId) throw { code: 'NOT_READY', message: 'project identity is missing; init .agents/harness.json first', path: relPath }
  return `note://${index.repoId}/${id}`
}

async function reverseOps(root: string, txId: string, rows: JournalFile[]): Promise<ReverseOp[]> {
  const ops: ReverseOp[] = []
  for (const row of rows) {
    if (!row.existed) {
      // Forward created the file: reverse deletes it. Identity comes from the
      // current bytes, which must still equal the written image.
      const current = await readFile(resolve(root, row.relPath), 'utf8').catch(() => null)
      if (current === null) throw { code: 'CONFLICT', message: `cannot reverse ${row.relPath}: file already gone`, path: row.relPath }
      ops.push({
        operationId: `undo-${row.operationId}`,
        type: 'delete',
        uri: await noteUriFor(root, current, row.relPath),
        expectedHash: row.afterHash,
      })
      continue
    }
    if (!row.snapName) throw { code: 'IO_ERROR', message: `managed write ${txId} lost its snapshot for ${row.relPath}`, path: row.relPath }
    const before = await readTxFile(root, txId, row.snapName)
    if (!before) throw { code: 'IO_ERROR', message: `managed write ${txId} lost its snapshot for ${row.relPath}`, path: row.relPath }
    const markdown = Buffer.from(before).toString('utf8')
    if (row.afterHash === null) {
      // Forward deleted the file: reverse recreates it. Create paths run
      // relative to the notes directory while journal rows stay
      // checkout-relative, so the prefix comes off here.
      const notesRel = row.relPath.replace(/\\/g, '/')
      const createRel = notesRel.startsWith('.agents/notes/') ? notesRel.slice('.agents/notes/'.length) : notesRel
      if (!createRel) throw { code: 'CAPABILITY_UNAVAILABLE', message: `cannot reverse ${row.relPath}: no creatable path`, path: row.relPath }
      ops.push({
        operationId: `undo-${row.operationId}`,
        type: 'create',
        uri: await noteUriFor(root, markdown, row.relPath),
        expectedHash: null,
        relativePath: createRel,
        afterMarkdown: markdown,
      })
    } else {
      ops.push({
        operationId: `undo-${row.operationId}`,
        type: 'replace',
        uri: await noteUriFor(root, markdown, row.relPath),
        expectedHash: row.afterHash,
        afterMarkdown: markdown,
      })
    }
  }
  return ops
}

/**
 * Reverses one committed write as a new undoable changeset. Any conflict
 * refuses the whole package with the file list and writes nothing.
 */
export async function applyUndo(root: string, txId?: string): Promise<{ txId: string; reverted: string[]; errors: Diagnostic[] }> {
  const previewed = await previewUndo(root, txId)
  if (!previewed.preview) return { txId: '', reverted: [], errors: previewed.errors }
  const preview = previewed.preview
  if (!preview.reversible) {
    return {
      txId: '',
      reverted: [],
      errors: [diag('CONFLICT', `write ${preview.txId} cannot reverse cleanly`, preview.files.filter((file) => file.status === 'conflict').map((file) => file.relPath).join(', ') || undefined)],
    }
  }
  if (preview.files.every((file) => file.status === 'already-reverted')) {
    return { txId: '', reverted: [], errors: [diag('NOT_READY', `write ${preview.txId} is already reverted; nothing to do`)] }
  }
  const journal = await readJournal(root, preview.txId)
  if (!journal) return { txId: '', reverted: [], errors: [diag('NOT_FOUND', `managed write ${preview.txId} vanished mid-undo`)] }
  let ops: ReverseOp[]
  try {
    ops = await reverseOps(root, preview.txId, journal.files.filter((row) => preview.files.some((file) => file.operationId === row.operationId && file.status === 'reversible')))
  } catch (error) {
    const failure = error as Partial<Diagnostic> & { message?: string }
    return { txId: '', reverted: [], errors: [{ code: failure.code ?? 'IO_ERROR', message: failure.message ?? String(error), ...(failure.path ? { path: failure.path } : {}) }] }
  }
  if (ops.length === 0) return { txId: '', reverted: [], errors: [diag('NOT_READY', `write ${preview.txId} is already reverted; nothing to do`)] }
  try {
    // The panel confirm behind this call is the explicit delete grant: reverse
    // deletes only ever remove what the forward write created.
    const applied = await harnessNoteService.applyOperations(root, ops.map((op) => ({ ...op, operationId: op.operationId || randomUUID() })), `Undo managed write ${preview.txId}`, { allowDelete: true })
    return { txId: applied.txId, reverted: applied.applied.map((item) => item.relPath ?? item.operationId), errors: [] }
  } catch (error) {
    const failure = error as Partial<Diagnostic> & { message?: string }
    return { txId: '', reverted: [], errors: [{ code: (failure.code ?? 'SCHEMA_INVALID') as Diagnostic['code'], message: failure.message ?? String(error), ...(failure.path ? { path: failure.path } : {}) }] }
  }
}
