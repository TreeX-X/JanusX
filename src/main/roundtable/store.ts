import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { app } from 'electron'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { RoundtableEventEnvelope, RoundtableState } from '../../shared/roundtable/events'

export interface RoundtableStorePaths { journalPath: string }
function defaultPaths(): RoundtableStorePaths {
  const userData = typeof app?.getPath === 'function' ? app.getPath('userData') : process.cwd()
  return { journalPath: join(userData, 'janusx', 'roundtable-events.jsonl') }
}

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/

function contextPathFor(journalPath: string, sessionId: string): string | null {
  if (!SESSION_ID_PATTERN.test(sessionId)) return null
  return join(dirname(journalPath), `roundtable-context-${sessionId}.txt`)
}

function hashContext(context: string): string {
  return createHash('sha256').update(context, 'utf8').digest('hex')
}

const BUNDLE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/

function bundlePathFor(journalPath: string, bundleId: string, revision: number): string | null {
  if (!BUNDLE_ID_PATTERN.test(bundleId)) return null
  if (!Number.isInteger(revision) || revision < 1) return null
  return join(dirname(journalPath), 'roundtable-bundles', `${bundleId}-r${revision}.json`)
}

export class RoundtableStore {
  private readonly contextHashes = new Map<string, string>()
  constructor(private readonly paths: RoundtableStorePaths = defaultPaths()) {}
  async append(sessionId: string, event: RoundtableEventEnvelope, state: RoundtableState): Promise<void> {
    await mkdir(dirname(this.paths.journalPath), { recursive: true })
    // Stage B slimming: the full workspaceContext (up to 96KB) must not be
    // duplicated into every journal line. Persist it once per session in a
    // sidecar file and store only a light snapshot in the journal.
    const context = state.workspaceContext ?? ''
    let contextHash: string | undefined
    if (context) {
      contextHash = hashContext(context)
      if (this.contextHashes.get(sessionId) !== contextHash) {
        const sidecar = contextPathFor(this.paths.journalPath, sessionId)
        if (sidecar) {
          await mkdir(dirname(sidecar), { recursive: true })
          await writeFile(sidecar, context, 'utf8')
        }
        this.contextHashes.set(sessionId, contextHash)
      } else {
        contextHash = this.contextHashes.get(sessionId)
      }
    }
    const { workspaceContext: _dropped, ...lightState } = state
    void _dropped
    await appendFile(this.paths.journalPath, `${JSON.stringify({ id: randomUUID(), sessionId, event, state: lightState, contextHash })}\n`, 'utf8')
  }
  async load(sessionId: string): Promise<{ events: RoundtableEventEnvelope[]; state: RoundtableState } | null> {
    let content: string
    try { content = await readFile(this.paths.journalPath, 'utf8') } catch { return null }
    let latest: { events: RoundtableEventEnvelope[]; state: RoundtableState } | null = null
    for (const line of content.split('\n')) {
      try {
        const value = JSON.parse(line) as { sessionId?: string; event?: RoundtableEventEnvelope; state?: RoundtableState }
        if (value.sessionId !== sessionId || !value.event || !value.state) continue
        latest ??= { events: [], state: value.state }
        latest.events.push(value.event); latest.state = value.state
      } catch { /* ignore corrupt journal lines */ }
    }
    if (!latest) return null
    // Reattach the workspace context sidecar for light snapshots. Old journal
    // lines that still embed a full workspaceContext keep working untouched.
    if (!latest.state.workspaceContext) {
      const sidecar = contextPathFor(this.paths.journalPath, sessionId)
      if (sidecar) {
        try { latest.state = { ...latest.state, workspaceContext: await readFile(sidecar, 'utf8') } } catch { /* sidecar missing: stay empty */ }
      }
    }
    return latest
  }
  /**
   * Persists a bundle proposal before anything lands in `.agents/notes`.
   * Retries reuse the same file (same id+revision); a new discussion writes
   * a new revision. Returns the file path, or null for hostile ids.
   */
  async saveBundle(bundle: unknown): Promise<string | null> {
    if (!bundle || typeof bundle !== 'object') return null
    const value = bundle as Record<string, unknown>
    if (typeof value['id'] !== 'string' || typeof value['revision'] !== 'number') return null
    const path = bundlePathFor(this.paths.journalPath, value['id'], value['revision'])
    if (!path) return null
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(bundle, null, 2), 'utf8')
    return path
  }
  async loadBundle(bundleId: string, revision: number): Promise<Record<string, unknown> | null> {
    const path = bundlePathFor(this.paths.journalPath, bundleId, revision)
    if (!path) return null
    try {
      return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
    } catch {
      return null
    }
  }
}
export const roundtableStore = new RoundtableStore()
