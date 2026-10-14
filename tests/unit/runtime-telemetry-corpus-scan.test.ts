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

const { scanNativeSessionCorpus } = await import('../../src/main/runtime-telemetry/corpus-scan')
const { UsageLedger } = await import('../../src/main/runtime-telemetry/usage-ledger')

let ledger: InstanceType<typeof UsageLedger>
let ledgerPath: string

async function writeCodexRollout(sessionId: string, events: Array<{ at: string; input: number; cached: number; output: number; total: number }>, options: { archived?: boolean; inheritedFromOrdinal?: number } = {}) {
  const root = join(testContext.homeDir, '.codex', options.archived ? 'archived_sessions' : 'sessions', '2026', '10', '14')
  await mkdir(root, { recursive: true })
  const lines = [JSON.stringify({
    timestamp: '2026-10-14T06:00:00.000Z',
    ordinal: 0,
    type: 'session_meta',
    payload: options.inheritedFromOrdinal === undefined
      ? { id: sessionId, cwd: 'C:/repo' }
      : { id: sessionId, cwd: 'C:/repo', forked_from_id: 'parent-thread', subagent_history_start_ordinal: options.inheritedFromOrdinal },
  })]
  // Real rollouts accumulate total_token_usage across events while
  // last_token_usage stays per request.
  const running = { input: 0, cached: 0, output: 0, total: 0 }
  events.forEach((event, index) => {
    running.input += event.input
    running.cached += event.cached
    running.output += event.output
    running.total += event.total
    lines.push(JSON.stringify({
      timestamp: event.at,
      ordinal: index + 1,
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          last_token_usage: {
            input_tokens: event.input,
            cached_input_tokens: event.cached,
            output_tokens: event.output,
            total_tokens: event.total,
          },
          total_token_usage: {
            input_tokens: running.input,
            cached_input_tokens: running.cached,
            output_tokens: running.output,
            total_tokens: running.total,
          },
        },
      },
    }))
  })
  await writeFile(join(root, `rollout-2026-10-14T06-00-00-${sessionId}.jsonl`), lines.join('\n'))
}

function readRecords() {
  const page = ledger.list({ start: Date.parse('2026-01-01T00:00:00Z'), end: Date.parse('2027-01-01T00:00:00Z'), limit: 2000 })
  return page.records
}

