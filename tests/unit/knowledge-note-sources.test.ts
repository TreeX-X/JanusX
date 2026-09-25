import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { SUPPORTED_HARNESS_PROFILE } from '@janus-agent/harness-node'
import { harnessNoteService } from '../../src/main/harness/service'
import { readWikiNote, wikiSourceStatuses, prepareNoteWiki, noteWikiPages, wikiWorkspace } from '../../src/main/knowledge/note-sources'
import { knowledgeReviewService } from '../../src/main/knowledge/review-service'
import { knowledgeTruthService } from '../../src/main/knowledge/truth-service'
import { knowledgeAuditService } from '../../src/main/knowledge/audit-service'
import { knowledgeOperationsService } from '../../src/main/knowledge/operations-service'
import { KNOWLEDGE_SCHEMA_CONTRACT } from '../../src/main/knowledge/contracts'
import type { CandidateWikiPatch, WikiPage } from '../../src/shared/knowledge'

vi.mock('../../src/main/knowledge/workspace-identity', () => ({
  resolveWorkspaceIdentity: async (root: string) => ({ workspaceId: root, workspaceName: 'Fixture', workspacePath: root, fallback: false }),
  workspacePathKey: (root: string) => root,
}))

const repo = '972afef3-2fc7-49de-a3ee-7e041225d28c'
const other = 'd2499d5b-4ceb-4d46-aa3b-18e5c9b86034'
const a = '00000000-0000-4000-8000-000000000001'
const b = '00000000-0000-4000-8000-000000000002'
const uri = (id = a, owner = repo) => 'note://' + owner + '/' + id
const hash = (text: string) => createHash('sha256').update(Buffer.from(text)).digest('hex')
const note = (id = a, text = 'Source') => ['---', 'schema: harness-note/1', 'id: ' + id, 'kind: initiative', 'lifecycle: accepted', 'created: 2026-09-25', 'class: architecture', 'tags: [wiki]', '---', '# ' + text, '', '## Goal', 'Read source.', '## Scope', 'One checkout.', '## Acceptance criteria', '- [ ] AC-1: Keep source.', ''].join('\n')
let root: string
let knowledge: string
const roots: string[] = []
async function checkout(owner = repo) {
  const path = await mkdtemp(join(tmpdir(), 'knowledge-note-'))
  roots.push(path)
  await mkdir(join(path, '.agents', 'notes'), { recursive: true })
  await writeFile(join(path, '.agents', 'harness.json'), JSON.stringify({ schemaVersion: 1, repoId: owner, name: 'Fixture', profile: SUPPORTED_HARNESS_PROFILE }))
  return path
}
async function source(id = a, text = note(id), path = root) { await writeFile(join(path, '.agents', 'notes', id + '.md'), text) }
async function propose(options: { root?: string; mode?: 'incremental' | 'full-page'; version?: number; uris?: string[]; markdown?: string } = {}) {
  const draft = await prepareNoteWiki({ rootPath: options.root ?? root, uris: options.uris ?? [uri()], pageSlug: 'design', reviewMode: options.mode ?? 'full-page', expectedVersion: options.version ?? 0 })
  return knowledgeReviewService.proposeNoteWiki({ draftId: draft.draftId, title: 'Design', markdown: options.markdown ?? '# Design\n\nReviewed source summary.', rationale: 'Reviewed complete page' })
}
async function apply(candidate: CandidateWikiPatch) { return knowledgeReviewService.applyCandidate({ type: 'wiki-patch', id: candidate.id }) }
async function page() { return (await knowledgeTruthService.list()).wikiPages.find(p => p.workspaceId === root)! }
async function stored() { return readFile(join(knowledge, 'wiki', 'pages-index.json'), 'utf8') }
async function candidates(): Promise<CandidateWikiPatch[]> { return (await readFile(join(knowledge, 'wiki', 'patches.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line)) }

beforeEach(async () => {
  root = await checkout()
  knowledge = await mkdtemp(join(tmpdir(), 'knowledge-wiki-truth-'))
  roots.push(knowledge)
  vi.stubEnv('JANUSX_KNOWLEDGE_ROOT', knowledge)
  await source()
  vi.spyOn(knowledgeAuditService, 'recordBatch').mockResolvedValue([])
  vi.spyOn(knowledgeAuditService, 'record').mockResolvedValue({} as never)
})
afterEach(async () => {
  harnessNoteService.unwatchAll()
  vi.restoreAllMocks(); vi.unstubAllEnvs()
  for (const path of roots.splice(0)) await rm(path, { recursive: true, force: true })
})

describe('R3 host Note provenance', () => {
  it('publishes Note-source fields in the knowledge contract', () => {
    expect(KNOWLEDGE_SCHEMA_CONTRACT.entities.wikiPage).toEqual(expect.arrayContaining(['sourceNoteRefs', 'workspacePath']))
    expect(KNOWLEDGE_SCHEMA_CONTRACT.entities.candidateWikiPatch).toEqual(expect.arrayContaining(['sourceNoteRefs', 'reviewMode', 'expectedVersion']))
  })

  it('hashes actual BOM/CRLF bytes, deduplicates multiple sources and ignores renderer hashes', async () => {
    const raw = '\ufeff' + note().replaceAll('\n', '\r\n')
    await source(a, raw); await source(b)
    const draft = await prepareNoteWiki({ rootPath: root, uris: [uri(), uri(b), uri()], pageSlug: 'design', reviewMode: 'full-page', expectedVersion: 0 })
    expect(draft.sources).toHaveLength(2)
    expect(draft.sources[0]).toMatchObject({ raw, sourceHash: hash(raw) })
    const request = { draftId: draft.draftId, title: 'Design', markdown: '# Full content', rationale: 'Reviewed', sourceNoteRefs: [{ uri: uri(), sourceHash: 'forged' }] }
    const candidate = await knowledgeReviewService.proposeNoteWiki(request)
    expect(candidate.sourceNoteRefs).toEqual([{ uri: uri(), sourceHash: hash(raw) }, { uri: uri(b), sourceHash: hash(note(b)) }])
    expect((await apply(candidate)).applied?.page?.sourceNoteRefs).toEqual(candidate.sourceNoteRefs)
  })

  it('reports fresh, changed and missing without rewriting recorded hashes or index', async () => {
    await apply(await propose())
    const original = await page(); const before = await stored()
    expect((await wikiSourceStatuses(root, original.sourceNoteRefs))[0].status).toBe('fresh')
    await source(a, note(a, 'Changed'))
    expect((await noteWikiPages(root, uri()))[0].sources[0].status).toBe('changed')
    await rm(join(root, '.agents', 'notes', a + '.md'))
    expect((await wikiSourceStatuses(root, original.sourceNoteRefs))[0].status).toBe('missing')
    expect(await stored()).toBe(before)
  })

  it('reports unbound, ambiguous bindings, duplicate identities, and unknown provenance distinctly', async () => {
    expect((await readWikiNote(root, uri(a, other))).status).toBe('unbound')
    const cross = await checkout(other)
    await harnessNoteService.setBinding(root, { repoId: other, checkoutId: 'one', path: cross, selected: false })
    await harnessNoteService.setBinding(root, { repoId: other, checkoutId: 'two', path: root, selected: false })
    expect((await readWikiNote(root, uri(a, other))).status).toBe('ambiguous')
    await writeFile(join(root, '.agents', 'notes', 'duplicate.md'), note())
    expect((await readWikiNote(root, uri())).status).toBe('ambiguous')
    expect((await wikiSourceStatuses(root))[0]).toMatchObject({ status: 'unknown', detail: 'Note sources not recorded' })
    expect((await wikiSourceStatuses(root, [{ uri: uri(), sourceHash: '' }]))[0].status).toBe('unknown')
  })

  it('resolves same Note id across repositories only via explicit selected checkout', async () => {
    const cross = await checkout(other); await source(a, note(a, 'Foreign'), cross)
    await harnessNoteService.setBinding(root, { repoId: other, checkoutId: 'cross', path: cross, selected: true })
    expect((await readWikiNote(root, uri(a, other))).currentHash).toBe(hash(note(a, 'Foreign')))
    expect((await readWikiNote(root, uri())).currentHash).toBe(hash(note()))
  })

  it('requires a new source review when source changes while composing', async () => {
    const draft = await prepareNoteWiki({ rootPath: root, uris: [uri()], pageSlug: 'design', reviewMode: 'full-page', expectedVersion: 0 })
    await source(a, note(a, 'Changed'))
    await expect(knowledgeReviewService.proposeNoteWiki({ draftId: draft.draftId, title: 'Page', markdown: 'Content', rationale: 'Read' })).rejects.toThrow('new proposal')
  })

  it('does not claim a missing source when the scan is incomplete or reading fails', async () => {
    await harnessNoteService.rescan(root)
    const snapshot = await harnessNoteService.readSnapshot(root)
    const readSnapshot = vi.spyOn(harnessNoteService, 'readSnapshot')
    readSnapshot.mockResolvedValue({ ...snapshot, entries: [], coverage: { ...snapshot.coverage, status: 'incomplete' } })
    expect(await readWikiNote(root, uri())).toMatchObject({ status: 'unknown', detail: expect.stringContaining('incomplete') })
    readSnapshot.mockResolvedValue(snapshot)
    vi.spyOn(harnessNoteService, 'readNote').mockRejectedValue(Object.assign(new Error('Read failed after scan'), { code: 'NOT_FOUND' }))
    expect(await readWikiNote(root, uri())).toMatchObject({ status: 'unknown', detail: 'Read failed after scan' })
  })
})

describe('R3 wiki review transactions', () => {
  it('rejects incremental conflicting hashes and preserves old page, refs and proposed status', async () => {
    await apply(await propose()); const original = await page(); const before = await stored()
    await source(a, note(a, 'Changed'))
    const patch = await propose({ mode: 'incremental', version: 1, markdown: 'Small addition' })
    await expect(apply(patch)).rejects.toThrow('full-page review is required')
    expect(await page()).toEqual(original); expect(await stored()).toBe(before)
    expect((await candidates()).find(c => c.id === patch.id)?.status).toBe('proposed')
  })

  it('allows full-page review to replace all content and update all hashes, preserving fact ids', async () => {
    await source(b); await apply(await propose({ uris: [uri(), uri(b)] }))
    const index = JSON.parse(await stored()); index.pages[0].sourceFactIds = ['fact-1']
    await writeFile(join(knowledge, 'wiki', 'pages-index.json'), JSON.stringify(index))
    await source(a, note(a, 'New A')); await source(b, note(b, 'New B'))
    const replacement = await propose({ version: 1, uris: [uri()], markdown: '# Entirely reviewed replacement' })
    expect(replacement.sourceNoteRefs).toHaveLength(2)
    await apply(replacement)
    expect(await page()).toMatchObject({ markdown: '# Entirely reviewed replacement\n', version: 2, sourceFactIds: ['fact-1'], sourceNoteRefs: [{ uri: uri(), sourceHash: hash(note(a, 'New A')) }, { uri: uri(b), sourceHash: hash(note(b, 'New B')) }] })
  })

  it('rejects page version races and source changes between proposal and apply', async () => {
    await apply(await propose())
    const first = await propose({ version: 1 }); const concurrent = await propose({ version: 1 })
    await apply(first)
    await expect(apply(concurrent)).rejects.toThrow('version changed')
    const changedSource = await propose({ version: 2 })
    await source(a, note(a, 'After proposal'))
    const before = await stored()
    await expect(apply(changedSource)).rejects.toThrow('changed')
    expect(await stored()).toBe(before)
  })

  it('keeps same slug in separate workspaces and derives reverse links for both', async () => {
    const second = await checkout(); await source(a, note(a, 'Second checkout'), second)
    await apply(await propose()); await apply(await propose({ root: second, markdown: '# Other workspace' }))
    const index = JSON.parse(await stored())
    expect(new Set(index.pages.map((p: { relativePath: string }) => p.relativePath)).size).toBe(2)
    const links = await noteWikiPages(root, uri())
    expect(links).toHaveLength(2)
    expect(links.every(link => link.sources[0].status === 'fresh')).toBe(true)
    await knowledgeOperationsService.revoke({ kind: 'wiki', id: 'design', workspaceId: second })
    expect((await knowledgeTruthService.list()).wikiPages.map(p => p.workspaceId)).toEqual([root])
  })

  it('reads legacy relative paths and reports sources not recorded', async () => {
    await mkdir(join(knowledge, 'wiki', 'pages'), { recursive: true })
    const legacy: Omit<WikiPage, 'markdown'> & { relativePath: string } = { slug: 'design', title: 'Legacy', relativePath: 'wiki/pages/legacy.md', tags: [], status: 'published', sourceFactIds: ['old-fact'], workspaceId: root, version: 4, updatedAt: '2026-09-25' }
    await writeFile(join(knowledge, legacy.relativePath), '# Legacy full content')
    await writeFile(join(knowledge, 'wiki', 'pages-index.json'), JSON.stringify({ version: 1, pages: [legacy] }))
    expect((await page()).markdown).toBe('# Legacy full content')
    expect((await wikiSourceStatuses(root, (await page()).sourceNoteRefs))[0].status).toBe('unknown')
    await apply(await propose({ version: 4 }))
    expect(JSON.parse(await stored()).pages[0].relativePath).toBe(legacy.relativePath)
    expect((await page()).sourceFactIds).toEqual(['old-fact'])
  })

  it('rolls full page content, index and candidate back after audit failure', async () => {
    await apply(await propose()); const beforePage = await page(); const beforeIndex = await stored()
    await source(a, note(a, 'New'))
    const candidate = await propose({ version: 1, markdown: '# Replacement' })
    vi.mocked(knowledgeAuditService.recordBatch).mockRejectedValueOnce(new Error('audit unavailable'))
    await expect(apply(candidate)).rejects.toThrow('audit unavailable')
    expect(await page()).toEqual(beforePage); expect(await stored()).toBe(beforeIndex)
    expect((await candidates()).find(c => c.id === candidate.id)?.status).toBe('proposed')
  })

  it('rolls back archive metadata if audit fails and serializes archive with review', async () => {
    await apply(await propose()); const before = await stored()
    vi.mocked(knowledgeAuditService.record).mockRejectedValueOnce(new Error('archive audit failed'))
    await expect(knowledgeOperationsService.revoke({ kind: 'wiki', id: 'design', workspaceId: root })).rejects.toThrow('archive audit failed')
    expect(await stored()).toBe(before)
    expect((await wikiWorkspace(root)).workspaceId).toBe(root)
  })
})
