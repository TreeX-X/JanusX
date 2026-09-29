import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { MemoryFact } from '../../../src/shared/knowledge'
import { decayHabitStrength, memoryStrength, MEMORY_ACCESS_COOLDOWN_MS } from '../../../src/shared/memory-strength'
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
import { recordUserMemoryAccess, containsMemoryDelivery, trackMemoryStream } from '../../../src/main/knowledge/memory-access'
import { replacementHash } from '../../../src/main/knowledge/fact-conflicts'
import { reviewedFactHash } from '../../../src/main/knowledge/profile-projection'
import { userProfileService } from '../../../src/main/knowledge/user-profile-service'
import { searchUserMemory } from '../../../src/main/knowledge/user-recall-service'
import { forgetPersonalMemory } from '../../../src/main/knowledge/personal-memory-forgetting'
import * as atomic from '../../../src/main/lib/atomic-file'
import { userMemorySearchTool } from '../../../src/main/agent/runtime/tools/user-memory-tools'

const originalRoot = process.env.JANUSX_KNOWLEDGE_ROOT
const now = Date.parse('2026-09-29T00:00:00Z')
let root: string
let fact: MemoryFact
const receipt = (capturedAt = now) => ({ capturedAt, section: 'memory section', facts: [{ id: fact.id, hash: replacementHash(fact) }] })
const save = (facts: unknown[] = [fact]) => writeFile(join(root, 'facts/facts.jsonl'), facts.map(f => JSON.stringify(f)).join('\n'))
const read = async (): Promise<MemoryFact> => JSON.parse(await readFile(join(root, 'facts/facts.jsonl'), 'utf8'))
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'janusx-access-'))
  process.env.JANUSX_KNOWLEDGE_ROOT = root
  await mkdir(join(root, 'facts'))
  fact = { id: 'personal', content: 'Prefer pnpm', scope: 'user', kind: 'preference', status: 'active', version: 1,
    concepts: [], files: [], tags: [], confidence: 0.8, habitStrength: 0.6,
    provenance: { workspaceId: 'user', workspaceName: 'user', workspacePath: '', actor: 'test', source: 'manual',
      sourceObservationIds: [], fileRefs: [], createdAt: '2026-09-28T00:00:00.000Z' } }
  fact.confirmation = { kind: 'human-review', contentHash: reviewedFactHash(fact), confirmedAt: fact.provenance.createdAt }
  await save()
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
  if (originalRoot === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT
  else process.env.JANUSX_KNOWLEDGE_ROOT = originalRoot
})

