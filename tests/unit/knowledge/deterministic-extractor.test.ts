import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))

import {
  classifyDeterministic,
  clusterNearDuplicates,
  extractFileRefs,
  extractTimeTags,
  findConflicts,
  firstLine,
  normalizeObservationText,
  observationDedupeKey,
  readDerivedObservation,
  runDeterministicStage,
  tokenJaccard,
} from '../../../src/main/knowledge/deterministic-extractor'
import { knowledgeExtractService } from '../../../src/main/knowledge/extract-service'
import type { Observation } from '../../../src/shared/knowledge'

const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)

function obs(overrides: Partial<Observation> & { id: string }): Observation {
  return {
    workspaceId: 'ws-1',
    workspaceName: 'Workspace 1',
    workspacePath: 'C:\\work',
    source: 'tool',
    type: 'user-note',
    content: `content ${overrides.id}`,
    fileRefs: [],
    tags: [],
    visibility: 'workspace',
    actor: 'system',
    createdAt: '2026-09-04T00:00:00.000Z',
    retentionClass: 'evidence',
    ...overrides,
  }
}

describe('deterministic extractor (Phase 1-2)', () => {
  let root: string
  const previousKnowledgeRoot = process.env.JANUSX_KNOWLEDGE_ROOT

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'janusx-deterministic-'))
    process.env.JANUSX_KNOWLEDGE_ROOT = join(root, 'knowledge')
  })

  afterEach(async () => {
    if (previousKnowledgeRoot === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT
    else process.env.JANUSX_KNOWLEDGE_ROOT = previousKnowledgeRoot
    await rm(root, { recursive: true, force: true })
  })

  it('normalizes ANSI, control chars, secrets, and long content', () => {
    const dirty = `${ESC}[31mred${ESC}[0m text with ${BEL}control and sk-abcdefghijklmnop secret`;
    const result = normalizeObservationText(dirty)
    expect(result.text).toBe('red text with control and [REDACTED] secret')
    expect(result.truncated).toBe(false)
    expect(result.redacted).toBe(true)

    const long = normalizeObservationText('x'.repeat(5000))
    expect(long.truncated).toBe(true)
    expect(long.text).toHaveLength(4000)
  })

  it('computes stable exact-dedupe keys', () => {
    const a = obs({ id: 'a', content: 'same' })
    const b = obs({ id: 'b', content: 'same' })
    expect(observationDedupeKey(a)).toBe(observationDedupeKey(b))
    expect(observationDedupeKey({ ...a, workspaceId: 'ws-2' })).not.toBe(observationDedupeKey(a))
    expect(observationDedupeKey({ ...a, type: 'git-event' })).not.toBe(observationDedupeKey(a))
    expect(observationDedupeKey({ ...a, content: 'different' })).not.toBe(observationDedupeKey(a))
  })

  it('scores Jaccard similarity and clusters near-duplicates with newest primary', () => {
    expect(tokenJaccard('same text here', 'same text here')).toBe(1)
    expect(tokenJaccard('apple banana', 'cherry durian elderberry fig')).toBe(0)
    const groups = clusterNearDuplicates(
      [
        { id: 'old', text: 'fix login bug in auth module today', at: '2026-09-04T00:01:00.000Z' },
        { id: 'new', text: 'fix login bug in auth module today again', at: '2026-09-04T00:02:00.000Z' },
        { id: 'other', text: 'unrelated deployment notes for friday', at: '2026-09-04T00:03:00.000Z' },
      ],
      (item) => item.text,
    )
    expect(groups).toHaveLength(2)
    expect(groups[0]?.members.map((m) => m.id)).toEqual(['old', 'new'])
    expect(groups[0]?.primary.id).toBe('new')
    expect(groups[1]?.primary.id).toBe('other')
  })

  it('classifies the four high-precision patterns and ignores the rest', () => {
    expect(classifyDeterministic('git-event', 'commit abc', 0)).toEqual({ kind: 'fact', confidence: 0.9 })
    expect(classifyDeterministic('checkpoint-event', 'snap', 0)).toEqual({ kind: 'fact', confidence: 0.9 })
    expect(classifyDeterministic('user-note', '决定：采用软删除方案', 0)).toEqual({ kind: 'decision', confidence: 0.7 })
    expect(classifyDeterministic('user-note', 'we decided to use sqlite instead of pg', 0)).toEqual({
      kind: 'decision',
      confidence: 0.7,
    })
    expect(classifyDeterministic('user-note', '我习惯用 pnpm', 0)).toEqual({ kind: 'preference', confidence: 0.7 })
    expect(classifyDeterministic('tool-result', '$ npm run build\nerror TS2304: boom', 5)).toEqual({
      kind: 'procedure',
      confidence: 0.8,
    })
    expect(classifyDeterministic('tool-result', '$ npm run build\nerror TS2304: boom', 2)).toBeNull()
    expect(classifyDeterministic('user-note', '今天天气不错', 0)).toBeNull()
  })

  it('extracts file refs, time tags, and first lines', () => {
    expect(extractFileRefs('see src/db.ts and C:\\work\\a\\b.js for details')).toEqual(
      expect.arrayContaining(['src/db.ts']),
    )
    expect(extractTimeTags('shipped on 2026-09-04 at last')).toEqual(['2026-09-04'])
    expect(firstLine('\n\n  hello world  \nsecond')).toBe('hello world')
  })

  it('marks conflicts only on same workspace + kind + overlap + different content', () => {
    const truth = [
      { id: 't1', content: 'old', concepts: [], files: ['src/db.ts'], workspaceId: 'ws-1', kind: 'fact' as const },
      { id: 't2', content: 'new', concepts: [], files: ['src/db.ts'], workspaceId: 'ws-1', kind: 'fact' as const },
      { id: 't3', content: 'old', concepts: [], files: ['src/db.ts'], workspaceId: 'ws-2', kind: 'fact' as const },
      { id: 't4', content: 'old', concepts: [], files: ['src/db.ts'], workspaceId: 'ws-1', kind: 'decision' as const },
    ]
    const base = { workspaceId: 'ws-1', kind: 'fact' as const, concepts: [], files: ['src/db.ts'], content: 'new' }
    expect(findConflicts(base, truth)).toEqual(['t1'])
    expect(findConflicts({ ...base, content: 'old' }, truth)).toEqual(['t2'])
    expect(findConflicts({ ...base, files: [] }, truth)).toEqual([])
  })

  it('writes derived artifacts and deterministic proposals with evidence', async () => {
    const observations = [
      obs({ id: 'g1', type: 'git-event', content: 'commit abc: add user index', fileRefs: ['src/db.ts'] }),
      obs({ id: 'g1-dupe', type: 'git-event', content: 'commit abc: add user index', fileRefs: ['src/db.ts'] }),
      obs({ id: 'plain', content: '今天天气不错' }),
    ]
    const result = await runDeterministicStage(
      { workspaceId: 'ws-1', observations },
      { getAutoAccept: async () => false },
    )
    // Exact dupe shares the derived write: 2 derived artifacts, 1 proposal.
    expect(result).toEqual({ derived: 2, proposals: 1, autoAccepted: 0 })

    const derived = await readDerivedObservation('g1')
    expect(derived?.summary).toBe('commit abc: add user index')
    expect(derived?.fileRefs).toContain('src/db.ts')
    expect(derived?.derivation).toBe('deterministic')
    expect(await readDerivedObservation('plain')).not.toBeNull()
    expect(await readDerivedObservation('missing')).toBeNull()

    const candidates = await knowledgeExtractService.listFactCandidates()
    expect(candidates).toHaveLength(1)
    const candidate = candidates[0]!
    expect(candidate.derivation).toBe('deterministic')
    expect(candidate.fact.kind).toBe('fact')
    expect(candidate.fact.confidence).toBe(0.9)
    expect(candidate.evidence.observationIds.sort()).toEqual(['g1', 'g1-dupe'])
    expect(candidate.conflicts).toBeUndefined()
  })

  it('auto-accepts only deterministic high-confidence tool/checkpoint facts (§4.6)', async () => {
    const applied: Array<{ type: string; id: string; actor?: string }> = []
    const observations = [
      obs({ id: 'g', type: 'git-event', content: 'commit abc: ship it', fileRefs: ['src/a.ts'] }),
      obs({ id: 'd', type: 'user-note', content: '决定：采用软删除方案' }),
      obs({ id: 'c', type: 'user-note', source: 'janus-chat', content: 'commit xyz: stray note' }),
    ]
    // 'c' is a user-note (no pattern) so it yields no proposal; add a checkpoint
    // fact from a non-tool source instead via a second run below.
    const result = await runDeterministicStage(
      { workspaceId: 'ws-1', observations },
      { getAutoAccept: async () => true, applyCandidate: async (input) => { applied.push(input); return null } },
    )
    expect(result.proposals).toBe(2)
    expect(result.autoAccepted).toBe(1)
    // Only the git fact (confidence 0.9, source tool) is accepted with the auto-policy actor.
    expect(applied).toHaveLength(1)
    expect(applied[0]?.type).toBe('fact')
    expect(applied[0]?.actor).toBe('auto-policy')
    const candidates = await knowledgeExtractService.listFactCandidates()
    const git = candidates.find((c) => c.evidence.observationIds.includes('g'))!
    expect(applied[0]?.id).toBe(git.id)
  })
})
