import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CandidateFact, MemoryFact } from '../../../src/shared/knowledge'
import { canMergeFactText, factSlot, slotsConflict } from '../../../src/shared/fact-slot'
import { reviewCandidateInput } from '../../../src/shared/review-candidate-snapshot'
import { knowledgeReviewService as service } from '../../../src/main/knowledge/review-service'
import { knowledgeAuditService } from '../../../src/main/knowledge/audit-service'
import { factReviewContext, replacementHash } from '../../../src/main/knowledge/fact-conflicts'

let root: string
const oldRoot = process.env.JANUSX_KNOWLEDGE_ROOT
const fact = (id: string, content: string, scope: 'user' | 'project' = 'project'): MemoryFact => ({
  id, content, scope, kind: 'preference', status: 'active', version: 1, concepts: [], files: [], tags: [], confidence: 0.7,
  provenance: { workspaceId: scope === 'user' ? 'user' : 'project-a', workspaceName: 'test', workspacePath: '', source: 'manual',
    actor: 'test', createdAt: '2026-09-29T00:00:00Z', sourceObservationIds: [], fileRefs: [] },
})
const candidate = (id: string, content: string): CandidateFact => ({ id, type: 'fact', status: 'proposed', derivation: 'deterministic',
  fact: { ...fact(`fact-${id}`, content), status: 'proposed' }, evidence: { observationIds: [] },
})
async function seed(facts: MemoryFact[], candidates: CandidateFact[]) {
  await writeFile(join(root, 'facts/facts.jsonl'), facts.map(item => JSON.stringify(item)).join('\n'))
  await writeFile(join(root, 'facts/candidates.jsonl'), candidates.map(item => JSON.stringify(item)).join('\n'))
}
async function truths(): Promise<MemoryFact[]> { return (await readFile(join(root, 'facts/facts.jsonl'), 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line)) }

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'janusx-conflict-')); process.env.JANUSX_KNOWLEDGE_ROOT = root
  await mkdir(join(root, 'facts'))
})
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); if (oldRoot === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT; else process.env.JANUSX_KNOWLEDGE_ROOT = oldRoot })

describe('explicit fact slots', () => {
  it('recognizes labels and language aliases without inferring prose or temporary instructions', () => {
    expect(factSlot('默认输出语言：中文')?.value).toBe('zh')
    expect(factSlot('default output language: Chinese')?.value).toBe('zh')
    expect(factSlot('这次默认输出语言用中文')).toBeUndefined()
    expect(factSlot('default output language: Klingon')).toBeUndefined()
    expect(factSlot('发布命令: npm run release\n暂时不用')).toBeUndefined()
    expect(factSlot('发布命令：不要发布')).toBeUndefined()
  })
  it('preserves command parameters and polarity when detecting conflicts and merge eligibility', () => {
    expect(slotsConflict('发布命令: npm run release', '发布命令: npm run release --dry-run')).toBe(true)
    expect(canMergeFactText('发布命令: npm run release', '发布命令: npm run release --dry-run')).toBe(false)
    expect(slotsConflict('默认输出语言: 中文', 'default output language: Chinese')).toBe(false)
    expect(slotsConflict('默认输出语言 != 中文', '默认输出语言: 中文')).toBe(true)
    expect(slotsConflict('默认输出语言 != 中文', '默认输出语言: 英文')).toBe(false)
    expect(slotsConflict('默认输出语言 != 中文', '默认输出语言 != 英文')).toBe(false)
  })
})

