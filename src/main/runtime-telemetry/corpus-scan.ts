// Note: usage accounting is hook-free and covers never-opened history — see .agents/notes/terminal/usage-telemetry-hook-decoupling.md
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import os from 'node:os'
import {
  listJsonlFiles,
  listJsonlFilesRecursive,
  parseClaudeSession,
  parseCodexSession,
  parsePiSession,
  parseJsonObject,
  readJsonConfig,
  readJsonlLinesWithCursor,
  readString,
  type SessionFileRef,
} from './history'
import { collectCodexEvents } from './history-usage'
import type { UsageLedger } from './usage-ledger'
import type { UsageEngine, UsageObservation, UsageSourceCheckpoint } from '../../shared/usage'

type CheckpointLookup = (engine: UsageEngine, namespace: string, sessionId: string) => UsageSourceCheckpoint | undefined

export interface CorpusScanSummary {
  /** Files examined, including cursor hits. */
  scanned: number
  /** Observations handed to the ledger (idempotent on re-scan). */
  recorded: number
  /** Unchanged since the stored cursor: never re-recorded. Claude/Codex skip
   *  the read entirely; Pi must read its header before it can learn the id. */
  skipped: number
  /** Unreadable, oversized or rejected sources. */
  unavailable: number
}

/** Claude transcript basename is the session id: `<uuid>.jsonl`. */
function claudeSessionIdFromPath(path: string): string | undefined {
  const base = path.split(/[\\/]/).pop() ?? ''
  return base.toLowerCase().endsWith('.jsonl') ? base.slice(0, -'.jsonl'.length) : undefined
}

/** Codex rollout basename carries the thread uuid: `rollout-<date>-<uuid>.jsonl`. */
function codexSessionIdFromPath(path: string): string | undefined {
  const base = path.split(/[\\/]/).pop() ?? ''
  return /^rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i.exec(base)?.[1]
}

function resolveCodexHome(): string {
  return process.env.CODEX_HOME?.trim() || join(os.homedir(), '.codex')
}

/** Pi keeps sessions under the globally configured dir; project overrides stay with their terminal. */
async function resolvePiCorpusRoots(): Promise<string[]> {
  const fallback = join(os.homedir(), '.pi', 'agent', 'sessions')
  const settings = await readJsonConfig(join(os.homedir(), '.pi', 'agent', 'settings.json'))
  const configured = readString(settings?.sessionDir)
  if (!configured) return [fallback]
  const expanded = configured.startsWith('~/') || configured === '~'
    ? join(os.homedir(), configured.slice(configured === '~' ? 1 : 2))
    : configured
  return [expanded]
}

/**
 * Reads every native session store and feeds the usage ledger. Sessions the
 * ledger has never seen are imported in event mode with their real event
 * times (full history replay); sessions already carrying a cumulative
 * baseline keep that mode, and the ledger's mode lock makes the two paths
 * idempotent rather than double-counting. Terminal bindings are not involved:
 * this is the only accounting path that also covers closed terminals, offline
 * periods and sessions JanusX never opened.
 *
 * OpenCode stores sessions in one SQLite database rather than per-session
 * files, so it is not enumerated here yet; its bound-terminal path is
 * unchanged.
 */
