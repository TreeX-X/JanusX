import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentSessionRegistry } from '../../src/main/sessions/session-registry'
import { scanExternalSessions } from '../../src/main/sessions/external-session-scanner'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/janusx-test-userdata' },
}))

const roots: string[] = []
const registries: AgentSessionRegistry[] = []
afterEach(async () => {
  for (const registry of registries.splice(0)) await registry.flush()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function tempDir(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix))
  roots.push(path)
  return path
}

async function writeJsonl(path: string, lines: Array<Record<string, unknown> | string>): Promise<void> {
  const { dirname } = await import('node:path')
  await mkdir(dirname(path), { recursive: true })
  const raw = lines.map((line) => (typeof line === 'string' ? line : JSON.stringify(line))).join('\n')
  await writeFile(path, `${raw}\n`, 'utf-8')
}

function claudeUser(text: string, sessionId: string, cwd: string, timestamp: string) {
  return { type: 'user', message: { role: 'user', content: text }, sessionId, cwd, timestamp }
}

function claudeAssistant(text: string, sessionId: string, cwd: string, timestamp: string) {
  return {
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
    sessionId,
    cwd,
    timestamp,
  }
}

describe('external session scanner', () => {
  it('imports claude and codex transcripts as external sessions', async () => {
    const home = await tempDir('scan-home-')
    const data = await tempDir('scan-data-')
    const registry = new AgentSessionRegistry(data)
    registries.push(registry)

    await writeJsonl(join(home, '.claude', 'projects', 'proj', 'sess-claude-1.jsonl'), [
      claudeUser('fix the login retry', 'sess-claude-1', 'C:/repo/proj', '2026-09-22T10:00:00.000Z'),
      claudeAssistant('login retry fixed', 'sess-claude-1', 'C:/repo/proj', '2026-09-22T10:01:00.000Z'),
    ])
    await writeJsonl(join(home, '.codex', 'sessions', 'rollout-20260922-thread-abc123.jsonl'), [
      { type: 'session_meta', payload: { id: 'thread-abc123', cwd: 'C:/repo/proj' } },
      { type: 'response_item', payload: { role: 'user', content: [{ type: 'input_text', text: 'add ship merge' }] } },
      { type: 'response_item', payload: { role: 'assistant', content: [{ type: 'output_text', text: 'ship merge added' }] } },
    ])
    // Missing cwd stays invisible; corrupt lines never fail the scan.
    await writeJsonl(join(home, '.claude', 'projects', 'proj', 'no-cwd.jsonl'), [
      '{not-json',
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'nowhere' }, sessionId: 'no-cwd' }),
    ])

    const summary = await scanExternalSessions(registry, { env: {}, home })
    expect(summary.scanned).toBe(3)
    expect(summary.imported).toBe(2)
    expect(summary.skipped).toBe(1)

    const sessions = registry.listSessions()
    expect(sessions).toHaveLength(2)
    for (const session of sessions) {
      expect(session.external).toBe(true)
      expect(session.archived).toBe(false)
      expect(session.transcriptPath).toBeTruthy()
      expect(session.providerSessionId).toBeTruthy()
    }
    const claude = sessions.find((session) => session.engine === 'claude')
    expect(claude).toMatchObject({ cwd: 'C:/repo/proj', firstPrompt: 'fix the login retry', turnCount: 1 })
    const claudeDetail = registry.getSession(claude!.id)
    expect(claudeDetail?.turns).toHaveLength(1)
    expect(claudeDetail?.turns[0]).toMatchObject({ prompt: 'fix the login retry', excerpt: 'login retry fixed' })

    const codex = sessions.find((session) => session.engine === 'codex')
    expect(codex).toMatchObject({ firstPrompt: 'add ship merge', turnCount: 1 })
    expect(registry.getSession(codex!.id)?.turns[0]).toMatchObject({
      prompt: 'add ship merge',
      excerpt: 'ship merge added',
    })

    // Parent workspace scope still surfaces child-path imports.
    expect(registry.listSessions({ cwd: 'C:/repo' })).toHaveLength(2)
  })

  it('never duplicates repeat scans and refreshes excerpts on growth', async () => {
    const home = await tempDir('scan-home-')
    const data = await tempDir('scan-data-')
    const registry = new AgentSessionRegistry(data)
    registries.push(registry)
    const path = join(home, '.claude', 'projects', 'proj', 'sess-claude-1.jsonl')
    await writeJsonl(path, [
      claudeUser('fix the login retry', 'sess-claude-1', 'C:/repo/proj', '2026-09-22T10:00:00.000Z'),
      claudeAssistant('login retry fixed', 'sess-claude-1', 'C:/repo/proj', '2026-09-22T10:01:00.000Z'),
    ])

    const first = await scanExternalSessions(registry, { env: {}, home })
    expect(first.imported).toBe(1)
    const second = await scanExternalSessions(registry, { env: {}, home })
    expect(second.imported).toBe(0)
    expect(second.updated).toBe(1)
    expect(registry.listSessions()).toHaveLength(1)

    await writeJsonl(path, [
      claudeUser('fix the login retry', 'sess-claude-1', 'C:/repo/proj', '2026-09-22T10:00:00.000Z'),
      claudeAssistant('login retry fixed', 'sess-claude-1', 'C:/repo/proj', '2026-09-22T10:01:00.000Z'),
      claudeUser('also cover edge cases', 'sess-claude-1', 'C:/repo/proj', '2026-09-22T10:02:00.000Z'),
      claudeAssistant('edge cases covered', 'sess-claude-1', 'C:/repo/proj', '2026-09-22T10:03:00.000Z'),
    ])
    const third = await scanExternalSessions(registry, { env: {}, home })
    expect(registry.listSessions()).toHaveLength(1)
    expect(third.updated).toBe(1)
    const [session] = registry.listSessions()
    expect(session.turnCount).toBe(2)
    expect(session.firstPrompt).toBe('fix the login retry')
    expect(registry.getSession(session.id)?.turns[0].excerpt).toBe('edge cases covered')
  })

  it('leaves hook-owned sessions in place and backfills their transcript path', async () => {
    const home = await tempDir('scan-home-')
    const data = await tempDir('scan-data-')
    const registry = new AgentSessionRegistry(data)
    registries.push(registry)
    const owned = registry.createSession({
      terminalId: 'term-1',
      workspaceId: 'ws-1',
      engine: 'claude',
      cwd: 'C:/repo/proj',
    })
    registry.notePrompt('term-1', 'live question')
    registry.noteProviderSession('term-1', 'sess-claude-1')
    registry.recordTurnEnd('term-1', 'done', undefined, 'live answer')

    await writeJsonl(join(home, '.claude', 'projects', 'proj', 'sess-claude-1.jsonl'), [
      claudeUser('fix the login retry', 'sess-claude-1', 'C:/repo/proj', '2026-09-22T10:00:00.000Z'),
      claudeAssistant('login retry fixed', 'sess-claude-1', 'C:/repo/proj', '2026-09-22T10:01:00.000Z'),
    ])
    await scanExternalSessions(registry, { env: {}, home })

    expect(registry.listSessions()).toHaveLength(1)
    const detail = registry.getSession(owned.id)
    expect(detail?.external).toBeUndefined()
    expect(detail?.transcriptPath).toContain('sess-claude-1.jsonl')
    expect(detail?.turns[0]).toMatchObject({ prompt: 'live question', excerpt: 'live answer' })
  })

  it('reads large transcripts through head plus tail windows without loading all', async () => {
    const home = await tempDir('scan-home-')
    const data = await tempDir('scan-data-')
    const registry = new AgentSessionRegistry(data)
    registries.push(registry)
    const filler = { type: 'summary', message: { role: 'assistant', content: 'x'.repeat(4000) } }
    const lines: Array<Record<string, unknown>> = [
      claudeUser('head question', 'sess-big', 'C:/repo/proj', '2026-09-22T10:00:00.000Z'),
      ...Array.from({ length: 200 }, () => filler),
      claudeAssistant('tail answer', 'sess-big', 'C:/repo/proj', '2026-09-22T11:00:00.000Z'),
    ]
    await writeJsonl(join(home, '.claude', 'projects', 'proj', 'sess-big.jsonl'), lines)
    const summary = await scanExternalSessions(registry, { env: {}, home })
    expect(summary.imported).toBe(1)
    const [session] = registry.listSessions()
    expect(session.firstPrompt).toBe('head question')
    expect(registry.getSession(session.id)?.turns[0].excerpt).toBe('tail answer')
  })

  it('skips engines without a readable store and empty homes without errors', async () => {
    const home = await tempDir('scan-home-')
    const data = await tempDir('scan-data-')
    const registry = new AgentSessionRegistry(data)
    registries.push(registry)
    const summary = await scanExternalSessions(registry, { env: {}, home })
    expect(summary).toEqual({ scanned: 0, imported: 0, updated: 0, skipped: 0 })
    expect(registry.listSessions()).toEqual([])
  })

  it('imports opencode sqlite sessions with cwd, prompts, and counts', async () => {
    const home = await tempDir('scan-home-')
    const data = await tempDir('scan-data-')
    const registry = new AgentSessionRegistry(data)
    registries.push(registry)
    const dbPath = join(home, '.local', 'share', 'opencode', 'opencode.db')
    await mkdir(join(home, '.local', 'share', 'opencode'), { recursive: true })
    const database = new DatabaseSync(dbPath)
    database.exec(`
      CREATE TABLE session (id TEXT PRIMARY KEY, directory TEXT, title TEXT, time_created INTEGER, time_updated INTEGER);
      CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, data TEXT);
      CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER, data TEXT);
      INSERT INTO session VALUES ('ses-1', 'C:/repo/proj', 't', 1000, 2000);
      INSERT INTO message VALUES ('m-1', 'ses-1', 1100, '{"role":"user"}');
      INSERT INTO part VALUES ('p-1', 'm-1', 'ses-1', 1100, '{"type":"text","text":"opencode question"}');
      INSERT INTO message VALUES ('m-2', 'ses-1', 1200, '{"role":"assistant"}');
      INSERT INTO part VALUES ('p-2', 'm-2', 'ses-1', 1200, '{"type":"text","text":"opencode answer"}');
    `)
    database.close()

    const summary = await scanExternalSessions(registry, { env: {}, home })
    expect(summary.scanned).toBe(1)
    expect(summary.imported).toBe(1)
    const [session] = registry.listSessions()
    expect(session).toMatchObject({
      engine: 'opencode',
      cwd: 'C:/repo/proj',
      firstPrompt: 'opencode question',
      turnCount: 1,
      external: true,
    })
    expect(session.transcriptPath).toBe(dbPath)
    expect(session.providerSessionId).toBe('ses-1')
    expect(registry.getSession(session.id)?.turns[0]).toMatchObject({
      prompt: 'opencode question',
      excerpt: 'opencode answer',
    })
    // Repeat scans converge without duplicating.
    const second = await scanExternalSessions(registry, { env: {}, home })
    expect(second.imported).toBe(0)
    expect(registry.listSessions()).toHaveLength(1)
  })
})
