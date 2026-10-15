// Note: hook-free terminal attribution — see .agents/notes/terminal/usage-telemetry-hook-decoupling.md
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import os from 'node:os'
import { listJsonlFiles, listJsonlFilesRecursive, parseJsonObject, readJsonConfig, readJsonlLinesWithCursor, readString, toClaudeProjectKey } from './history'
import type { UsageEngine } from '../../shared/usage'

/**
 * How close a session file's last write must be to the terminal's last pty
 * output to count as the same turn. A CLI streams its answer while the file
 * grows, so both land within seconds of each other.
 */
const CORRELATION_WINDOW_MS = 15_000
const STARTED_AT_TOLERANCE_MS = 1_000

export interface CorrelatedSession {
  sessionId: string
  namespace: string
  filePath: string
  /** File mtime at match time: when this session last grew. */
  activatedAt: number
}

export interface AttributionQuery {
  engine: UsageEngine
  cwd: string
  /** When JanusX started tracking this terminal. */
  terminalStartedAt: number
  /** When this terminal's pty last produced output. */
  lastActivityAt: number
  codexHome?: string
}

function isCorrelatable(engine: UsageEngine): engine is 'claude' | 'codex' | 'pi' {
  return engine === 'claude' || engine === 'codex' || engine === 'pi'
}

/**
 * Finds the native session that belongs to one terminal without hooks. A
 * candidate must live in this terminal's workspace (Claude project key, Codex
 * `session_meta.cwd`, Pi header `cwd`) and its last write must fall inside the
 * terminal's pty activity window.
 *
 * Attribution resolves at session birth or resume — user-driven singular
 * moments — so exactly one candidate is the normal case. Zero or several
 * candidates (concurrent terminals racing, scripted launches) returns
 * undefined: an unbound terminal shows unknown rather than another terminal's
 * numbers. The result is sticky by the caller: a session id never moves
 * between terminals once bound.
 */
export async function findCorrelatedSession(query: AttributionQuery): Promise<CorrelatedSession | undefined> {
  if (!isCorrelatable(query.engine) || !query.cwd) return undefined
  const { cwd, terminalStartedAt, lastActivityAt } = query
  const earliest = terminalStartedAt - STARTED_AT_TOLERANCE_MS
  const candidates: CorrelatedSession[] = []

  const consider = async (filePath: string, namespace: string, readIdentity: (lines: string[]) => { sessionId?: string; cwd?: string }) => {
    const info = await stat(filePath).catch(() => null)
    if (!info || info.mtimeMs < earliest) return
    if (Math.abs(info.mtimeMs - lastActivityAt) > CORRELATION_WINDOW_MS) return
    const read = await readJsonlLinesWithCursor(filePath, true)
    if (read.lines.length === 0) return
    const identity = readIdentity(read.lines)
    if (!identity.sessionId || !identity.cwd) return
    if (!pathsEqual(identity.cwd, cwd)) return
    candidates.push({ sessionId: identity.sessionId, namespace, filePath, activatedAt: info.mtimeMs })
  }

  if (query.engine === 'claude') {
    const namespace = join(os.homedir(), '.claude')
    const projectDir = join(namespace, 'projects', toClaudeProjectKey(cwd))
    for (const file of await listJsonlFiles(projectDir, name => name.endsWith('.jsonl'))) {
      // The project directory is keyed by cwd, so no content read is needed.
      await consider(file.path, namespace, lines => {
        const first = lines.map(parseJsonObject).find(value => readString(value?.sessionId) !== undefined)
        return { sessionId: readString(first?.sessionId), cwd }
      })
    }
  } else if (query.engine === 'codex') {
    const codexHome = query.codexHome?.trim() || process.env.CODEX_HOME?.trim() || join(os.homedir(), '.codex')
    for (const root of [join(codexHome, 'sessions'), join(codexHome, 'archived_sessions')]) {
      for (const file of await listJsonlFilesRecursive(root, name => name.startsWith('rollout-') && name.endsWith('.jsonl'))) {
        await consider(file.path, codexHome, lines => {
          const meta = lines.map(parseJsonObject).find(value => value?.type === 'session_meta')
          const payload = meta?.payload as Record<string, unknown> | undefined
          return { sessionId: readString(payload?.id), cwd: readString(payload?.cwd) }
        })
      }
    }
  } else {
    for (const root of await piSessionRoots()) {
      for (const file of await listJsonlFilesRecursive(root, name => name.endsWith('.jsonl'))) {
        await consider(file.path, root, lines => {
          const header = parseJsonObject(lines[0] ?? '')
          return header?.type === 'session'
            ? { sessionId: readString(header.id), cwd: readString(header.cwd) }
            : {}
        })
      }
    }
  }

  // Exactly one candidate is the only unambiguous answer.
  return candidates.length === 1 ? candidates[0] : undefined
}

async function piSessionRoots(): Promise<string[]> {
  const fallback = join(os.homedir(), '.pi', 'agent', 'sessions')
  const settings = await readJsonConfig(join(os.homedir(), '.pi', 'agent', 'settings.json'))
  const configured = readString(settings?.sessionDir)
  if (!configured) return [fallback]
  const expanded = configured.startsWith('~/') || configured === '~'
    ? join(os.homedir(), configured.slice(configured === '~' ? 1 : 2))
    : configured
  return [expanded]
}

function pathsEqual(a: string, b: string): boolean {
  return a.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() === b.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}
