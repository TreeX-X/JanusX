// Note: the audit batch commits page, sources, history and candidate together — see .agents/notes/knowledge/requirements/knowledge-accumulate-review-wiki-rereview.md
import { randomUUID } from 'node:crypto'
import { readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { writeFileAtomic } from '../lib/atomic-file'
import { knowledgeRootPath } from './constants'
import { auditBatchEventId } from './fact-review-recovery'

const pendingPath = () => join(knowledgeRootPath(), 'wiki', 'review-pending.json')
const schema = z.object({ id: z.string().uuid(), files: z.array(z.object({ path: z.string(), before: z.string().nullable(), after: z.string() }).strict()).length(4) }).strict()
let revision = 0
async function optionalText(path: string): Promise<string | null> {
  try { return await readFile(path, 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}
async function pending() {
  const raw = await optionalText(pendingPath())
  if (raw === null) return null
  return validateJournal(JSON.parse(raw))
}
function validateJournal(value: unknown) {
  const journal = schema.parse(value)
  if (new Set(journal.files.map(file => file.path)).size !== 4 || journal.files.some(file => file.path.split('/').some(part => part === '.' || part === '..') ||
    !/^wiki\/(pages-index\.json|patches\.jsonl|history\/[a-f0-9]{64}\.json|[^:\\]+\.md)$/.test(file.path))
    || !journal.files.some(file => file.path === 'wiki/pages-index.json') || !journal.files.some(file => file.path === 'wiki/patches.jsonl')
    || journal.files.filter(file => /^wiki\/history\/[a-f0-9]{64}\.json$/.test(file.path)).length !== 1) {
    throw new Error('Invalid wiki recovery paths')
  }
  return journal
}
/** Caller owns the Wiki mutation lock. No data is changed until the intent is durable. */
export async function prepareWikiReview(updates: Array<{ path: string; after: string }>): Promise<string> {
  if (await pending()) throw new Error('Wiki recovery required')
  const files = await Promise.all(updates.map(async file => ({ ...file, before: await optionalText(join(knowledgeRootPath(), file.path)) })))
  const id = randomUUID()
  const journal = validateJournal({ id, files })
  revision++
  await writeFileAtomic(pendingPath(), JSON.stringify(journal))
  for (const file of files) await writeFileAtomic(join(knowledgeRootPath(), file.path), file.after)
  return id
}
export async function assertWikiReviewReady(expected?: number): Promise<number> {
  const current = revision
  if (await pending() || revision !== current || expected !== undefined && expected !== current) throw new Error('Wiki review is recovering; retry after recovery')
  return current
}
/** Missing commit marker restores exact bytes, including pruned history. */
export async function recoverPendingWikiReview(): Promise<void> {
  const journal = await pending()
  if (!journal) return
  revision++
  const audit = await optionalText(join(knowledgeRootPath(), 'audit', 'audit.jsonl'))
  const marker = auditBatchEventId(journal.id, 0)
  const committed = (audit ?? '').split('\n').filter(Boolean).some(line => (JSON.parse(line) as { id: string }).id === marker)
  const current = await Promise.all(journal.files.map(file => optionalText(join(knowledgeRootPath(), file.path))))
  for (const [i, file] of journal.files.entries()) {
    if (current[i] !== file.before && current[i] !== file.after) throw new Error('Wiki recovery conflict; original files retained')
  }
  for (const [i, file] of journal.files.entries()) {
    const target = committed ? file.after : file.before
    if (current[i] === target) continue
    const path = join(knowledgeRootPath(), file.path)
    if (target === null) await unlink(path)
    else await writeFileAtomic(path, target)
  }
  await unlink(pendingPath())
  revision++
}
