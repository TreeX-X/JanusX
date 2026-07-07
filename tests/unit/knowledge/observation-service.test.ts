import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { knowledgeObservationService } from '../../../src/main/knowledge/observation-service'
import { knowledgeAuditService } from '../../../src/main/knowledge/audit-service'

function currentShardName(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}.jsonl`
}

describe('KnowledgeObservationService', () => {
  let workspacePath: string
  let knowledgeRoot: string
  const previousKnowledgeRoot = process.env.JANUSX_KNOWLEDGE_ROOT

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), 'janusx-observations-'))
    knowledgeRoot = await mkdtemp(join(tmpdir(), 'janusx-global-observations-'))
    process.env.JANUSX_KNOWLEDGE_ROOT = knowledgeRoot
  })

  afterEach(async () => {
    await rm(workspacePath, { recursive: true, force: true })
    await rm(knowledgeRoot, { recursive: true, force: true })
    if (previousKnowledgeRoot === undefined) {
      delete process.env.JANUSX_KNOWLEDGE_ROOT
    } else {
      process.env.JANUSX_KNOWLEDGE_ROOT = previousKnowledgeRoot
    }
  })

  it('captures sharded observations with retention metadata and bootstraps storage', async () => {
    const observation = await knowledgeObservationService.capture({
      workspacePath,
      source: 'manual',
      type: 'user-note',
      content: '  remember this design decision  ',
      fileRefs: ['src/a.ts', 'src/a.ts', ' src/b.ts '],
      tags: [' important ', 'important', 'design'],
      actor: 'tester',
    })

    expect(observation.workspaceId).toBeTruthy()
    expect(observation.workspaceName).toBeTruthy()
    expect(observation.content).toBe('remember this design decision')
    expect(observation.fileRefs).toEqual(['src/a.ts', 'src/b.ts'])
    expect(observation.tags).toEqual(['important', 'design'])
    expect(observation.retentionClass).toBe('evidence')
    expect(observation.retentionReason).toBe('user-note')
    expect(observation.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(observation.contentLength).toBe(Buffer.byteLength('remember this design decision', 'utf8'))
    expect(observation.truncated).toBe(false)
    expect(observation.blobRef).toBeUndefined()

    const shardName = currentShardName(new Date(observation.createdAt))
    const fileContent = await readFile(
      join(knowledgeRoot, 'observations/active', shardName),
      'utf8',
    )
    expect(fileContent).toContain('"source":"manual"')
    expect(fileContent).toContain('"type":"user-note"')
    expect(fileContent).toContain('"retentionClass":"evidence"')

    // New writes must not land in the legacy flat file.
    const legacy = await readFile(join(knowledgeRoot, 'observations/observations.jsonl'), 'utf8')
    expect(legacy).toBe('')
  })

  it('lists global observations and supports workspace scoped filtering', async () => {
    const anotherWorkspacePath = await mkdtemp(join(tmpdir(), 'janusx-other-observations-'))
    await knowledgeObservationService.capture({
      workspaceId: 'workspace-a',
      workspaceName: 'Workspace A',
      workspacePath,
      source: 'manual',
      type: 'user-note',
      content: 'first',
      actor: 'tester',
    })
    await knowledgeObservationService.capture({
      workspaceId: 'workspace-b',
      workspaceName: 'Workspace B',
      workspacePath: anotherWorkspacePath,
      source: 'janus-chat',
      type: 'conversation-turn',
      content: 'second',
      actor: 'assistant',
    })

    const latest = await knowledgeObservationService.list({ limit: 1 })
    const workspaceScoped = await knowledgeObservationService.list({
      scope: 'workspace',
      workspaceId: 'workspace-b',
    })
    const filtered = await knowledgeObservationService.list({
      scope: 'workspace',
      workspaceName: 'Workspace B',
      source: 'janus-chat',
      type: 'conversation-turn',
    })

    expect(latest).toHaveLength(1)
    expect(latest[0]?.content).toBe('second')
    expect(workspaceScoped).toHaveLength(1)
    expect(workspaceScoped[0]?.workspaceName).toBe('Workspace B')
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.source).toBe('janus-chat')
    await rm(anotherWorkspacePath, { recursive: true, force: true })
  })

  it('prunes observations only when explicitly confirmed', async () => {
    await knowledgeObservationService.capture({
      workspaceId: 'workspace-a',
      workspaceName: 'Workspace A',
      workspacePath,
      source: 'manual',
      type: 'user-note',
      content: 'remove me',
      actor: 'tester',
    })
    await knowledgeObservationService.capture({
      workspaceId: 'workspace-b',
      workspaceName: 'Workspace B',
      workspacePath,
      source: 'janus-chat',
      type: 'conversation-turn',
      content: 'keep me',
      actor: 'assistant',
    })

    const dryRun = await knowledgeObservationService.prune({
      workspaceId: 'workspace-a',
    })
    expect(dryRun).toMatchObject({ dryRun: true, matched: 1, removed: 0, kept: 1 })
    expect(await knowledgeObservationService.list({})).toHaveLength(2)

    const confirmed = await knowledgeObservationService.prune({
      workspaceId: 'workspace-a',
      confirm: true,
    })
    expect(confirmed).toMatchObject({ dryRun: false, matched: 1, removed: 1, kept: 1 })

    const remaining = await knowledgeObservationService.list({})
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.content).toBe('keep me')
  })

  it('supports retentionClass filter in prune', async () => {
    await knowledgeObservationService.capture({
      workspacePath,
      source: 'agent-stream',
      type: 'system-event',
      content: '   ',
      actor: 'engine',
    })
    await knowledgeObservationService.capture({
      workspacePath,
      source: 'manual',
      type: 'user-note',
      content: 'evidence note',
      actor: 'tester',
    })

    const result = await knowledgeObservationService.prune({ retentionClass: 'noise', confirm: true })
    expect(result.matched).toBe(1)
    expect(result.removed).toBe(1)
    const remaining = await knowledgeObservationService.list({})
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.content).toBe('evidence note')
  })

  it('rejects prune without any filter', async () => {
    await expect(knowledgeObservationService.prune({ confirm: true })).rejects.toThrow(
      'Observation prune requires at least one filter',
    )
  })

  it('compresses long content into blobs and resolves it back', async () => {
    const longContent = 'A'.repeat(3000) // > 2KB threshold
    const observation = await knowledgeObservationService.capture({
      workspacePath,
      source: 'manual',
      type: 'user-note',
      content: longContent,
      actor: 'tester',
    })

    expect(observation.blobRef).toMatch(/^blobs\/[0-9a-f]{64}\.txt\.gz$/)
    expect(observation.truncated).toBe(true)
    expect(observation.originalLength).toBe(longContent.length)
    expect(observation.contentLength).toBe(longContent.length)
    expect(observation.contentPreview).toBe(longContent.slice(0, 200))
    expect(observation.content).toBe(longContent.slice(0, 200))

    const blobBytes = await readFile(join(knowledgeRoot, observation.blobRef as string))
    expect(blobBytes.length).toBeLessThan(longContent.length)

    const resolved = await knowledgeObservationService.resolveContent(observation)
    expect(resolved).toBe(longContent)
  })

  it('does not blob short content', async () => {
    const observation = await knowledgeObservationService.capture({
      workspacePath,
      source: 'manual',
      type: 'user-note',
      content: 'short note',
      actor: 'tester',
    })
    expect(observation.blobRef).toBeUndefined()
    expect(observation.truncated).toBe(false)
    expect(observation.content).toBe('short note')
    expect(await knowledgeObservationService.resolveContent(observation)).toBe('short note')
  })

  it('aggregates across multiple monthly shards', async () => {
    // Write two records directly into two different shard files to simulate history.
    await mkdir(join(knowledgeRoot, 'observations/active'), { recursive: true })
    const oldShard = join(knowledgeRoot, 'observations/active/2024-01.jsonl')
    const recentShard = join(knowledgeRoot, 'observations/active/2025-06.jsonl')
    const oldObs = {
      id: 'old-1',
      workspaceId: 'ws',
      workspaceName: 'ws',
      workspacePath,
      source: 'manual',
      type: 'user-note',
      content: 'old record',
      fileRefs: [],
      tags: [],
      visibility: 'global',
      actor: 'tester',
      createdAt: '2024-01-15T00:00:00.000Z',
      retentionClass: 'evidence',
    }
    const recentObs = {
      id: 'recent-1',
      workspaceId: 'ws',
      workspaceName: 'ws',
      workspacePath,
      source: 'manual',
      type: 'user-note',
      content: 'recent record',
      fileRefs: [],
      tags: [],
      visibility: 'global',
      actor: 'tester',
      createdAt: '2025-06-15T00:00:00.000Z',
      retentionClass: 'evidence',
    }
    await writeFile(oldShard, `${JSON.stringify(oldObs)}\n`, 'utf8')
    await writeFile(recentShard, `${JSON.stringify(recentObs)}\n`, 'utf8')

    const all = await knowledgeObservationService.list({ limit: 200 })
    expect(all).toHaveLength(2)
    expect(all[0]?.content).toBe('recent record')
    expect(all[1]?.content).toBe('old record')

    const entries = await readdir(join(knowledgeRoot, 'observations/active'))
    expect(entries.filter((name) => name.endsWith('.jsonl'))).toHaveLength(2)
  })

  it('autoPrune removes noise/operational past TTL but keeps evidence', async () => {
    await mkdir(join(knowledgeRoot, 'observations/active'), { recursive: true })
    const shard = join(knowledgeRoot, 'observations/active/2024-01.jsonl')
    const noise = {
      id: 'noise-1',
      workspaceId: 'ws',
      workspaceName: 'ws',
      workspacePath,
      source: 'agent-stream',
      type: 'system-event',
      content: '   ',
      fileRefs: [],
      tags: [],
      visibility: 'global',
      actor: 'engine',
      createdAt: '2024-01-01T00:00:00.000Z',
      retentionClass: 'noise',
    }
    const operational = {
      id: 'op-1',
      workspaceId: 'ws',
      workspaceName: 'ws',
      workspacePath,
      source: 'agent-stream',
      type: 'system-event',
      content: 'turn completed',
      fileRefs: [],
      tags: [],
      visibility: 'global',
      actor: 'engine',
      createdAt: '2024-01-01T00:00:00.000Z',
      retentionClass: 'operational',
    }
    const evidence = {
      id: 'ev-1',
      workspaceId: 'ws',
      workspaceName: 'ws',
      workspacePath,
      source: 'manual',
      type: 'user-note',
      content: 'keep forever',
      fileRefs: [],
      tags: [],
      visibility: 'global',
      actor: 'tester',
      createdAt: '2024-01-01T00:00:00.000Z',
      retentionClass: 'evidence',
    }
    await writeFile(shard, [noise, operational, evidence].map((o) => JSON.stringify(o)).join('\n') + '\n', 'utf8')

    const now = Date.parse('2024-08-01T00:00:00.000Z')
    const result = await knowledgeObservationService.autoPrune(now)
    expect(result.dryRun).toBe(false)
    expect(result.matched).toBe(2)
    expect(result.removed).toBe(2)
    expect(result.kept).toBe(1)

    const remaining = await knowledgeObservationService.list({ limit: 200 })
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.content).toBe('keep forever')
  })

  it('stats counts observations by retention class across shards', async () => {
    await mkdir(join(knowledgeRoot, 'observations/active'), { recursive: true })
    const shard = join(knowledgeRoot, 'observations/active/2024-01.jsonl')
    const make = (id: string, cls: 'noise' | 'operational' | 'evidence' | 'derived') => ({
      id,
      workspaceId: 'ws',
      workspaceName: 'ws',
      workspacePath,
      source: 'manual',
      type: 'user-note',
      content: 'x',
      fileRefs: [],
      tags: [],
      visibility: 'global',
      actor: 'tester',
      createdAt: '2024-01-01T00:00:00.000Z',
      retentionClass: cls,
    })
    await writeFile(
      shard,
      [make('a', 'noise'), make('b', 'noise'), make('c', 'operational'), make('d', 'evidence'), make('e', 'derived')]
        .map((o) => JSON.stringify(o))
        .join('\n') + '\n',
      'utf8',
    )

    const stats = await knowledgeObservationService.stats()
    expect(stats).toEqual({ noise: 2, operational: 1, evidence: 1, derived: 1, total: 5 })
  })

  it('prune(confirm:true) writes observation_pruned audit events; dry-run writes none', async () => {
    await knowledgeObservationService.capture({
      workspaceId: 'workspace-a',
      workspaceName: 'Workspace A',
      workspacePath,
      source: 'manual',
      type: 'user-note',
      content: 'remove me',
      actor: 'tester',
    })

    const dryRun = await knowledgeObservationService.prune({ workspaceId: 'workspace-a' })
    expect(dryRun.dryRun).toBe(true)
    const auditAfterDryRun = await knowledgeAuditService.list({ action: 'observation_pruned' })
    expect(auditAfterDryRun).toHaveLength(0)

    await knowledgeObservationService.prune({ workspaceId: 'workspace-a', confirm: true })
    const audit = await knowledgeAuditService.list({ action: 'observation_pruned' })
    expect(audit).toHaveLength(1)
    expect(audit[0]?.targetType).toBe('observation')
    expect(audit[0]?.before).toMatchObject({ retentionClass: 'evidence' })
    expect(audit[0]?.after).toBeNull()
    expect(audit[0]?.provenance.actor).toBe('knowledge-service')
  })

  it('autoPrune writes observation_auto_pruned audit events', async () => {
    await mkdir(join(knowledgeRoot, 'observations/active'), { recursive: true })
    const shard = join(knowledgeRoot, 'observations/active/2024-01.jsonl')
    const noise = {
      id: 'noise-audit-1',
      workspaceId: 'ws',
      workspaceName: 'ws',
      workspacePath,
      source: 'agent-stream',
      type: 'system-event',
      content: '   ',
      fileRefs: [],
      tags: [],
      visibility: 'global',
      actor: 'engine',
      createdAt: '2024-01-01T00:00:00.000Z',
      retentionClass: 'noise',
    }
    await writeFile(shard, `${JSON.stringify(noise)}\n`, 'utf8')

    await knowledgeObservationService.autoPrune(Date.parse('2024-08-01T00:00:00.000Z'))

    const audit = await knowledgeAuditService.list({ action: 'observation_auto_pruned' })
    expect(audit).toHaveLength(1)
    expect(audit[0]?.targetId).toBe('noise-audit-1')
    expect(audit[0]?.provenance.actor).toBe('knowledge-auto-prune')
  })

  it('archiveOldShards dry-run reports candidates without touching the filesystem', async () => {
    await mkdir(join(knowledgeRoot, 'observations/active'), { recursive: true })
    const oldObs = {
      id: 'archive-1',
      workspaceId: 'ws',
      workspaceName: 'ws',
      workspacePath,
      source: 'manual',
      type: 'user-note',
      content: 'old record',
      fileRefs: [],
      tags: [],
      visibility: 'global',
      actor: 'tester',
      createdAt: '2024-01-15T00:00:00.000Z',
      retentionClass: 'evidence',
    }
    await writeFile(
      join(knowledgeRoot, 'observations/active/2024-01.jsonl'),
      `${JSON.stringify(oldObs)}\n`,
      'utf8',
    )

    const result = await knowledgeObservationService.archiveOldShards({
      olderThanMonths: 3,
      nowMs: Date.parse('2024-08-01T00:00:00.000Z'),
    })

    expect(result.totalRecords).toBe(1)
    expect(result.archivedShards).toHaveLength(1)
    expect(result.archivedShards[0]?.shard).toBe('2024-01.jsonl')
    expect(result.archivedShards[0]?.archivedTo).toBe('observations/archive/2024-01.jsonl.gz')

    // Active shard must still exist (dry-run did not move it).
    const activeEntries = await readdir(join(knowledgeRoot, 'observations/active'))
    expect(activeEntries).toContain('2024-01.jsonl')

    // No audit events written in dry-run.
    const audit = await knowledgeAuditService.list({ action: 'observation_archived' })
    expect(audit).toHaveLength(0)
  })

  it('archiveOldShards(confirm:true) moves active shard to gzipped archive and keeps records queryable', async () => {
    await mkdir(join(knowledgeRoot, 'observations/active'), { recursive: true })
    const oldObs = {
      id: 'archive-confirm-1',
      workspaceId: 'ws',
      workspaceName: 'ws',
      workspacePath,
      source: 'manual',
      type: 'user-note',
      content: 'old record that will be archived',
      fileRefs: [],
      tags: [],
      visibility: 'global',
      actor: 'tester',
      createdAt: '2024-01-15T00:00:00.000Z',
      retentionClass: 'evidence',
    }
    await writeFile(
      join(knowledgeRoot, 'observations/active/2024-01.jsonl'),
      `${JSON.stringify(oldObs)}\n`,
      'utf8',
    )

    const result = await knowledgeObservationService.archiveOldShards({
      olderThanMonths: 3,
      confirm: true,
      nowMs: Date.parse('2024-08-01T00:00:00.000Z'),
    })

    expect(result.totalRecords).toBe(1)
    expect(result.archivedShards).toHaveLength(1)

    // Active shard file removed.
    const activeEntries = await readdir(join(knowledgeRoot, 'observations/active'))
    expect(activeEntries).not.toContain('2024-01.jsonl')

    // Archive file exists.
    const archiveEntries = await readdir(join(knowledgeRoot, 'observations/archive'))
    expect(archiveEntries).toContain('2024-01.jsonl.gz')

    // Archived record still queryable via list (aggregation reads .gz).
    const all = await knowledgeObservationService.list({ limit: 200 })
    expect(all).toHaveLength(1)
    expect(all[0]?.content).toBe('old record that will be archived')

    // Audit event written.
    const audit = await knowledgeAuditService.list({ action: 'observation_archived' })
    expect(audit).toHaveLength(1)
    expect(audit[0]?.targetId).toBe('2024-01.jsonl')
    expect(audit[0]?.after).toMatchObject({ archivedTo: 'observations/archive/2024-01.jsonl.gz' })
  })

  it('compactEvidence dry-run counts targets; confirmed marks compactionStatus and writes audit', async () => {
    await mkdir(join(knowledgeRoot, 'observations/active'), { recursive: true })
    const longContent = 'A'.repeat(300) // > CONTENT_PREVIEW_CHARS (200)
    const oldEvidence = {
      id: 'compact-1',
      workspaceId: 'ws',
      workspaceName: 'ws',
      workspacePath,
      source: 'manual',
      type: 'user-note',
      content: longContent,
      fileRefs: [],
      tags: [],
      visibility: 'global',
      actor: 'tester',
      createdAt: '2024-01-15T00:00:00.000Z',
      retentionClass: 'evidence',
      contentLength: longContent.length,
      contentPreview: longContent.slice(0, 200),
    }
    const shortEvidence = {
      id: 'compact-keep-1',
      workspaceId: 'ws',
      workspaceName: 'ws',
      workspacePath,
      source: 'manual',
      type: 'user-note',
      content: 'short',
      fileRefs: [],
      tags: [],
      visibility: 'global',
      actor: 'tester',
      createdAt: '2024-01-15T00:00:00.000Z',
      retentionClass: 'evidence',
      contentLength: 5,
    }
    await writeFile(
      join(knowledgeRoot, 'observations/active/2024-01.jsonl'),
      [oldEvidence, shortEvidence].map((o) => JSON.stringify(o)).join('\n') + '\n',
      'utf8',
    )

    const dryRun = await knowledgeObservationService.compactEvidence({
      olderThanMonths: 3,
      nowMs: Date.parse('2024-08-01T00:00:00.000Z'),
    })
    expect(dryRun.dryRun).toBe(true)
    expect(dryRun.compacted).toBe(1) // only oldEvidence qualifies (long content)
    expect(dryRun.kept).toBe(1)

    // No audit in dry-run.
    const auditDry = await knowledgeAuditService.list({ action: 'observation_compacted' })
    expect(auditDry).toHaveLength(0)

    const confirmed = await knowledgeObservationService.compactEvidence({
      olderThanMonths: 3,
      confirm: true,
      nowMs: Date.parse('2024-08-01T00:00:00.000Z'),
    })
    expect(confirmed.dryRun).toBe(false)
    expect(confirmed.compacted).toBe(1)

    const all = await knowledgeObservationService.list({ limit: 200 })
    const compactedObs = all.find((o) => o.id === 'compact-1')
    const keptObs = all.find((o) => o.id === 'compact-keep-1')
    expect(compactedObs?.compactionStatus).toBe('compacted')
    expect(compactedObs?.compactedAt).toBeTruthy()
    expect(compactedObs?.summary).toBe(longContent.slice(0, 200))
    // Content body preserved (MVP: marking-only, no destruction).
    expect(compactedObs?.content).toBe(longContent)
    expect(keptObs?.compactionStatus).toBe('active')

    const audit = await knowledgeAuditService.list({ action: 'observation_compacted' })
    expect(audit).toHaveLength(1)
    expect(audit[0]?.targetId).toBe('compact-1')
    expect(audit[0]?.after).toMatchObject({ compactionStatus: 'compacted' })
    expect(audit[0]?.provenance.actor).toBe('knowledge-compact')
  })

  it('treats records without compactionStatus as active compact targets (backward compat)', async () => {
    await mkdir(join(knowledgeRoot, 'observations/active'), { recursive: true })
    const longContent = 'B'.repeat(300)
    // No compactionStatus field at all — must be treated as 'active'.
    const oldEvidence = {
      id: 'legacy-compact-1',
      workspaceId: 'ws',
      workspaceName: 'ws',
      workspacePath,
      source: 'manual',
      type: 'user-note',
      content: longContent,
      fileRefs: [],
      tags: [],
      visibility: 'global',
      actor: 'tester',
      createdAt: '2024-01-15T00:00:00.000Z',
      retentionClass: 'evidence',
      contentLength: longContent.length,
    }
    await writeFile(
      join(knowledgeRoot, 'observations/active/2024-01.jsonl'),
      `${JSON.stringify(oldEvidence)}\n`,
      'utf8',
    )

    const result = await knowledgeObservationService.compactEvidence({
      olderThanMonths: 3,
      confirm: true,
      nowMs: Date.parse('2024-08-01T00:00:00.000Z'),
    })
    expect(result.compacted).toBe(1)

    const all = await knowledgeObservationService.list({ limit: 200 })
    expect(all[0]?.compactionStatus).toBe('compacted')
  })
})