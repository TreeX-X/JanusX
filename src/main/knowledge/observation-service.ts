import { randomUUID } from 'crypto'
import { gzip, gunzip } from 'zlib'
import { promisify } from 'util'
import { appendFile, mkdir, readFile, readdir, stat, unlink, writeFile } from 'fs/promises'
import { basename, join, resolve } from 'path'
import type {
  AuditAction,
  CaptureObservationInput,
  KnowledgeProvenance,
  Observation,
  ObservationArchiveResult,
  ObservationCompactResult,
  ObservationPruneQuery,
  ObservationPruneResult,
  ObservationQuery,
  RetentionStats,
} from '../../shared/knowledge'
import { BLOB_CONTENT_THRESHOLD, CONTENT_PREVIEW_CHARS, knowledgeRootPath } from './constants'
import { knowledgeContractService } from './contract-service'
import { classifyRetention, isAutoPrunable } from './retention-classifier'
import { knowledgeAuditService } from './audit-service'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

const LEGACY_OBSERVATIONS_FILE = 'observations/observations.jsonl'
const ACTIVE_OBSERVATIONS_DIR = 'observations/active'
const ARCHIVE_OBSERVATIONS_DIR = 'observations/archive'
const BLOBS_DIR = 'blobs'
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
// Phase 5: shard age thresholds (30-day months for simple arithmetic).
const MS_PER_MONTH = 30 * 24 * 60 * 60 * 1000
const DEFAULT_ARCHIVE_AGE_MONTHS = 3
const DEFAULT_COMPACT_AGE_MONTHS = 6

function normalizeWorkspaceId(workspacePath: string, workspaceId?: string): string {
  const trimmed = workspaceId?.trim()
  if (trimmed) return trimmed
  return basename(resolve(workspacePath)) || 'workspace'
}

function normalizeWorkspaceName(workspacePath: string, workspaceName?: string): string {
  const trimmed = workspaceName?.trim()
  if (trimmed) return trimmed
  return basename(resolve(workspacePath)) || 'workspace'
}

function normalizeOptionalText(value?: string): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function normalizeList(values?: string[]): string[] {
  if (!values?.length) return []

  const seen = new Set<string>()
  const normalized: string[] = []

  for (const value of values) {
    const item = value.trim()
    if (!item) continue
    if (seen.has(item)) continue
    seen.add(item)
    normalized.push(item)
  }

  return normalized
}

function clampLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit as number)))
}

function parseTime(value?: string): number | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  const parsed = Date.parse(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseObservationLine(line: string): Observation | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  try {
    const observation = JSON.parse(trimmed) as Observation
    if (!observation.workspaceName && observation.workspacePath) {
      observation.workspaceName = normalizeWorkspaceName(observation.workspacePath)
    }
    if (!observation.retentionClass) {
      // Backward compat: unknown retention defaults to evidence (never auto-deleted).
      observation.retentionClass = 'evidence'
    }
    if (!observation.compactionStatus) {
      // Backward compat: missing compaction status reads as 'active'.
      observation.compactionStatus = 'active'
    }
    return observation
  } catch {
    return null
  }
}

