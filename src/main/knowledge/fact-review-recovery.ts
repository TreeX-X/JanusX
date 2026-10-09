// Note: a recoverable review intent prevents crashes leaving unaudited active facts — see .agents/notes/knowledge/requirements/unified-memory-laya-primary.md
import { createHash, randomUUID } from 'node:crypto'
import { readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { knowledgeRootPath } from './constants'
import { writeFileAtomic } from '../lib/atomic-file'

const pendingPath = () => join(knowledgeRootPath(), 'facts', 'review-pending.json')
let reviewRevision = 0
const fileSchema = z.object({ path: z.enum(['facts/facts.jsonl', 'facts/candidates.jsonl']), before: z.string().nullable(), after: z.string() }).strict()
const journalSchema = z.object({ version: z.literal(1), id: z.string().uuid(), files: z.array(fileSchema).length(2) }).strict()
export const auditBatchEventId = (operationId: string, index: number) => createHash('sha256').update(JSON.stringify([operationId, index])).digest('hex')
export const serializeReviewRecords = (records: unknown[]) => records.length ? records.map(record => JSON.stringify(record)).join('\n') + '\n' : ''

async function optionalText(path: string): Promise<string | null> {
  try { return await readFile(path, 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function readPending() {
  const raw = await optionalText(pendingPath())
  if (raw === null) return null
  const journal = journalSchema.parse(JSON.parse(raw))
  if (new Set(journal.files.map(file => file.path)).size !== 2) throw new Error('Invalid fact review recovery paths')
  return journal
}

/** Call under the shared fact mutation lock, after all review checks and before the first truth write. */
export async function prepareFactReview(facts: unknown[], candidates: unknown[]): Promise<string> {
  if (await readPending()) throw new Error('Fact review recovery is required')
  const paths = ['facts/facts.jsonl', 'facts/candidates.jsonl'] as const
  const files = await Promise.all(paths.map(async (path, index) => ({ path,
    before: await optionalText(join(knowledgeRootPath(), path)), after: serializeReviewRecords(index === 0 ? facts : candidates) })))
  const id = randomUUID()
  reviewRevision += 1
  await writeFileAtomic(pendingPath(), JSON.stringify({ version: 1, id, files }))
  return id
}

/** Readers fail explicitly while a review is incomplete; they never expose its partial truth. */
export async function assertFactReviewReady(expectedRevision?: number): Promise<number> {
  const revision = reviewRevision
  if (await readPending() || reviewRevision !== revision || (expectedRevision !== undefined && expectedRevision !== revision)) {
    throw new Error('Fact review is recovering; retry after recovery')
  }
  return revision
}

/** The atomic audit batch is the commit point. Without it, restore original bytes. */
export async function recoverPendingFactReview(): Promise<void> {
  const journal = await readPending()
  if (!journal) return
  reviewRevision += 1
  const audit = await optionalText(join(knowledgeRootPath(), 'audit', 'audit.jsonl'))
  const marker = auditBatchEventId(journal.id, 0)
  const events = (audit ?? '').split('\n').filter(line => line.trim()).map(line => JSON.parse(line) as { id: string })
  const committed = events.some(event => event.id === marker)
  // Check the complete read set before touching any file. External edits must be reconciled explicitly.
  const current = await Promise.all(journal.files.map(file => optionalText(join(knowledgeRootPath(), file.path))))
  for (const [index, file] of journal.files.entries()) {
    if (current[index] !== file.before && current[index] !== file.after) throw new Error('Fact review recovery conflict; original files retained')
  }
  for (const [index, file] of journal.files.entries()) {
    const target = committed ? file.after : file.before
    if (current[index] === target) continue
    const path = join(knowledgeRootPath(), file.path)
    if (target === null) await unlink(path)
    else await writeFileAtomic(path, target)
  }
  await unlink(pendingPath())
  reviewRevision += 1
}