export async function scanNativeSessionCorpus(options: {
  ledger: UsageLedger
  checkpointLookup?: CheckpointLookup
  now?: number
}): Promise<CorpusScanSummary> {
  const { ledger, checkpointLookup, now = Date.now() } = options
  const summary: CorpusScanSummary = { scanned: 0, recorded: 0, skipped: 0, unavailable: 0 }

  const record = (observation: UsageObservation | undefined, sourceSize?: number) => {
    if (!observation) {
      summary.unavailable += 1
      return
    }
    if (sourceSize !== undefined) observation.sourceSize = sourceSize
    try {
      ledger.record(observation)
      summary.recorded += 1
    } catch (error) {
      summary.unavailable += 1
      console.error('Corpus scan:', error instanceof Error ? error.message : String(error))
    }
  }

  // Claude: one JSONL per session under cwd-keyed project directories.
  const claudeNamespace = join(os.homedir(), '.claude')
  const projectsRoot = join(claudeNamespace, 'projects')
  let projectDirs: string[] = []
  try {
    projectDirs = (await readdir(projectsRoot, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => join(projectsRoot, entry.name))
  } catch {
    projectDirs = []
  }
  for (const dir of projectDirs) {
    for (const file of await listJsonlFiles(dir, name => name.endsWith('.jsonl'))) {
      summary.scanned += 1
      const sessionId = claudeSessionIdFromPath(file.path)
      const cursor = sessionId ? ledger.sessionState('claude', claudeNamespace, sessionId)?.sourceSize : undefined
      const info = await stat(file.path).catch(() => null)
      if (!info) {
        summary.unavailable += 1
        continue
      }
      if (cursor !== undefined && cursor === info.size) {
        summary.skipped += 1
        continue
      }
      const read = await readJsonlLinesWithCursor(file.path, true)
      if (read.lines.length === 0) {
        summary.unavailable += 1
        continue
      }
      const snapshot = await parseClaudeSession(file, undefined, read.lines)
      record(snapshot?.usageObservation, read.completeBytes)
    }
  }

  // Codex: rollout files under date-partitioned sessions plus archived_sessions.
  const codexHome = resolveCodexHome()
  for (const root of [join(codexHome, 'sessions'), join(codexHome, 'archived_sessions')]) {
    for (const file of await listJsonlFilesRecursive(root, name => name.startsWith('rollout-') && name.endsWith('.jsonl'))) {
      summary.scanned += 1
      const pathId = codexSessionIdFromPath(file.path)
      const info = await stat(file.path).catch(() => null)
      if (!info) {
        summary.unavailable += 1
        continue
      }
      const locked = pathId ? ledger.sessionState('codex', codexHome, pathId) : undefined
      if (locked?.sourceSize !== undefined && locked.sourceSize === info.size) {
        summary.skipped += 1
        continue
      }
      const read = await readJsonlLinesWithCursor(file.path, true)
      if (read.lines.length === 0) {
        summary.unavailable += 1
        continue
      }
      const values = read.lines.map(parseJsonObject).filter((value): value is Record<string, unknown> => value !== null)
      const meta = values.find(value => value.type === 'session_meta')
      const sessionId = readString((meta?.payload as Record<string, unknown> | undefined)?.id) ?? pathId
      if (!sessionId) {
        summary.unavailable += 1
        continue
      }
      // The filename carries the thread uuid; when it does not, fall back to
      // the id inside the file so an existing baseline is still honoured.
      const mode = locked?.mode ?? ledger.sessionState('codex', codexHome, sessionId)?.mode
      if (mode === 'cumulative') {
        const snapshot = await parseCodexSession(file, undefined, codexHome, undefined, true, checkpointLookup, read.lines)
        if (snapshot?.usageObservation) {
          snapshot.usageObservation.sourceIdentity = JSON.stringify([info.dev, info.ino, info.birthtimeMs])
        }
        record(snapshot?.usageObservation, read.completeBytes)
      } else {
        record(collectCodexEvents(codexHome, sessionId, values, now), read.completeBytes)
      }
    }
  }

  // Pi: message tree under the global session dir; namespace is the root the
  // file was found under, matching the bound-terminal path.
  for (const root of await resolvePiCorpusRoots()) {
    for (const file of await listJsonlFilesRecursive(root, name => name.endsWith('.jsonl'))) {
      summary.scanned += 1
      const info = await stat(file.path).catch(() => null)
      if (!info) {
        summary.unavailable += 1
        continue
      }
      const read = await readJsonlLinesWithCursor(file.path, true)
      if (read.lines.length === 0) {
        summary.unavailable += 1
        continue
      }
      const ref: SessionFileRef = { ...file, namespace: root }
      const snapshot = await parsePiSession(ref, undefined, undefined, undefined, read.lines)
      // Pi session ids live in the file header, so the cursor can only be
      // checked after parsing; the ledger dedups identities either way.
      const cursor = snapshot?.sessionId ? ledger.sessionState('pi', root, snapshot.sessionId)?.sourceSize : undefined
      if (cursor !== undefined && cursor === info.size) {
        summary.skipped += 1
        continue
      }
      record(snapshot?.usageObservation, read.completeBytes)
    }
  }

  return summary
}
