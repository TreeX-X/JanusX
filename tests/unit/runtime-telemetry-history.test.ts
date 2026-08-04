import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { DatabaseSync } from 'node:sqlite'

const testContext = vi.hoisted(() => ({ homeDir: '' }))

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>()
  return {
    ...actual,
    default: { ...actual.default, homedir: () => testContext.homeDir },
  }
})

const { getRuntimeTelemetrySnapshot } = await import('../../src/main/runtime-telemetry/history')

async function writeCodexRollout(sessionId: string, lines: string[]) {
  const sessionDir = join(testContext.homeDir, '.codex', 'sessions', '2026', '07', '30')
  await mkdir(sessionDir, { recursive: true })
  await writeFile(join(sessionDir, `rollout-2026-07-30T10-00-00-${sessionId}.jsonl`), lines.join('\n'))
}

describe('runtime telemetry history', () => {
  beforeEach(async () => {
    testContext.homeDir = await mkdtemp(join(tmpdir(), 'janusx-telemetry-'))
  })

  afterEach(async () => {
    await rm(testContext.homeDir, { recursive: true, force: true })
  })

  it('separates Claude current context from cumulative session usage', async () => {
    const projectDir = join(testContext.homeDir, '.claude', 'projects', 'C--repo')
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(projectDir, 'session-1.jsonl'), [
      JSON.stringify({
        timestamp: '2026-07-30T10:00:00Z',
        sessionId: 'session-1',
        message: {
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 300 },
        },
      }),
      JSON.stringify({
        timestamp: '2026-07-30T10:01:00Z',
        sessionId: 'session-1',
        message: {
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 150, output_tokens: 30, cache_read_input_tokens: 500 },
        },
      }),
    ].join('\n'))

    const snapshot = await getRuntimeTelemetrySnapshot({
      preset: 'claude',
      cwd: 'C:/repo',
      sessionId: 'session-1',
    })

    expect(snapshot).toMatchObject({
      sessionId: 'session-1',
      contextTokens: 650,
      inputTokens: 250,
      outputTokens: 50,
      cacheReadTokens: 800,
      totalTokens: 1_100,
      source: 'history',
      confidence: 'derived',
    })
  })

  it('combines Codex head metadata with tail usage in a long session', async () => {
    const sessionId = '12345678-1234-1234-1234-123456789abc'
    const filler = `${JSON.stringify({ timestamp: '2026-07-30T10:00:01Z', type: 'event_msg', payload: { type: 'agent_message', message: 'x'.repeat(512) } })}\n`.repeat(600)
    await writeCodexRollout(sessionId, [
      JSON.stringify({
        timestamp: '2026-07-30T10:00:00Z',
        type: 'session_meta',
        payload: { id: sessionId, cwd: 'C:/repo' },
      }),
      filler,
      JSON.stringify({
        timestamp: '2026-07-30T10:02:00Z',
        type: 'turn_context',
        payload: { model: 'gpt-5.5', cwd: 'C:/repo' },
      }),
      JSON.stringify({
        timestamp: '2026-07-30T10:02:01Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            last_token_usage: { total_tokens: 8_000 },
            total_token_usage: {
              total_tokens: 12_000,
              input_tokens: 10_000,
              cached_input_tokens: 2_000,
              output_tokens: 2_000,
            },
            model_context_window: 200_000,
          },
        },
      }),
    ])

    const snapshot = await getRuntimeTelemetrySnapshot({
      preset: 'codex',
      cwd: 'C:/repo',
      sessionId,
    })

    expect(snapshot).toMatchObject({
      sessionId,
      detectedModel: 'gpt-5.5',
      contextTokens: 8_000,
      contextWindowTokens: 200_000,
      inputTokens: 8_000,
      outputTokens: 2_000,
      cacheReadTokens: 2_000,
      totalTokens: 12_000,
      source: 'history',
      confidence: 'authoritative',
    })
  })

  it('reads Codex startup capacity and exact compactions only for a bound session', async () => {
    const sessionId = '12345678-1234-1234-1234-123456789abc'
    await writeCodexRollout(sessionId, [
      JSON.stringify({ timestamp: '2026-07-30T10:00:00Z', type: 'session_meta', payload: { id: sessionId, cwd: 'C:/repo' } }),
      JSON.stringify({ timestamp: '2026-07-30T10:00:01Z', type: 'event_msg', payload: { type: 'task_started', model_context_window: 258_400 } }),
      JSON.stringify({ timestamp: '2026-07-30T10:00:02Z', type: 'event_msg', payload: { type: 'context_compacted' } }),
      JSON.stringify({ timestamp: '2026-07-30T10:00:03Z', type: 'event_msg', payload: { type: 'context_compacted' } }),
    ])

    const snapshot = await getRuntimeTelemetrySnapshot({ preset: 'codex', cwd: 'C:/repo', sessionId })

    expect(snapshot).toMatchObject({
      sessionId,
      contextWindowTokens: 258_400,
      compactionCount: 2,
      compactionCountConfidence: 'exact',
    })
  })

  it('does not accept a filename match whose Codex session metadata belongs to another terminal', async () => {
    const requestedSessionId = '12345678-1234-1234-1234-123456789abc'
    const actualSessionId = '12345678-1234-1234-1234-123456789abd'
    await writeCodexRollout(requestedSessionId, [
      JSON.stringify({ timestamp: '2026-07-30T10:00:00Z', type: 'session_meta', payload: { id: actualSessionId, cwd: 'C:/repo' } }),
      JSON.stringify({ timestamp: '2026-07-30T10:00:01Z', type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { total_tokens: 50 } } } }),
    ])

    const snapshot = await getRuntimeTelemetrySnapshot({ preset: 'codex', cwd: 'C:/repo', sessionId: requestedSessionId })

    expect(snapshot).toBeNull()
  })

  it('reads declared Codex capacity without claiming an unrelated active session', async () => {
    const codexDir = join(testContext.homeDir, '.codex')
    await mkdir(codexDir, { recursive: true })
    await writeFile(join(codexDir, 'config.toml'), 'model = "gpt-5.6-sol"\nmodel_context_window = 258400\n')

    const snapshot = await getRuntimeTelemetrySnapshot({ preset: 'codex', cwd: 'C:/repo' })

    expect(snapshot).toMatchObject({
      detectedModel: 'gpt-5.6-sol',
      contextTokens: 0,
      contextWindowTokens: 258_400,
      source: 'configuration',
      confidence: 'declared',
    })
    expect(snapshot?.sessionId).toBeUndefined()
  })

  it('reads the declared Claude model before the first conversation', async () => {
    const claudeDir = join(testContext.homeDir, '.claude')
    await mkdir(claudeDir, { recursive: true })
    await writeFile(join(claudeDir, 'settings.json'), JSON.stringify({
      model: 'opus[1m]',
      env: { ANTHROPIC_AUTH_TOKEN: 'must-not-be-returned' },
    }))

    const snapshot = await getRuntimeTelemetrySnapshot({ preset: 'claude', cwd: 'C:/repo' })

    expect(snapshot).toEqual(expect.objectContaining({
      detectedModel: 'opus[1m]',
      contextTokens: 0,
      contextWindowTokens: 1_000_000,
      source: 'configuration',
      confidence: 'declared',
    }))
    expect(JSON.stringify(snapshot)).not.toContain('must-not-be-returned')
  })

  it('reads a uniquely configured OpenCode model before the first conversation', async () => {
    const configDir = join(testContext.homeDir, '.config', 'opencode')
    await mkdir(configDir, { recursive: true })
    await writeFile(join(configDir, 'opencode.json'), JSON.stringify({
      provider: { custom: { models: { 'glm-5.2': { name: 'GLM 5.2' } } } },
    }))

    const snapshot = await getRuntimeTelemetrySnapshot({ preset: 'opencode', cwd: 'C:/repo' })

    expect(snapshot).toEqual(expect.objectContaining({
      detectedModel: 'custom/glm-5.2',
      contextTokens: 0,
      source: 'configuration',
      confidence: 'declared',
    }))
  })

  it('reads current context and cumulative usage for an exact OpenCode session', async () => {
    const dataDir = join(testContext.homeDir, '.local', 'share', 'opencode')
    await mkdir(dataDir, { recursive: true })
    const database = new DatabaseSync(join(dataDir, 'opencode.db'))
    database.exec(`
      CREATE TABLE session (
        id TEXT PRIMARY KEY, directory TEXT, model TEXT, tokens_input INTEGER, tokens_output INTEGER,
        tokens_cache_read INTEGER, tokens_cache_write INTEGER, time_updated INTEGER
      );
      CREATE TABLE message (session_id TEXT, time_updated INTEGER, data TEXT);
    `)
    database.prepare('INSERT INTO session VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      'session-1', 'C:/repo', JSON.stringify({ id: 'glm-5.2', providerID: 'custom' }),
      1_200, 300, 400, 50, 2_000,
    )
    database.prepare('INSERT INTO message VALUES (?, ?, ?)').run(
      'session-1', 2_000, JSON.stringify({
        role: 'assistant', modelID: 'glm-5.2',
        tokens: { input: 700, output: 100, cache: { read: 200, write: 25 } },
      }),
    )
    database.close()

    const snapshot = await getRuntimeTelemetrySnapshot({
      preset: 'opencode', cwd: 'C:/repo', sessionId: 'session-1',
    })

    expect(snapshot).toMatchObject({
      sessionId: 'session-1',
      detectedModel: 'glm-5.2',
      contextTokens: 925,
      inputTokens: 1_200,
      outputTokens: 300,
      cacheReadTokens: 400,
      cacheWriteTokens: 50,
      totalTokens: 1_950,
      source: 'history',
      confidence: 'authoritative',
    })
  })
})
