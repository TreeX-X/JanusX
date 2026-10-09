// Note: published snapshots are bounded and excluded from recall — see .agents/notes/knowledge/requirements/knowledge-accumulate-review-wiki-rereview.md
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { WikiPage } from '../../shared/knowledge'
import { wikiRelationKey } from '../../shared/wiki-relations'
import { WIKI_HISTORY_LIMIT, type WikiHistoryPage, type WikiRevision, type WikiRevisionSummary } from '../../shared/wiki-history'
import { writeFileAtomic } from '../lib/atomic-file'
import { knowledgeRootPath } from './constants'
import { withWikiCandidatesLock } from './review-service'

const identitySchema = z.object({ workspaceId: z.string().trim().min(1).max(4096), slug: z.string().trim().min(1).max(512) })
const revisionQuerySchema = identitySchema.extend({ version: z.number().int().positive() })
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/)
const pageSchema = z.object({
  workspaceId: z.string().min(1), slug: z.string().min(1), title: z.string(), markdown: z.string(),
  tags: z.array(z.string()), status: z.literal('published'), sourceFactIds: z.array(z.string()),
  sourceNoteRefs: z.array(z.object({ uri: z.string(), sourceHash: hashSchema })).optional(),
  workspacePath: z.string().optional(), updatedAt: z.string(), version: z.number().int().positive(),
}).passthrough()
const revisionSchema = z.object({
  version: z.number().int().positive(), title: z.string(), publishedAt: z.string(), contentHash: hashSchema,
  pinned: z.boolean(), legacy: z.boolean(), actor: z.string().optional(), reason: z.string().optional(),
  candidateId: z.string().optional(), page: pageSchema,
})
const ledgerSchema = identitySchema.extend({ schema: z.literal(1), revisions: z.array(revisionSchema) }).strict()
type Ledger = z.infer<typeof ledgerSchema>
type Identity = z.infer<typeof identitySchema>

function historyPath(identity: Identity): string {
  const key = createHash('sha256').update(JSON.stringify([identity.workspaceId, identity.slug])).digest('hex')
  return join(knowledgeRootPath(), 'wiki', 'history', `${key}.json`)
}

/** Content and evidence identify a revision; publication time and retention flags do not. */
export function wikiContentHash(page: WikiPage): string {
  const content: unknown[] = [
    page.workspaceId, page.slug, page.title, page.markdown, [...page.tags].sort(),
    [...page.sourceFactIds].sort(),
    [...(page.sourceFactRefs ?? [])].sort((a, b) => a.id.localeCompare(b.id)).map(ref => [ref.id, ref.contentHash]), page.managed === true,
    [...(page.sourceNoteRefs ?? [])].sort((a, b) => a.uri.localeCompare(b.uri)).map(ref => [ref.uri, ref.sourceHash]),
  ]
  // Preserve pre-relationship history hashes byte-for-byte for old revisions.
  if (page.topicKey || page.relations?.length) content.push(page.topicKey ?? null,
    [...(page.relations ?? [])].sort((a, b) => wikiRelationKey(a).localeCompare(wikiRelationKey(b))))
  return createHash('sha256').update(JSON.stringify(content)).digest('hex')
}

async function readLedger(identity: Identity): Promise<{ ledger: Ledger; raw: string | null }> {
  let raw: string
  try { raw = await readFile(historyPath(identity), 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ledger: { schema: 1, ...identity, revisions: [] }, raw: null }
    throw error
  }
  const ledger = ledgerSchema.parse(JSON.parse(raw))
  if (ledger.workspaceId !== identity.workspaceId || ledger.slug !== identity.slug
    || new Set(ledger.revisions.map(item => item.version)).size !== ledger.revisions.length
    || ledger.revisions.some(item => item.page.workspaceId !== identity.workspaceId || item.page.slug !== identity.slug
      || item.page.version !== item.version || item.page.title !== item.title || item.page.updatedAt !== item.publishedAt
      || wikiContentHash(item.page) !== item.contentHash)) throw new Error('Invalid wiki history; restore it before publishing')
  return { ledger, raw }
}

function retain(revisions: WikiRevision[]): WikiRevision[] {
  const ordered = [...revisions].sort((a, b) => b.version - a.version)
  return ordered.filter((item, index) => index < WIKI_HISTORY_LIMIT || item.pinned)
}

function summary({ page: _page, ...rest }: WikiRevision): WikiRevisionSummary { return rest }

/** Caller holds the Wiki lock; returned bytes join the recoverable publication transaction. */
export async function prepareWikiHistory(previous: WikiPage | undefined, page: WikiPage, metadata: { actor: string; reason: string; candidateId: string }): Promise<{ path: string; before: string | null; after: string }> {
  const identity = identitySchema.parse(page)
  const { ledger, raw } = await readLedger(identity)
  const revisions: WikiRevision[] = [...ledger.revisions]
  const add = (snapshot: WikiPage, legacy: boolean) => {
    const contentHash = wikiContentHash(snapshot)
    const found = revisions.find(item => item.version === snapshot.version)
    if (found) {
      if (found.contentHash !== contentHash) throw new Error('Wiki history version conflicts with the current page')
      return
    }
    revisions.push({ version: snapshot.version, title: snapshot.title, publishedAt: snapshot.updatedAt,
      contentHash, pinned: false, legacy, page: { ...snapshot, status: 'published' }, ...(legacy ? {} : metadata) })
  }
  if (previous) add(previous, true)
  add(page, false)
  const next = ledgerSchema.parse({ ...ledger, revisions: retain(revisions) })
  const path = historyPath(identity)
  return { path, before: raw, after: JSON.stringify(next) + '\n' }
}

export function listWikiHistory(input: unknown): Promise<WikiHistoryPage> {
  const query = identitySchema.extend({ offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(100).default(20) }).strict().parse(input)
  return withWikiCandidatesLock(async () => {
    const { ledger } = await readLedger(query)
    const revisions = [...ledger.revisions].sort((a, b) => b.version - a.version)
    return { items: revisions.slice(query.offset, query.offset + query.limit).map(summary), total: revisions.length,
      offset: query.offset, limit: query.limit, retainedVersions: WIKI_HISTORY_LIMIT }
  })
}

export function readWikiRevision(input: unknown): Promise<WikiRevision> {
  const query = revisionQuerySchema.strict().parse(input)
  return withWikiCandidatesLock(async () => {
    const { ledger } = await readLedger(query)
    const revision = ledger.revisions.find(item => item.version === query.version)
    if (!revision) throw new Error('Wiki revision is unavailable or no longer retained')
    return revision
  })
}

export function pinWikiRevision(input: unknown): Promise<void> {
  const query = revisionQuerySchema.extend({ contentHash: hashSchema, pinned: z.boolean() }).strict().parse(input)
  return withWikiCandidatesLock(async () => {
    const { ledger } = await readLedger(query)
    const revision = ledger.revisions.find(item => item.version === query.version)
    if (!revision || revision.contentHash !== query.contentHash) throw new Error('Wiki revision changed; reload history')
    if (revision.pinned === query.pinned) return
    revision.pinned = query.pinned
    await writeFileAtomic(historyPath(query), JSON.stringify({ ...ledger, revisions: retain(ledger.revisions) }) + '\n')
  })
}