describe('personal memory delivery lifecycle', () => {
  it('decays from a fixed anchor with restart equivalence and bounded values', () => {
    const anchor = new Date(now).toISOString()
    const later = now + 30 * 86400000
    expect(decayHabitStrength(0.8, anchor, later)).toBe(0.4)
    expect(decayHabitStrength(0.8, anchor, now - 1)).toBe(0.8)
    expect(decayHabitStrength(2, anchor, now)).toBe(1)
    expect(decayHabitStrength(-1, anchor, now)).toBe(0)
    expect(memoryStrength(JSON.parse(JSON.stringify(fact)), later)).toBe(memoryStrength(fact, later))
    expect(decayHabitStrength(0.4, new Date(later).toISOString(), later + 30 * 86400000)).toBe(decayHabitStrength(0.8, anchor, later + 30 * 86400000))
  })

  it('deduplicates delivery, respects cooldown and preserves evidence and profile identity', async () => {
    const profile = await userProfileService.load()
    const delivery = receipt()
    delivery.facts.push(...delivery.facts)
    expect(await recordUserMemoryAccess(delivery, 'request', now)).toBe(1)
    const first = await read()
    expect(first.recallState!.strength).toBeCloseTo(memoryStrength(fact, now) + 0.15)
    const { recallState: _state, ...evidence } = first
    expect(evidence).toEqual(fact)
    expect(replacementHash(first)).toBe(replacementHash(fact))
    expect(reviewedFactHash(first)).toBe(reviewedFactHash(fact))
    expect(await userProfileService.load()).toEqual(profile)
    expect(await recordUserMemoryAccess(receipt(now + 1), 'request', now + 1)).toBe(0)
    await recordUserMemoryAccess(receipt(now + 2), 'second', now + 2)
    expect((await read()).recallState).toMatchObject({ strength: first.recallState!.strength, anchorAt: first.recallState!.anchorAt })
    await recordUserMemoryAccess(receipt(now + MEMORY_ACCESS_COOLDOWN_MS), 'third', now + MEMORY_ACCESS_COOLDOWN_MS)
    expect((await read()).recallState!.strength).toBeGreaterThan(first.recallState!.strength)
  })

  it('bounds request history and rejects replay after history rolls over', async () => {
    for (let index = 0; index < 66; index++) await recordUserMemoryAccess(receipt(now + index), `r${index}`, now + index)
    expect((await read()).recallState!.recentRequests).toHaveLength(64)
    expect(await recordUserMemoryAccess(receipt(), 'r0', now + MEMORY_ACCESS_COOLDOWN_MS)).toBe(0)
  })

  it.each(['stale', 'expired', 'project', 'unconfirmed', 'archived', 'duplicate', 'forgotten', 'aborted'])('does not reinforce %s facts', async kind => {
    const delivery = receipt()
    if (kind === 'stale') fact.content = 'Prefer npm'
    if (kind === 'expired') fact.ttl = new Date(now - 1).toISOString()
    if (kind === 'project') fact.scope = 'project'
    if (kind === 'unconfirmed') delete fact.confirmation
    if (kind === 'archived') fact.status = 'archived'
    await save(kind === 'duplicate' ? [fact, fact] : [fact])
    if (kind === 'forgotten') await forgetPersonalMemory({ targetId: fact.id, targetHash: reviewedFactHash(fact) })
    const before = await readFile(join(root, 'facts/facts.jsonl'), 'utf8')
    expect(await recordUserMemoryAccess(delivery, 'r', now, kind === 'aborted' ? AbortSignal.abort() : undefined)).toBe(0)
    expect(await readFile(join(root, 'facts/facts.jsonl'), 'utf8')).toBe(before)
  })

  it.each(['json', 'state', 'write'])('preserves storage on %s failure', async kind => {
    if (kind === 'json') await writeFile(join(root, 'facts/facts.jsonl'), '{bad json')
    if (kind === 'state') await save([{ ...fact, recallState: { strength: 9 } }])
    if (kind === 'write') vi.spyOn(atomic, 'writeFileAtomic').mockRejectedValueOnce(new Error('disk failure'))
    const before = await readFile(join(root, 'facts/facts.jsonl'), 'utf8')
    await expect(recordUserMemoryAccess(receipt(), 'r', now)).rejects.toThrow()
    expect(await readFile(join(root, 'facts/facts.jsonl'), 'utf8')).toBe(before)
  })

  it('keeps search read-only and receipts limited to deduplicated budgeted valid facts', async () => {
    const before = await readFile(join(root, 'facts/facts.jsonl'), 'utf8')
    const deps = { nowMs: () => now, listUserFacts: async () => [fact, fact, { ...fact, id: 'expired', ttl: new Date(now - 1).toISOString() }],
      loadProfile: async () => ({ version: 1, updatedAt: new Date(now).toISOString() }), listActiveEpisodes: async () => [] }
    const result = await searchUserMemory('pnpm', deps)
    expect(result.items).toHaveLength(1)
    expect(result.delivery!.facts.map(ref => ref.id)).toEqual([fact.id])
    const clipped = await searchUserMemory('pnpm', deps, { maxChars: 1 })
    expect(clipped.delivery!.facts).toEqual([])
    expect(await readFile(join(root, 'facts/facts.jsonl'), 'utf8')).toBe(before)
  })

  it('records the final memory tool output and skips aborted invocations', async () => {
    const context = { workspaceId: 'user', workspaceRoot: root, signal: new AbortController().signal }
    await userMemorySearchTool.execute({ query: 'pnpm' }, { ...context, signal: AbortSignal.abort() })
    expect((await read()).recallState).toBeUndefined()
    const output = await userMemorySearchTool.execute({ query: 'pnpm' }, context)
    expect(output).toMatchObject({ matches: [expect.objectContaining({ content: fact.content })] })
    expect((await read()).recallState).toBeDefined()
  })

  it('requires the full section and actual provider output, recording only once', async () => {
    expect(containsMemoryDelivery([{ content: 'memory sec' }], receipt())).toBe(false)
    expect(containsMemoryDelivery([{ content: [{ type: 'text', text: 'prefix memory section' }] }], receipt())).toBe(true)
    const delivered = vi.fn(async () => {})
    const result = trackMemoryStream({ fullStream: (async function* () {
      yield { type: 'start' }
      yield { type: 'text-delta', text: '' }
      expect(delivered).not.toHaveBeenCalled()
      yield { type: 'text-delta', textDelta: 'hi' }
      yield { type: 'tool-call' }
    })() }, delivered)
    expect(delivered).not.toHaveBeenCalled()
    for await (const _part of result.fullStream) { /* consume */ }
    expect(delivered).toHaveBeenCalledTimes(1)
    const failed = trackMemoryStream({ textStream: (async function* () { throw new Error('provider failed'); yield '' })() }, delivered)
    await expect(async () => { for await (const _part of failed.textStream) { /* consume */ } }).rejects.toThrow('provider failed')
    expect(delivered).toHaveBeenCalledTimes(1)
  })
})
