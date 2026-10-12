import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareSessionRecovery } from '../../src/main/sessions/session-recovery'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), 'session-recovery-'))
  roots.push(home)
  const cwd = join(home, 'repo')
  await mkdir(cwd)
  return { home, cwd, options: { home, env: {} } }
}

async function history(path: string) {
  const { dirname } = await import('node:path')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, '{"history":true}\n')
  return path
}

describe('native session recovery preflight', () => {
  it.each(['claude', 'codex'])('pins the %s config home to the recorded native history', async (engine) => {
    const { home, cwd, options } = await fixture()
    const configHome = join(home, 'custom-config')
    const path = await history(engine === 'claude'
      ? join(configHome, 'projects', 'repo', 'id-1.jsonl')
      : join(configHome, 'sessions', '2026', 'rollout-date-id-1.jsonl'))
    expect(await prepareSessionRecovery({ engine, cwd, providerSessionId: 'id-1', transcriptPath: path }, options))
      .toEqual({ transcriptPath: path, environment: engine === 'claude'
        ? { claudeConfigDir: configHome } : { codexHome: configHome } })
  })

  it.each(['claude', 'codex'])('locates %s history by exact id in the configured store', async (engine) => {
    const { home, cwd } = await fixture()
    const configHome = join(home, 'custom-config')
    await history(engine === 'claude'
      ? join(configHome, 'projects', 'repo', 'unrelated.jsonl')
      : join(configHome, 'sessions', 'rollout-date-unrelated.jsonl'))
    const path = await history(engine === 'claude'
      ? join(configHome, 'projects', 'repo', 'id-1.jsonl')
      : join(configHome, 'sessions', 'rollout-date-id-1.jsonl'))
    const options = { home, env: engine === 'claude' ? { CLAUDE_CONFIG_DIR: configHome } : { CODEX_HOME: configHome } }
    expect((await prepareSessionRecovery({ engine, cwd, providerSessionId: 'id-1' }, options)).transcriptPath).toBe(path)
    await expect(prepareSessionRecovery({ engine, cwd, providerSessionId: 'missing' }, options)).rejects.toThrow('not found')
  })

  it('rejects missing identity, cwd, history, or a mismatched history file', async () => {
    const { home, cwd, options } = await fixture()
    const path = await history(join(home, '.claude', 'projects', 'repo', 'other.jsonl'))
    const source = { engine: 'claude', cwd, providerSessionId: 'id-1', transcriptPath: path }
    await expect(prepareSessionRecovery({ ...source, providerSessionId: ' ' }, options)).rejects.toThrow('identity')
    await expect(prepareSessionRecovery({ ...source, cwd: join(home, 'missing') }, options)).rejects.toThrow('directory')
    await expect(prepareSessionRecovery(source, options)).rejects.toThrow('identity')
    await expect(prepareSessionRecovery({ ...source, transcriptPath: join(home, 'id-1.jsonl') }, options)).rejects.toThrow('unavailable')
    // A stale recorded path must not silently borrow another transcript.
    await history(join(home, '.claude', 'projects', 'repo', 'id-1.jsonl'))
    await expect(prepareSessionRecovery({ ...source, transcriptPath: join(home, 'id-1.jsonl') }, options)).rejects.toThrow('unavailable')
    const outside = await history(join(home, 'id-1.jsonl'))
    await expect(prepareSessionRecovery({ ...source, transcriptPath: outside }, options)).rejects.toThrow('native provider')
  })

  it('requires the Opencode session to exist in the active readable sqlite store', async () => {
    const { home, cwd, options } = await fixture()
    const path = join(home, '.local', 'share', 'opencode', 'opencode.db')
    const { dirname } = await import('node:path')
    await mkdir(dirname(path), { recursive: true })
    const db = new DatabaseSync(path)
    db.exec("CREATE TABLE session (id TEXT PRIMARY KEY); INSERT INTO session VALUES ('ses_1')")
    db.close()
    const source = { engine: 'opencode', cwd, providerSessionId: 'ses_1', transcriptPath: path }
    expect(await prepareSessionRecovery(source, options)).toEqual({ transcriptPath: path, environment: {} })
    expect((await prepareSessionRecovery({ ...source, transcriptPath: undefined }, options)).transcriptPath).toBe(path)
    await expect(prepareSessionRecovery({ ...source, providerSessionId: 'gone' }, options)).rejects.toThrow('no longer')
    const foreign = await history(join(home, 'foreign.db'))
    await expect(prepareSessionRecovery({ ...source, transcriptPath: foreign }, options)).rejects.toThrow('active session store')
    await writeFile(path, 'corrupt database')
    await expect(prepareSessionRecovery(source, options)).rejects.toThrow('could not be verified')
  })

  it('resolves Codex archived history by exact identity', async () => {
    const { home, cwd, options } = await fixture()
    const path = await history(join(home, '.codex', 'archived_sessions', 'rollout-date-id-1.jsonl'))
    expect(await prepareSessionRecovery({ engine: 'codex', cwd, providerSessionId: 'id-1' }, options))
      .toEqual({ transcriptPath: path, environment: { codexHome: join(home, '.codex') } })
  })
})
