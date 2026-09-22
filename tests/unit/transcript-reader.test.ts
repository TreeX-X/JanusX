import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import {
  TRANSCRIPT_TEXT_CAP,
  TRANSCRIPT_TURN_CAP,
  readTranscriptDetail,
} from '../../src/main/sessions/transcript-reader'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function writeLines(path: string, lines: Array<Record<string, unknown> | string>): Promise<string> {
  const raw = lines.map((line) => (typeof line === 'string' ? line : JSON.stringify(line))).join('\n')
  await writeFile(path, `${raw}\n`, 'utf-8')
  return path
}

async function tempFile(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'transcript-detail-'))
  roots.push(dir)
  return join(dir, name)
}

function claudeUser(text: string) {
  return { type: 'user', message: { role: 'user', content: text }, sessionId: 's', cwd: 'C:/repo' }
}

function claudeAssistant(text: string) {
  return {
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
    sessionId: 's',
    cwd: 'C:/repo',
  }
}

describe('transcript reader', () => {
  it('pairs claude questions with answers in order', async () => {
    const path = await writeLines(await tempFile('claude.jsonl'), [
      claudeUser('first question'),
      claudeAssistant('first answer'),
      claudeUser('second question'),
      claudeAssistant('second answer'),
    ])
    const detail = await readTranscriptDetail(path, 'claude')
    expect(detail?.transcriptPath).toBe(path)
    expect(detail?.truncated).toBe(false)
    expect(detail?.totalTurns).toBe(2)
    expect(detail?.turns).toEqual([
      { prompt: 'first question', excerpt: 'first answer' },
      { prompt: 'second question', excerpt: 'second answer' },
    ])
  })

  it('pairs codex turns and tolerates corrupt lines', async () => {
    const path = await writeLines(await tempFile('codex.jsonl'), [
      { type: 'session_meta', payload: { id: 't', cwd: 'C:/repo' } },
      '{not-json',
      { type: 'response_item', payload: { role: 'user', content: [{ type: 'input_text', text: 'q' }] } },
      { type: 'response_item', payload: { role: 'assistant', content: [{ type: 'output_text', text: 'a' }] } },
    ])
    const detail = await readTranscriptDetail(path, 'codex')
    expect(detail?.turns).toEqual([{ prompt: 'q', excerpt: 'a' }])
  })

  it('keeps a trailing question without an answer', async () => {
    const path = await writeLines(await tempFile('trailing.jsonl'), [
      claudeUser('answered'),
      claudeAssistant('done'),
      claudeUser('still open'),
    ])
    const detail = await readTranscriptDetail(path, 'claude')
    expect(detail?.totalTurns).toBe(2)
    expect(detail?.turns[1]).toEqual({ prompt: 'still open' })
  })

  it('caps turns to the most recent window and truncates long text', async () => {
    const lines: Array<Record<string, unknown>> = []
    for (let i = 0; i < TRANSCRIPT_TURN_CAP + 5; i += 1) {
      lines.push(claudeUser(`q${i}`), claudeAssistant('x'.repeat(TRANSCRIPT_TEXT_CAP + 10)))
    }
    const path = await writeLines(await tempFile('long.jsonl'), lines)
    const detail = await readTranscriptDetail(path, 'claude')
    expect(detail?.totalTurns).toBe(TRANSCRIPT_TURN_CAP + 5)
    expect(detail?.truncated).toBe(true)
    expect(detail?.turns).toHaveLength(TRANSCRIPT_TURN_CAP)
    expect(detail?.turns[0]?.prompt).toBe('q5')
    expect(detail?.turns[0]?.excerpt?.length).toBeLessThanOrEqual(TRANSCRIPT_TEXT_CAP + 1)
  })

  it('resolves null for missing files and unsupported engines', async () => {
    const missing = join(tmpdir(), 'transcript-detail-absent.jsonl')
    await expect(readTranscriptDetail(missing, 'claude')).resolves.toBeNull()
    const path = await writeLines(await tempFile('other.jsonl'), [claudeUser('q')])
    await expect(readTranscriptDetail(path, 'janus')).resolves.toBeNull()
    await expect(readTranscriptDetail('', 'claude')).resolves.toBeNull()
  })

  it('pairs pi session-file turns in order', async () => {
    const path = await writeLines(await tempFile('pi.jsonl'), [
      { type: 'session', version: 3, id: 'pi-1', timestamp: '2026-09-22T10:00:00.000Z', cwd: 'C:/repo/proj' },
      { type: 'message', id: 'm-1', timestamp: '2026-09-22T10:01:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'pi question' }] } },
      { type: 'thinking_level_change', thinkingLevel: 'off' },
      { type: 'message', id: 'm-2', timestamp: '2026-09-22T10:02:00.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'pi answer' }] } },
    ])
    const detail = await readTranscriptDetail(path, 'pi')
    expect(detail?.totalTurns).toBe(1)
    expect(detail?.truncated).toBe(false)
    expect(detail?.turns).toEqual([{ prompt: 'pi question', excerpt: 'pi answer' }])
  })

  it('reads opencode pairs from sqlite by session id', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'transcript-oc-'))
    roots.push(dir)
    const path = join(dir, 'opencode.db')
    const database = new DatabaseSync(path)
    database.exec(`
      CREATE TABLE session (id TEXT PRIMARY KEY, directory TEXT, title TEXT, time_created INTEGER, time_updated INTEGER);
      CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, data TEXT);
      CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER, data TEXT);
      INSERT INTO session VALUES ('ses-1', 'C:/repo', 't', 1000, 2000);
      INSERT INTO message VALUES ('m-1', 'ses-1', 1100, '{"role":"user"}');
      INSERT INTO part VALUES ('p-1', 'm-1', 'ses-1', 1100, '{"type":"text","text":"oc question"}');
      INSERT INTO message VALUES ('m-2', 'ses-1', 1200, '{"role":"assistant"}');
      INSERT INTO part VALUES ('p-2', 'm-2', 'ses-1', 1200, '{"type":"reasoning","text":"thinking"}');
      INSERT INTO part VALUES ('p-3', 'm-2', 'ses-1', 1210, '{"type":"text","text":"oc answer"}');
    `)
    database.close()
    const detail = await readTranscriptDetail(path, 'opencode', 'ses-1')
    expect(detail?.transcriptPath).toBe(path)
    expect(detail?.totalTurns).toBe(1)
    expect(detail?.truncated).toBe(false)
    expect(detail?.turns).toEqual([{ prompt: 'oc question', excerpt: 'oc answer' }])
    await expect(readTranscriptDetail(path, 'opencode')).resolves.toBeNull()
    await expect(readTranscriptDetail(path, 'opencode', 'missing')).resolves.toBeNull()
  })
})
