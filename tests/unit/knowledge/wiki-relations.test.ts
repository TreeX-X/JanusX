import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CandidateWikiPatch, WikiPage, WikiPageRelation, MemoryFact } from '../../../src/shared/knowledge'
import { wikiPageUri } from '../../../src/shared/wiki-relations'
import { reviewCandidateInput } from '../../../src/shared/review-candidate-snapshot'
import { knowledgeReviewService, proposeDerivedCandidates } from '../../../src/main/knowledge/review-service'
import { knowledgeTruthService } from '../../../src/main/knowledge/truth-service'
import { knowledgeAuditService } from '../../../src/main/knowledge/audit-service'
import { bindWikiReferences, normalizeWikiRelations, wikiMarkdownTargets, wikiTarget } from '../../../src/main/knowledge/wiki-relations'
import { readWikiRevision, listWikiHistory } from '../../../src/main/knowledge/wiki-history'
import { groupWikiTopics } from '../../../src/main/knowledge/wiki-topics'
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
let root: string, serial = 0
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'wiki-relations-')); vi.stubEnv('JANUSX_KNOWLEDGE_ROOT', root) })
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }) })
function patch(slug: string, markdown: string, version = 0, workspaceId = 'project'): CandidateWikiPatch {
  return { id: `patch-${serial++}`, type: 'wiki-patch', status: 'proposed', pageSlug: slug, title: slug, patchMarkdown: markdown,
    rationale: 'Reviewed sources', sourceFactIds: [], reviewMode: 'full-page', expectedVersion: version, confidence: 0,
    derivation: 'llm', evidence: { observationIds: [] }, provenance: { workspaceId, workspacePath: '', workspaceName: workspaceId,
      source: 'manual', actor: 'tester', createdAt: new Date().toISOString(), sourceObservationIds: [], fileRefs: [] } }
}
async function publish(candidate: CandidateWikiPatch): Promise<WikiPage> {
  await proposeDerivedCandidates([candidate])
  return (await knowledgeReviewService.applyCandidate(await reviewCandidateInput(candidate))).applied!.page!
}
async function referenced(target: WikiPage, slug = 'source') {
  const markdown = `Read [the target](${wikiPageUri(target.workspaceId, target.slug)}).`
  return { ...patch(slug, markdown), relations: bindWikiReferences(markdown, 'project', slug, [target]) }
}
describe('Wiki relationships publish with their page', () => {
  it('keeps drafts out of truth and publishes body, relationships and history in the same version', async () => {
    const target = await publish(patch('target', 'Target instructions'))
    const draft = await referenced(target)
    await proposeDerivedCandidates([draft])
    expect((await knowledgeTruthService.list()).wikiPages.map(page => page.slug)).toEqual(['target'])
    const page = await publish(draft)
    expect(page.relations).toEqual(draft.relations)
    expect((await readWikiRevision({ workspaceId: 'project', slug: 'source', version: 1 })).page.relations).toEqual(draft.relations)
    expect((await knowledgeTruthService.list()).wikiPages.find(page => page.slug === 'source')?.relationIssues).toEqual([])
    await expect(readFile(join(root, 'graph/candidates.jsonl'))).rejects.toMatchObject({ code: 'ENOENT' })
    await publish({ ...draft, id: `duplicate-${serial++}`, expectedVersion: 1 })
    expect((await listWikiHistory({ workspaceId: 'project', slug: 'source' })).total).toBe(1)
  })
  it('binds approval to the relation snapshot and rejects a changed target before writing', async () => {
    const target = await publish(patch('target', 'Before'))
    const draft = await referenced(target)
    const input = await reviewCandidateInput(draft)
    draft.relations[0]!.reason = 'Changed relation rationale'
    await proposeDerivedCandidates([draft])
    await expect(knowledgeReviewService.applyCandidate(input)).rejects.toThrow('changed')
    await publish(patch('target', 'After', 1))
    await expect(knowledgeReviewService.applyCandidate(await reviewCandidateInput(draft))).rejects.toThrow('wiki-relation-target-changed')
    expect((await knowledgeTruthService.list()).wikiPages).toHaveLength(1)
  })
  it('marks published references changed while keeping body available and restores no failed relations', async () => {
    const target = await publish(patch('target', 'Before'))
    const draft = await referenced(target)
    await publish(draft)
    await publish(patch('target', 'After', 1))
    const source = (await knowledgeTruthService.list()).wikiPages.find(page => page.slug === 'source')!
    expect(source.relationIssues).toEqual([{ targetSlug: 'target', type: 'references', status: 'changed' }])
    expect(source.markdown).toBe(draft.patchMarkdown + '\n')
    const fresh = (await knowledgeTruthService.list()).wikiPages.find(page => page.slug === 'target')!
    const next = { ...await referenced(fresh), expectedVersion: 1 }
    vi.spyOn(knowledgeAuditService, 'recordBatch').mockRejectedValueOnce(new Error('audit failed'))
    await expect(publish(next)).rejects.toThrow('audit failed')
    expect((await readWikiRevision({ workspaceId: 'project', slug: 'source', version: 1 })).page.relations).toEqual(draft.relations)
    expect((await listWikiHistory({ workspaceId: 'project', slug: 'source' })).total).toBe(1)
  })
  it('rejects cross-workspace, self, unavailable and unbound references', async () => {
    const foreign = await publish(patch('target', 'Other', 0, 'other'))
    expect(() => bindWikiReferences(`[x](${wikiPageUri('other', 'target')})`, 'project', 'source', [foreign])).toThrow('unavailable')
    const target = await publish(patch('target', 'Here'))
    expect(() => bindWikiReferences(`[x](${wikiPageUri('project', 'target')})`, 'project', 'target', [target])).toThrow('unavailable')
    await expect(publish(patch('source', `[x](${wikiPageUri('project', 'target')})`))).rejects.toThrow('unbound')
    const draft = await referenced(target)
    draft.relations[0]!.target.slug = 'missing'
    await expect(publish(draft)).rejects.toThrow('target-missing')
  })
  it('includes relationship-only changes in revisions and preserves direction', async () => {
    const target = await publish(patch('target', 'Here'))
    const draft = await referenced(target)
    await publish(draft)
    await publish({ ...draft, id: `new-${serial++}`, expectedVersion: 1, relations: [{ ...draft.relations[0]!, reason: 'A different reviewed rationale' }] })
    expect((await listWikiHistory({ workspaceId: 'project', slug: 'source' })).total).toBe(2)
    const source = (await knowledgeTruthService.list()).wikiPages.find(page => page.slug === 'source')!
    const reverse = await referenced(source, 'target'); reverse.expectedVersion = 1
    await publish(reverse)
    expect((await knowledgeTruthService.list()).wikiPages.find(page => page.slug === 'target')?.relations?.[0]?.target.slug).toBe('source')
  })
  it('serializes competing publications against the same page version', async () => {
    const target = await publish(patch('target', 'Here'))
    const left = await referenced(target), right = await referenced(target)
    right.relations[0]!.reason = 'Alternative reviewed rationale'
    await proposeDerivedCandidates([left, right])
    const results = await Promise.allSettled([left, right].map(async candidate => knowledgeReviewService.applyCandidate(await reviewCandidateInput(candidate))))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect((await listWikiHistory({ workspaceId: 'project', slug: 'source' })).total).toBe(1)
    expect((await knowledgeTruthService.list()).wikiPages.find(page => page.slug === 'source')?.relations).toHaveLength(1)
  })
})
describe('Wiki topic and reference contracts', () => {
  it('parses explicit inline and reference links without creating links from code, images or mentions', () => {
    const uri = wikiPageUri('project', 'folder/page')
    expect(wikiMarkdownTargets(`[target](${uri})\n\n[again][ref]\n\n[ref]: ${uri}\n\n\`[x](wiki://bad/target)\`\n\n![image](wiki://bad/image)`)).toEqual([{ workspaceId: 'project', slug: 'folder/page' }])
    expect(wikiMarkdownTargets('target shared-file.ts')).toEqual([])
    expect(() => wikiMarkdownTargets('[broken](wiki://project/bad/path)')).toThrow('invalid')
  })
  it('deduplicates exact relations but never collapses different directions or semantics', () => {
    const target = { workspaceId: 'project', slug: 'target', title: 'Target', version: 1, contentHash: 'a'.repeat(64) }
    const edge: WikiPageRelation = { type: 'depends_on', target, reason: 'Supported', sourceFactIds: ['fact'] }
    expect(normalizeWikiRelations([edge, edge])).toHaveLength(1)
    expect(normalizeWikiRelations([edge, { ...edge, type: 'conflicts_with' }])).toHaveLength(2)
    expect(() => normalizeWikiRelations([edge, { ...edge, reason: 'Other' }])).toThrow('conflicting-duplicate')
  })
  it('splits new concepts, merges matching topics and preserves existing or manually owned page identities', () => {
    const fact = (id: string, concept: string) => ({ id, kind: 'procedure', concepts: [concept], provenance: { workspaceId: 'project' } }) as MemoryFact
    const input = [fact('a', 'Backup'), fact('b', 'Deploy'), fact('c', ' backup ')]
    const groups = groupWikiTopics(input, [])
    expect(groups).toHaveLength(2)
    expect(groups.find(group => group.facts.some(item => item.id === 'a'))?.facts.map(item => item.id)).toEqual(['a', 'c'])
    expect(groupWikiTopics([...input].reverse(), []).map(group => group.slug)).toEqual(groups.map(group => group.slug))
    const legacy = { workspaceId: 'project', slug: 'handbook', title: 'Renamed handbook', sourceFactIds: ['a'], managed: false } as WikiPage
    const owned = groupWikiTopics(input, [legacy]).find(group => group.slug === 'handbook')!
    expect(owned.title).toBe('Renamed handbook'); expect(owned.facts.map(item => item.id)).toEqual(['a', 'c'])
    expect(owned.page?.managed).toBe(false)
    expect(wikiTarget({ ...legacy, version: 1, markdown: '', tags: [] }).slug).toBe('handbook')
  })
  it('blocks publication when a target source is withdrawn', async () => {
    const source = { id: 'fact', content: 'Current policy', concepts: [], files: [], tags: [], kind: 'fact', scope: 'project', status: 'active', version: 1, confidence: 0,
      provenance: patch('seed', 'seed').provenance } as MemoryFact
    await mkdir(join(root, 'facts')); await writeFile(join(root, 'facts/facts.jsonl'), JSON.stringify(source) + '\n')
    const target = await publish({ ...patch('target', 'Policy'), sourceFactIds: ['fact'] })
    const draft = await referenced(target)
    await writeFile(join(root, 'facts/facts.jsonl'), JSON.stringify({ ...source, status: 'archived' }) + '\n')
    await expect(publish(draft)).rejects.toThrow('wiki-relation-target-stale')
    expect((await knowledgeTruthService.list()).wikiPages).toHaveLength(0)
  })
})