function shardRelativePath(createdAtIso: string): string {
  const instant = Date.parse(createdAtIso)
  const date = Number.isFinite(instant) ? new Date(instant) : new Date()
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${ACTIVE_OBSERVATIONS_DIR}/${year}-${month}.jsonl`
}

interface ResolvedObservationFilters {
  workspaceId?: string
  workspaceName?: string
  workspacePath?: string
  source?: ObservationQuery['source']
  type?: ObservationQuery['type']
  olderThanMs?: number
  retentionClass?: ObservationPruneQuery['retentionClass']
}

function resolveFilters(query: ObservationQuery | ObservationPruneQuery): ResolvedObservationFilters {
  const workspaceId = normalizeOptionalText(query.workspaceId)
  const workspaceName = normalizeOptionalText(query.workspaceName)
  const workspacePath = normalizeOptionalText(query.workspacePath)
  const hasWorkspaceFilter = Boolean(workspaceId || workspaceName || workspacePath)
  const scope = query.scope ?? (hasWorkspaceFilter ? 'workspace' : 'global')

  if (scope === 'workspace' && !hasWorkspaceFilter) {
    throw new Error('Workspace query requires workspaceId, workspaceName, or workspacePath')
  }

  return {
    workspaceId,
    workspaceName,
    workspacePath,
    source: query.source,
    type: query.type,
    olderThanMs: parseTime((query as ObservationPruneQuery).olderThan),
    retentionClass: (query as ObservationPruneQuery).retentionClass,
  }
}

function matchesFilters(observation: Observation, filters: ResolvedObservationFilters): boolean {
  if (filters.workspaceId && observation.workspaceId !== filters.workspaceId) return false
  if (filters.workspaceName && observation.workspaceName !== filters.workspaceName) return false
  if (filters.workspacePath && observation.workspacePath !== filters.workspacePath) return false
  if (filters.source && observation.source !== filters.source) return false
  if (filters.type && observation.type !== filters.type) return false
  if (filters.retentionClass && observation.retentionClass !== filters.retentionClass) return false
  if (filters.olderThanMs !== undefined && Date.parse(observation.createdAt) >= filters.olderThanMs) {
    return false
  }
  return true
}

interface ShardFile {
  relativePath: string
  lines: string[]
}

async function readShardFile(relativePath: string): Promise<ShardFile | null> {
  const absolutePath = join(knowledgeRootPath(), relativePath)
  let content: string
  try {
    content = await readFile(absolutePath, 'utf8')
  } catch {
    return null
  }
  const lines = content.split('\n').filter((line) => line.trim())
  return { relativePath, lines }
}

async function readArchiveShardFile(relativePath: string): Promise<ShardFile | null> {
  const absolutePath = join(knowledgeRootPath(), relativePath)
  let compressed: Buffer
  try {
    compressed = await readFile(absolutePath)
  } catch {
    return null
  }
  const decompressed = await gunzipAsync(compressed)
  const content = decompressed.toString('utf8')
  const lines = content.split('\n').filter((line) => line.trim())
  return { relativePath, lines }
}

async function listObservationShardFiles(): Promise<ShardFile[]> {
  const root = knowledgeRootPath()
  const activeDir = join(root, ACTIVE_OBSERVATIONS_DIR)
  let activeEntries: string[] = []
  try {
    activeEntries = await readdir(activeDir)
  } catch {
    activeEntries = []
  }
  const shardPaths = activeEntries
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => `${ACTIVE_OBSERVATIONS_DIR}/${name}`)

  const shards: ShardFile[] = []
  for (const relativePath of shardPaths) {
    const shard = await readShardFile(relativePath)
    if (shard && shard.lines.length > 0) shards.push(shard)
  }

  // Phase 5: archived (.gz) shards remain queryable — gunzip and aggregate them.
  const archiveDir = join(root, ARCHIVE_OBSERVATIONS_DIR)
  let archiveEntries: string[] = []
  try {
    archiveEntries = await readdir(archiveDir)
  } catch {
    archiveEntries = []
  }
  for (const name of archiveEntries) {
    if (!name.endsWith('.jsonl.gz')) continue
    const relativePath = `${ARCHIVE_OBSERVATIONS_DIR}/${name}`
    const shard = await readArchiveShardFile(relativePath)
    if (shard && shard.lines.length > 0) shards.push(shard)
  }

  const legacy = await readShardFile(LEGACY_OBSERVATIONS_FILE)
  if (legacy && legacy.lines.length > 0) shards.push(legacy)

  return shards
}

/** Parses a `YYYY-MM.jsonl` shard filename into its UTC month-start instant. */
function shardMonthToMs(shardName: string): number | null {
  const match = /^(\d{4})-(\d{2})\.jsonl(\.gz)?$/.exec(shardName)
  if (!match) return null
  const year = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null
  return Date.UTC(year, month - 1, 1)
}

function parseShardLines(shard: ShardFile): Array<{ line: string; observation: Observation | null }> {
  return shard.lines.map((line) => ({ line, observation: parseObservationLine(line) }))
}

async function writeShardIfChanged(relativePath: string, lines: string[]): Promise<void> {
  const absolutePath = join(knowledgeRootPath(), relativePath)
  await mkdir(join(absolutePath, '..'), { recursive: true })
  const newContent = lines.length ? `${lines.join('\n')}\n` : ''
  await writeFile(absolutePath, newContent, 'utf8')
}

async function blobExists(relativePath: string): Promise<boolean> {
  try {
    await stat(join(knowledgeRootPath(), relativePath))
    return true
  } catch {
    return false
  }
}

export class KnowledgeObservationService {
  async capture(input: CaptureObservationInput): Promise<Observation> {
    const workspacePath = input.workspacePath.trim()
    if (!workspacePath) {
      throw new Error('Workspace path is required as observation provenance')
    }

    await knowledgeContractService.bootstrapWorkspace(workspacePath)

    const fullContent = input.content.trim()
    const classification = classifyRetention({
      source: input.source,
      type: input.type,
      content: fullContent,
      fileRefs: input.fileRefs,
      tags: input.tags,
    })

    const createdAt = new Date().toISOString()
    const baseObservation: Observation = {
      id: randomUUID(),
      workspaceId: normalizeWorkspaceId(workspacePath, input.workspaceId),
      workspaceName: normalizeWorkspaceName(workspacePath, input.workspaceName),
      workspacePath,
      source: input.source,
      type: input.type,
      content: fullContent,
      summary: input.summary?.trim() || undefined,
      fileRefs: normalizeList(input.fileRefs),
      tags: normalizeList(input.tags),
      visibility: input.visibility ?? 'global',
      actor: input.actor?.trim() || 'system',
      createdAt,
      correlationId: input.correlationId?.trim() || undefined,
      metadata: input.metadata,
      retentionClass: classification.retentionClass,
      retentionReason: classification.retentionReason,
      contentHash: classification.contentHash,
      contentLength: classification.contentLength,
      originalLength: classification.contentLength,
      truncated: false,
    }

    const observation = await this.applyBlobCompression(baseObservation, fullContent)

    const shardPath = shardRelativePath(createdAt)
    const filePath = join(knowledgeRootPath(), shardPath)
    await mkdir(join(filePath, '..'), { recursive: true })
    await appendFile(filePath, `${JSON.stringify(observation)}\n`, 'utf8')

    return observation
  }

  private async applyBlobCompression(
    observation: Observation,
    fullContent: string,
  ): Promise<Observation> {
    if (observation.contentLength === undefined || observation.contentLength <= BLOB_CONTENT_THRESHOLD) {
      return observation
    }

    const hash = observation.contentHash ?? ''
    const blobRelativePath = `${BLOBS_DIR}/${hash}.txt.gz`
    const blobAbsolutePath = join(knowledgeRootPath(), blobRelativePath)

    if (!(await blobExists(blobRelativePath))) {
      const compressed = await gzipAsync(Buffer.from(fullContent, 'utf8'))
      await mkdir(join(blobAbsolutePath, '..'), { recursive: true })
      await writeFile(blobAbsolutePath, compressed)
    }

    const preview = fullContent.slice(0, CONTENT_PREVIEW_CHARS)
    return {
      ...observation,
      content: preview,
      contentPreview: preview,
      blobRef: blobRelativePath,
      originalLength: observation.contentLength,
      truncated: true,
    }
  }

  async resolveContent(observation: Observation): Promise<string> {
    if (!observation.blobRef) return observation.content
    const absolutePath = join(knowledgeRootPath(), observation.blobRef)
    const compressed = await readFile(absolutePath)
    const decompressed = await gunzipAsync(compressed)
    return decompressed.toString('utf8')
  }

  async list(query: ObservationQuery): Promise<Observation[]> {
    const filters = resolveFilters(query)
    await knowledgeContractService.bootstrapWorkspace(filters.workspacePath)

    const shards = await listObservationShardFiles()
    const observations: Observation[] = []
    for (const shard of shards) {
      for (const entry of parseShardLines(shard)) {
        if (entry.observation && matchesFilters(entry.observation, filters)) {
          observations.push(entry.observation)
        }
      }
    }

    observations.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    return observations.slice(0, clampLimit(query.limit))
  }

  async prune(query: ObservationPruneQuery): Promise<ObservationPruneResult> {
    const filters = resolveFilters(query)
    if (
      !filters.olderThanMs &&
      !filters.workspaceId &&
      !filters.workspaceName &&
      !filters.workspacePath &&
      !filters.source &&
      !filters.type &&
      !filters.retentionClass
    ) {
      throw new Error('Observation prune requires at least one filter')
    }

    await knowledgeContractService.bootstrapWorkspace(filters.workspacePath)

    const shards = await listObservationShardFiles()
    let matched = 0
    let keptTotal = 0
    const rewrites: Array<{ relativePath: string; lines: string[] }> = []
    const removed: Observation[] = []

    for (const shard of shards) {
      const entries = parseShardLines(shard)
      let shardMatched = 0
      const keptLines: string[] = []
      for (const entry of entries) {
        if (entry.observation && matchesFilters(entry.observation, filters)) {
          shardMatched++
          removed.push(entry.observation)
        } else {
          keptLines.push(entry.line)
        }
      }
      matched += shardMatched
      keptTotal += keptLines.length

      if (query.confirm === true && shardMatched > 0) {
        rewrites.push({ relativePath: shard.relativePath, lines: keptLines })
      }
    }

    if (query.confirm === true) {
      for (const rewrite of rewrites) {
        await writeShardIfChanged(rewrite.relativePath, rewrite.lines)
      }
      if (removed.length > 0) {
        await this.auditRemovals(removed, 'observation_pruned', 'knowledge-service')
      }
    }

    return {
      dryRun: query.confirm !== true,
      matched,
      removed: query.confirm === true ? matched : 0,
      kept: keptTotal,
    }
  }

  async autoPrune(nowMs: number = Date.now()): Promise<ObservationPruneResult> {
    await knowledgeContractService.bootstrapWorkspace(undefined)

    const shards = await listObservationShardFiles()
    let matched = 0
    let keptTotal = 0
    const rewrites: Array<{ relativePath: string; lines: string[] }> = []
    const removed: Observation[] = []

    for (const shard of shards) {
      const entries = parseShardLines(shard)
      let shardMatched = 0
      const keptLines: string[] = []
      for (const entry of entries) {
        if (entry.observation && isAutoPrunable(entry.observation, nowMs)) {
          shardMatched++
          removed.push(entry.observation)
        } else {
          keptLines.push(entry.line)
        }
      }
      matched += shardMatched
      keptTotal += keptLines.length

      if (shardMatched > 0) {
        rewrites.push({ relativePath: shard.relativePath, lines: keptLines })
      }
    }

    for (const rewrite of rewrites) {
      await writeShardIfChanged(rewrite.relativePath, rewrite.lines)
    }

    if (removed.length > 0) {
      await this.auditRemovals(removed, 'observation_auto_pruned', 'knowledge-auto-prune')
    }

    return {
      dryRun: false,
      matched,
      removed: matched,
      kept: keptTotal,
    }
  }

  async stats(): Promise<RetentionStats> {
    const shards = await listObservationShardFiles()
    const counts: RetentionStats = { noise: 0, operational: 0, evidence: 0, derived: 0, total: 0 }
    for (const shard of shards) {
      for (const entry of parseShardLines(shard)) {
        if (!entry.observation) continue
        counts.total++
        const cls = entry.observation.retentionClass ?? 'evidence'
        if (cls === 'noise') counts.noise++
        else if (cls === 'operational') counts.operational++
        else if (cls === 'derived') counts.derived++
        else counts.evidence++
      }
    }
    return counts
  }

  /**
   * Phase 5: Moves active monthly shards older than `olderThanMonths` into
   * gzipped `observations/archive/YYYY-MM.jsonl.gz` files. Archived records
   * remain queryable — `listObservationShardFiles` gunzips and aggregates them.
   * Dry-run (default) reports candidates without touching the filesystem.
   */
  async archiveOldShards(options: {
    olderThanMonths?: number
    confirm?: boolean
    nowMs?: number
  } = {}): Promise<ObservationArchiveResult> {
    const olderThanMonths = options.olderThanMonths ?? DEFAULT_ARCHIVE_AGE_MONTHS
    const nowMs = options.nowMs ?? Date.now()
    const confirm = options.confirm === true

    await knowledgeContractService.bootstrapWorkspace(undefined)

    const root = knowledgeRootPath()
    const activeDir = join(root, ACTIVE_OBSERVATIONS_DIR)
    let activeEntries: string[] = []
    try {
      activeEntries = await readdir(activeDir)
    } catch {
      activeEntries = []
    }

    const candidates: Array<{ shardName: string; relativePath: string; recordCount: number }> = []
    for (const name of activeEntries) {
      if (!name.endsWith('.jsonl')) continue
      const shardMonthMs = shardMonthToMs(name)
      if (shardMonthMs === null) continue
      if (nowMs - shardMonthMs < olderThanMonths * MS_PER_MONTH) continue

      const shard = await readShardFile(`${ACTIVE_OBSERVATIONS_DIR}/${name}`)
      const recordCount = shard ? shard.lines.length : 0
      candidates.push({
        shardName: name,
        relativePath: `${ACTIVE_OBSERVATIONS_DIR}/${name}`,
        recordCount,
      })
    }

    const archivedShards: ObservationArchiveResult['archivedShards'] = []
    let totalRecords = 0

    if (!confirm) {
      for (const candidate of candidates) {
        const archivedTo = `${ARCHIVE_OBSERVATIONS_DIR}/${candidate.shardName}.gz`
        archivedShards.push({
          shard: candidate.shardName,
          recordCount: candidate.recordCount,
          archivedTo,
        })
        totalRecords += candidate.recordCount
      }
      return { archivedShards, totalRecords }
    }

    for (const candidate of candidates) {
      const activeAbsolutePath = join(root, candidate.relativePath)
      const archiveRelativePath = `${ARCHIVE_OBSERVATIONS_DIR}/${candidate.shardName}.gz`
      const archiveAbsolutePath = join(root, archiveRelativePath)

      const rawContent = await readFile(activeAbsolutePath, 'utf8')
      const originalLineCount = rawContent.split('\n').filter((line) => line.trim()).length

      const compressed = await gzipAsync(Buffer.from(rawContent, 'utf8'))
      await mkdir(join(archiveAbsolutePath, '..'), { recursive: true })
      await writeFile(archiveAbsolutePath, compressed)

      // Verification: re-read the .gz, gunzip, confirm line count matches.
      const reread = await readFile(archiveAbsolutePath)
      const redecompressed = (await gunzipAsync(reread)).toString('utf8')
      const verifiedLineCount = redecompressed.split('\n').filter((line) => line.trim()).length
      if (verifiedLineCount !== originalLineCount) {
        throw new Error(
          `Archive verification failed for ${candidate.shardName}: expected ${originalLineCount} lines, got ${verifiedLineCount}`,
        )
      }

      await unlink(activeAbsolutePath)

      archivedShards.push({
        shard: candidate.shardName,
        recordCount: originalLineCount,
        archivedTo: archiveRelativePath,
      })
      totalRecords += originalLineCount

      await knowledgeAuditService.record({
        action: 'observation_archived',
        targetType: 'observation',
        targetId: candidate.shardName,
        before: {
          shard: candidate.shardName,
          recordCount: originalLineCount,
          activePath: candidate.relativePath,
        },
        after: { archivedTo: archiveRelativePath },
        provenance: {
          workspaceId: 'global',
          workspaceName: 'global',
          workspacePath: '',
          source: 'system',
          sourceObservationIds: [],
          fileRefs: [],
          actor: 'knowledge-archive',
          createdAt: new Date(nowMs).toISOString(),
        },
      })
    }

    return { archivedShards, totalRecords }
  }

  /**
   * Phase 5: Marks aged evidence observations as compacted and ensures a
   * summary is present. MVP is marking-only — the original content/blob is
   * preserved so compaction stays reversible. Operates on ACTIVE shards only;
   * archived (.gz) evidence is left as-is (rewriting gzip archives is out of
   * MVP scope).
   */
  async compactEvidence(options: {
    olderThanMonths?: number
    confirm?: boolean
    nowMs?: number
  } = {}): Promise<ObservationCompactResult> {
    const olderThanMonths = options.olderThanMonths ?? DEFAULT_COMPACT_AGE_MONTHS
    const nowMs = options.nowMs ?? Date.now()
    const confirm = options.confirm === true

    await knowledgeContractService.bootstrapWorkspace(undefined)

    const root = knowledgeRootPath()
    const activeDir = join(root, ACTIVE_OBSERVATIONS_DIR)
    let activeEntries: string[] = []
    try {
      activeEntries = await readdir(activeDir)
    } catch {
      activeEntries = []
    }

    const targetShardNames = activeEntries.filter((name) => {
      if (!name.endsWith('.jsonl')) return false
      const shardMonthMs = shardMonthToMs(name)
      if (shardMonthMs === null) return false
      return nowMs - shardMonthMs >= olderThanMonths * MS_PER_MONTH
    })

    let compactedCount = 0
    let keptCount = 0

    for (const shardName of targetShardNames) {
      const relativePath = `${ACTIVE_OBSERVATIONS_DIR}/${shardName}`
      const shard = await readShardFile(relativePath)
      if (!shard) continue

      const entries = parseShardLines(shard)
      let shardTargets = 0
      const rewrittenLines: string[] = []
      const compacted: Observation[] = []

      for (const entry of entries) {
        if (!entry.observation) {
          rewrittenLines.push(entry.line)
          continue
        }
        const obs = entry.observation
        const isTarget =
          obs.retentionClass === 'evidence' &&
          obs.compactionStatus === 'active' &&
          (Boolean(obs.blobRef) || (obs.contentLength ?? 0) > CONTENT_PREVIEW_CHARS)

        if (!isTarget) {
          rewrittenLines.push(entry.line)
          keptCount++
          continue
        }

        shardTargets++
        if (!confirm) {
          // Dry-run: count the target but keep the original line.
          rewrittenLines.push(entry.line)
          continue
        }

        const nowIso = new Date(nowMs).toISOString()
        const summary =
          obs.summary ??
          obs.contentPreview ??
          obs.content.slice(0, CONTENT_PREVIEW_CHARS)
        const updated: Observation = {
          ...obs,
          compactionStatus: 'compacted',
          compactedAt: nowIso,
          summary,
        }
        rewrittenLines.push(JSON.stringify(updated))
        compacted.push(updated)
      }

      if (!confirm) {
        compactedCount += shardTargets
        continue
      }

      await writeShardIfChanged(relativePath, rewrittenLines)
      compactedCount += compacted.length

      for (const obs of compacted) {
        await knowledgeAuditService.record({
          action: 'observation_compacted',
          targetType: 'observation',
          targetId: obs.id,
          before: { compactionStatus: 'active' },
          after: { compactionStatus: 'compacted', compactedAt: obs.compactedAt },
          provenance: {
            workspaceId: obs.workspaceId,
            workspaceName: obs.workspaceName,
            workspacePath: obs.workspacePath,
            source: 'system',
            sourceObservationIds: [obs.id],
            fileRefs: obs.fileRefs,
            actor: 'knowledge-compact',
            createdAt: new Date(nowMs).toISOString(),
          },
        })
      }
    }

    return {
      compacted: compactedCount,
      kept: keptCount,
      dryRun: !confirm,
    }
  }

  private async auditRemovals(
    removed: Observation[],
    action: AuditAction,
    actor: string,
  ): Promise<void> {
    const nowIso = new Date().toISOString()
    for (const observation of removed) {
      await knowledgeAuditService.record({
        action,
        targetType: 'observation',
        targetId: observation.id,
        before: {
          id: observation.id,
          retentionClass: observation.retentionClass,
          createdAt: observation.createdAt,
          contentHash: observation.contentHash,
        },
        after: null,
        provenance: {
          workspaceId: observation.workspaceId,
          workspaceName: observation.workspaceName,
          workspacePath: observation.workspacePath,
          source: 'system',
          sourceObservationIds: [observation.id],
          fileRefs: observation.fileRefs,
          actor,
          createdAt: nowIso,
        },
      })
    }
  }
}

export const knowledgeObservationService = new KnowledgeObservationService()