import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

const testContext = vi.hoisted(() => ({ homeDir: '' }))

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>()
  return {
    ...actual,
    default: { ...actual.default, homedir: () => testContext.homeDir },
  }
})

const { getRuntimeTelemetrySnapshot } = await import('../../src/main/runtime-telemetry/history')

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
    const sessionDir = join(testContext.homeDir, '.codex', 'sessions', '2026', '07', '30')
    await mkdir(sessionDir, { recursive: true })
    const filePath = join(sessionDir, `rollout-2026-07-30T10-00-00-${sessionId}.jsonl`)
    const filler = `${JSON.stringify({ timestamp: '2026-07-30T10:00:01Z', type: 'event_msg', payload: { type: 'agent_message', message: 'x'.repeat(512) } })}\n`.repeat(600)
    await writeFile(filePath, [
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
    ].join('\n'))

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
})