describe('corpus usage scan', () => {
  beforeEach(async () => {
    vi.stubEnv('CODEX_HOME', '')
    testContext.homeDir = await mkdtemp(join(tmpdir(), 'janusx-corpus-'))
    ledgerPath = join(testContext.homeDir, 'ledger', 'usage-ledger.sqlite')
    ledger = new UsageLedger(() => ledgerPath)
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await rm(testContext.homeDir, { recursive: true, force: true })
  })

  it('imports a never-opened codex session by event time and dedups re-scans', async () => {
    await writeCodexRollout('01a11111-1111-4111-8111-111111111111', [
      { at: '2026-10-14T06:01:00.000Z', input: 1000, cached: 200, output: 100, total: 1100 },
      { at: '2026-10-14T06:05:00.000Z', input: 500, cached: 0, output: 50, total: 550 },
    ])

    const first = await scanNativeSessionCorpus({ ledger, now: Date.parse('2026-10-14T07:00:00Z') })
    expect(first.recorded).toBe(1)
    expect(first.skipped).toBe(0)

    const records = readRecords()
    expect(records).toHaveLength(2)
    // Real event times, not the scan time.
    expect(records.map(record => record.at)).toEqual([Date.parse('2026-10-14T06:01:00Z'), Date.parse('2026-10-14T06:05:00Z')])
    expect(records.map(record => record.timeBasis)).toEqual(['event', 'event'])
    // Codex counts cache reads inside input_tokens; only reads are split out.
    expect(records[0]).toMatchObject({ inputTokens: 800, cacheReadTokens: 200, outputTokens: 100, totalTokens: 1100 })
    expect(records[1]).toMatchObject({ inputTokens: 500, cacheReadTokens: 0, outputTokens: 50, totalTokens: 550 })

    const second = await scanNativeSessionCorpus({ ledger, now: Date.parse('2026-10-14T07:05:00Z') })
    // Unchanged file: cursor hit, nothing re-read or re-recorded.
    expect(second.recorded).toBe(0)
    expect(second.skipped).toBe(1)
    expect(readRecords()).toHaveLength(2)
  })

  it('keeps an existing cumulative baseline and records only later deltas', async () => {
    await writeCodexRollout('01a22222-2222-4222-8222-222222222222', [
      { at: '2026-10-14T06:01:00.000Z', input: 1000, cached: 0, output: 100, total: 1100 },
    ])

    // The bound-terminal path baselines the session first (cumulative mode).
    ledger.record({
      engine: 'codex',
      namespace: join(testContext.homeDir, '.codex'),
      sessionId: '01a22222-2222-4222-8222-222222222222',
      mode: 'cumulative',
      counters: { inputTokens: 1000, outputTokens: 100, totalTokens: 1100 },
      collectedAt: Date.parse('2026-10-14T06:02:00Z'),
    })

    const scan = await scanNativeSessionCorpus({ ledger, now: Date.parse('2026-10-14T07:00:00Z') })
    expect(scan.recorded).toBe(1)
    // Baseline already covered the first turn: nothing new to record.
    expect(readRecords()).toHaveLength(0)

    await writeCodexRollout('01a22222-2222-4222-8222-222222222222', [
      { at: '2026-10-14T06:01:00.000Z', input: 1000, cached: 0, output: 100, total: 1100 },
      { at: '2026-10-14T06:30:00.000Z', input: 400, cached: 0, output: 60, total: 460 },
    ])
    const growth = await scanNativeSessionCorpus({ ledger, now: Date.parse('2026-10-14T07:05:00Z') })
    expect(growth.recorded).toBe(1)
    const records = readRecords()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ inputTokens: 400, outputTokens: 60, totalTokens: 460, timeBasis: 'sample' })
  })

  it('locks accounting mode so an event-imported session is never double-counted by the terminal path', async () => {
    await writeCodexRollout('01a33333-3333-4333-8333-333333333333', [
      { at: '2026-10-14T06:01:00.000Z', input: 1000, cached: 0, output: 100, total: 1100 },
    ])
    await scanNativeSessionCorpus({ ledger, now: Date.parse('2026-10-14T07:00:00Z') })
    expect(readRecords()).toHaveLength(1)

    // A later cumulative observation for the same session must be ignored.
    ledger.record({
      engine: 'codex',
      namespace: join(testContext.homeDir, '.codex'),
      sessionId: '01a33333-3333-4333-8333-333333333333',
      mode: 'cumulative',
      counters: { inputTokens: 1000, outputTokens: 100, totalTokens: 1100 },
      collectedAt: Date.parse('2026-10-14T07:10:00Z'),
    })
    expect(readRecords()).toHaveLength(1)

    await writeCodexRollout('01a33333-3333-4333-8333-333333333333', [
      { at: '2026-10-14T06:01:00.000Z', input: 1000, cached: 0, output: 100, total: 1100 },
      { at: '2026-10-14T06:40:00.000Z', input: 300, cached: 0, output: 30, total: 330 },
    ])
    await scanNativeSessionCorpus({ ledger, now: Date.parse('2026-10-14T07:15:00Z') })
    const records = readRecords()
    expect(records).toHaveLength(2)
    expect(records[1]).toMatchObject({ inputTokens: 300, outputTokens: 30, totalTokens: 330 })
  })

  it('imports claude transcripts with stable response identities', async () => {
    const projectDir = join(testContext.homeDir, '.claude', 'projects', 'C--repo')
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(projectDir, 'claude-session-1.jsonl'), [
      JSON.stringify({
        timestamp: '2026-10-10T09:00:00Z',
        sessionId: 'claude-session-1',
        message: { id: 'resp-1', role: 'assistant', stop_reason: 'end_turn', model: 'claude-sonnet-4-6', usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 300 } },
      }),
      JSON.stringify({
        timestamp: '2026-10-10T09:05:00Z',
        sessionId: 'claude-session-1',
        message: { id: 'resp-2', role: 'assistant', stop_reason: 'end_turn', model: 'claude-sonnet-4-6', usage: { input_tokens: 150, output_tokens: 30, cache_read_input_tokens: 500 } },
      }),
    ].join('\n'))

    const scan = await scanNativeSessionCorpus({ ledger, now: Date.parse('2026-10-14T07:00:00Z') })
    expect(scan.recorded).toBe(1)
    const records = readRecords()
    expect(records).toHaveLength(2)
    expect(records.map(record => record.at)).toEqual([Date.parse('2026-10-10T09:00:00Z'), Date.parse('2026-10-10T09:05:00Z')])
    expect(records[0]).toMatchObject({ inputTokens: 100, outputTokens: 20, cacheReadTokens: 300, totalTokens: 420 })

    await scanNativeSessionCorpus({ ledger, now: Date.parse('2026-10-14T07:05:00Z') })
    expect(readRecords()).toHaveLength(2)
  })

  it('scans archived codex sessions and ignores non-rollout files', async () => {
    await writeCodexRollout('01a44444-4444-4444-8444-444444444444', [
      { at: '2026-08-01T06:01:00.000Z', input: 700, cached: 0, output: 70, total: 770 },
    ], { archived: true })
    const noiseDir = join(testContext.homeDir, '.codex', 'sessions', '2026', '10', '14')
    await mkdir(noiseDir, { recursive: true })
    await writeFile(join(noiseDir, 'history.jsonl'), JSON.stringify({ type: 'session_meta' }))

    const scan = await scanNativeSessionCorpus({ ledger, now: Date.parse('2026-10-14T07:00:00Z') })
    expect(scan.recorded).toBe(1)
    expect(scan.scanned).toBe(1)
    const records = readRecords()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ totalTokens: 770, at: Date.parse('2026-08-01T06:01:00Z') })
  })

  it('imports pi sessions under their root namespace and keeps abandoned branches', async () => {
    const root = join(testContext.homeDir, '.pi', 'agent', 'sessions')
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'pi-session-1.jsonl'), [
      JSON.stringify({ type: 'session', id: 'pi-session-1', cwd: 'C:/repo', timestamp: '2026-10-11T08:00:00Z' }),
      JSON.stringify({ type: 'message', id: 'm1', parentId: null, timestamp: '2026-10-11T08:01:00Z', message: { role: 'assistant', model: 'pi-model', usage: { input: 100, output: 10, cacheRead: 5, cacheWrite: 2, totalTokens: 117 } } }),
      JSON.stringify({ type: 'message', id: 'm2', parentId: 'm1', timestamp: '2026-10-11T08:02:00Z', message: { role: 'assistant', model: 'pi-model', usage: { input: 120, output: 12, cacheRead: 6, cacheWrite: 3, totalTokens: 141 } } }),
    ].join('\n'))

    const scan = await scanNativeSessionCorpus({ ledger, now: Date.parse('2026-10-14T07:00:00Z') })
    expect(scan.recorded).toBe(1)
    const records = readRecords()
    expect(records).toHaveLength(2)
    expect(records.map(record => record.at)).toEqual([Date.parse('2026-10-11T08:01:00Z'), Date.parse('2026-10-11T08:02:00Z')])
    expect(records[1]).toMatchObject({ inputTokens: 120, outputTokens: 12, cacheReadTokens: 6, cacheWriteTokens: 3, totalTokens: 141 })
  })

  it('leaves forked-thread inherited history with the parent file', async () => {
    // Ordinals 1-2 are the parent's, copied into this subagent rollout; only
    // ordinals >= subagent_history_start_ordinal are this thread's own usage.
    await writeCodexRollout('01a55555-5555-4555-8555-555555555555', [
      { at: '2026-10-14T06:01:00.000Z', input: 900, cached: 800, output: 90, total: 990 },
      { at: '2026-10-14T06:02:00.000Z', input: 0, cached: 0, output: 0, total: 0 },
      { at: '2026-10-14T06:03:00.000Z', input: 300, cached: 0, output: 30, total: 330 },
    ], { inheritedFromOrdinal: 3 })

    const scan = await scanNativeSessionCorpus({ ledger, now: Date.parse('2026-10-14T07:00:00Z') })
    expect(scan.recorded).toBe(1)
    const records = readRecords()
    // Only the thread's own turn; the parent's 990 stays in the parent file.
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ inputTokens: 300, outputTokens: 30, totalTokens: 330, at: Date.parse('2026-10-14T06:03:00Z') })
  })

  it('keeps per-session ordinal identities from colliding across sessions', async () => {
    await writeCodexRollout('01a66666-6666-4666-8666-666666666666', [
      { at: '2026-10-14T06:01:00.000Z', input: 100, cached: 0, output: 10, total: 110 },
    ])
    await writeCodexRollout('01a77777-7777-4777-8777-777777777777', [
      { at: '2026-10-14T06:02:00.000Z', input: 200, cached: 0, output: 20, total: 220 },
    ])

    const scan = await scanNativeSessionCorpus({ ledger, now: Date.parse('2026-10-14T07:00:00Z') })
    expect(scan.recorded).toBe(2)
    const records = readRecords()
    expect(records).toHaveLength(2)
    expect(records.map(record => record.totalTokens).sort()).toEqual([110, 220])
    const page = ledger.list({ start: Date.parse('2026-01-01T00:00:00Z'), end: Date.parse('2027-01-01T00:00:00Z'), limit: 100 })
    expect(page.sessions.every(session => session.issue === undefined)).toBe(true)
  })
})