describe('fact review conflicts', () => {
  it.each(['different', 'identical', 'archived', 'foreign'] as const)('preserves a truth ID collision (%s)', async variant => {
    const next = candidate('next', 'New content')
    const original = fact(next.fact.id, variant === 'identical' ? next.fact.content : 'Original content', variant === 'foreign' ? 'user' : 'project')
    if (variant === 'archived') original.status = 'archived'
    await seed([original], [next])
    const input = await reviewCandidateInput(next)
    expect((await service.factReviewContext(input)).blocked).toBe('id-collision')
    await expect(service.applyCandidate(input)).rejects.toThrow('Fact ID already exists')
    expect(await truths()).toEqual([original])
  })
  it('groups competing values by slot and domain without leaking other owners', async () => {
    const next = candidate('next', '默认输出语言: 英文')
    const peer = candidate('peer', '默认输出语言: 中文')
    const foreign = fact('private', '默认输出语言: 中文', 'user')
    const otherOwner = { ...fact('other-owner', '默认输出语言: 中文'), ownerUserId: 'someone-else' }
    await seed([foreign, otherOwner], [next, peer, { ...peer, id: 'private-peer', fact: foreign }])
    const context = await service.factReviewContext(await reviewCandidateInput(next))
    expect(context.factKey).toBe('response.language')
    expect(context.targets).toEqual([])
    expect(context.competing.map(item => item.id)).toEqual(['peer'])
  })
  it('requires explicit replacement and persists the new version and host-derived slot', async () => {
    const old = fact('old', '默认输出语言: 中文'), next = candidate('next', '默认输出语言: 英文')
    await seed([old], [next])
    const input = await reviewCandidateInput(next)
    await expect(service.applyCandidate(input)).rejects.toThrow('explicit replacement')
    const context = await service.factReviewContext(input)
    const target = context.targets[0]
    const request = { ...input, replacement: { id: target.id, hash: target.hash } }
    const applied = await service.applyCandidate(request)
    expect(applied.applied?.fact).toMatchObject({ version: 2, supersedes: 'old', status: 'active', factKey: 'response.language', cardinality: 'single', polarity: 'positive' })
    expect((await truths()).find(item => item.id === 'old')?.status).toBe('archived')
    expect((await service.applyCandidate(request)).auditEvents).toEqual([])
  })
  it('rejects a replaced target that changed after its content was displayed', async () => {
    const old = fact('old', '发布命令: npm run release'), next = candidate('next', '发布命令: pnpm run release')
    await seed([old], [next])
    const input = { ...await reviewCandidateInput(next), replacement: { id: old.id, hash: replacementHash(old) } }
    const changed = { ...old, version: 2, content: '发布命令: npm run release --dry-run' }
    await seed([changed], [next])
    await expect(service.applyCandidate(input)).rejects.toThrow('target changed')
    expect(await truths()).toEqual([changed])
  })
  it('requires target review even when the model supplies supersedes', async () => {
    const old = fact('old', 'Old arbitrary fact'), next = candidate('next', 'New arbitrary fact')
    next.fact.supersedes = old.id
    await seed([old], [next])
    await expect(service.applyCandidate(await reviewCandidateInput(next))).rejects.toThrow('not explicitly reviewed')
    expect((await service.factReviewContext(await reviewCandidateInput(next))).targets[0].content).toBe(old.content)
  })
  it('rejects unrelated, cross-domain, and ambiguous replacements', async () => {
    const next = candidate('next', '默认输出语言: 英文'), unrelated = fact('other', 'Unrelated fact')
    await seed([unrelated], [next])
    await expect(service.applyCandidate({ ...await reviewCandidateInput(next), replacement: { id: unrelated.id, hash: replacementHash(unrelated) } })).rejects.toThrow('not a current conflict')
    const foreign = fact('private', '默认输出语言: 中文', 'user')
    expect(factReviewContext({ ...next, fact: { ...next.fact, supersedes: foreign.id } }, [foreign], []).blocked).toBe('invalid-target')
    const old = fact('old', '默认输出语言: 中文')
    await seed([old, { ...old, id: 'second-old' }], [next])
    expect((await service.factReviewContext(await reviewCandidateInput(next))).blocked).toBe('multiple-targets')
    await expect(service.applyCandidate({ ...await reviewCandidateInput(next), replacement: { id: old.id, hash: replacementHash(old) } })).rejects.toThrow('Multiple current facts')
  })
  it('allows only one of two competing reviews to replace the same version', async () => {
    const old = fact('old', '发布命令: npm run release'), a = candidate('a', '发布命令: pnpm run release'), b = candidate('b', '发布命令: yarn release')
    await seed([old], [a, b])
    const replacement = { id: old.id, hash: replacementHash(old) }
    const results = await Promise.allSettled([service.applyCandidate({ ...await reviewCandidateInput(a), replacement }), service.applyCandidate({ ...await reviewCandidateInput(b), replacement })])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect((await truths()).filter(item => item.status === 'active')).toHaveLength(1)
  })
  it('restores the old version when required audit persistence fails', async () => {
    const old = fact('old', '默认输出语言: 中文'), next = candidate('next', '默认输出语言: 英文')
    await seed([old], [next])
    vi.spyOn(knowledgeAuditService, 'recordBatch').mockRejectedValueOnce(new Error('audit failed'))
    await expect(service.applyCandidate({ ...await reviewCandidateInput(next), replacement: { id: old.id, hash: replacementHash(old) } })).rejects.toThrow('audit failed')
    expect(await truths()).toEqual([old])
  })

  it('rejects forged slot metadata and preserves confirmed facts', async () => {
    const next = candidate('next', 'Unstructured prose')
    next.fact.factKey = 'response.language'; next.fact.cardinality = 'single'
    await seed([], [next])
    await expect(service.applyCandidate(await reviewCandidateInput(next))).rejects.toThrow('slot metadata')
    expect(await truths()).toEqual([])
  })

  it('binds replacement to ownership and ignores retrieval-only changes', async () => {
    const original = fact('old', '默认输出语言: 中文')
    expect(replacementHash({ ...original, habitStrength: 0.9, lastSeenAt: '2026-09-30' })).toBe(replacementHash(original))
    expect(replacementHash({ ...original, ownerUserId: 'changed' })).not.toBe(replacementHash(original))
    const next = candidate('next', '默认输出语言: 英文')
    next.fact.ownerUserId = 'someone-else'; next.fact.supersedes = original.id
    await seed([original], [next])
    await expect(service.applyCandidate({ ...await reviewCandidateInput(next), replacement: { id: original.id, hash: replacementHash(original) } })).rejects.toThrow('ownership mismatch')
  })
})
