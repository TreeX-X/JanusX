import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readAssistantExcerpt } from '../../src/main/sessions/transcript-excerpt'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function home(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'transcript-excerpt-'))
  roots.push(dir)
  return dir
}

async function writeHomeFile(baseDir: string, rel: string, content: string): Promise<string> {
  const { mkdir } = await import('node:fs/promises')
  const path = join(baseDir, rel)
  await mkdir(join(baseDir, rel.split('/').slice(0, -1).join('/')), { recursive: true })
  await writeFile(path, content)
  return path
}

const assistantLine = (text: string) =>
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } })
const userLine = (text: string) =>
  JSON.stringify({ type: 'user', message: { content: text } })

describe('readAssistantExcerpt', () => {
  it('returns the last assistant text for claude transcripts', async () => {
    const baseDir = await home()
    const path = await writeHomeFile(
      baseDir,
      't.jsonl',
      [userLine('do the thing'), assistantLine('first answer'), userLine('again'), assistantLine('final answer')].join('\n'),
    )
    await expect(readAssistantExcerpt({ transcriptPath: path, engine: 'claude' })).resolves.toBe(
      'final answer',
    )
  })

  it('skips corrupt lines and non-text blocks', async () => {
    const baseDir = await home()
    const path = await writeHomeFile(
      baseDir,
      't.jsonl',
      [
        '{broken',
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use' }] } }),
        assistantLine('usable'),
      ].join('\n'),
    )
    await expect(readAssistantExcerpt({ transcriptPath: path, engine: 'claude' })).resolves.toBe(
      'usable',
    )
  })

  it('truncates long answers to the excerpt cap', async () => {
    const baseDir = await home()
    const path = await writeHomeFile(baseDir, 't.jsonl', assistantLine('x'.repeat(2000)))
    const excerpt = await readAssistantExcerpt({ transcriptPath: path, engine: 'claude' })
    expect(excerpt).toHaveLength(500)
  })

  it('yields undefined for engines without a readable store or missing input', async () => {
    const baseDir = await home()
    const path = await writeHomeFile(baseDir, 't.jsonl', assistantLine('answer'))
    await expect(
      readAssistantExcerpt({ transcriptPath: path, engine: 'opencode', baseDir }),
    ).resolves.toBeUndefined()
    await expect(
      readAssistantExcerpt({ transcriptPath: path, engine: 'pi', baseDir }),
    ).resolves.toBeUndefined()
    await expect(
      readAssistantExcerpt({ transcriptPath: join(baseDir, 'missing.jsonl'), engine: 'claude' }),
    ).resolves.toBeUndefined()
    await expect(readAssistantExcerpt({ engine: 'claude' })).resolves.toBeUndefined()
    await expect(readAssistantExcerpt({ engine: 'mystery' })).resolves.toBeUndefined()
    const empty = await writeHomeFile(baseDir, 'q.jsonl', userLine('only a question'))
    await expect(
      readAssistantExcerpt({ transcriptPath: empty, engine: 'claude' }),
    ).resolves.toBeUndefined()
  })

  it('resolves codex rollouts by thread id or freshest matching cwd', async () => {
    const baseDir = await home()
    const threadId = '01a05c43-1d23-7202-bfd0-5758a49ec379'
    const meta = (id: string, cwd: string) =>
      JSON.stringify({ type: 'session_meta', payload: { id, cwd } })
    const assistant = (text: string) =>
      JSON.stringify({
        type: 'response_item',
        payload: { role: 'assistant', content: [{ type: 'output_text', text }] },
      })
    const stale = await writeHomeFile(
      baseDir,
      '.codex/sessions/2026/09/01/rollout-2026-09-01T09-00-00-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl',
      [meta('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'C:\\work\\repo'), assistant('stale')].join('\n'),
    )
    const fresh = await writeHomeFile(
      baseDir,
      `.codex/sessions/2026/09/02/rollout-2026-09-02T10-00-00-${threadId}.jsonl`,
      [meta(threadId, 'C:\\work\\repo'), assistant('fresh answer')].join('\n'),
    )
    await utimes(stale, new Date('2026-09-01'), new Date('2026-09-01'))
    await utimes(fresh, new Date('2026-09-02'), new Date('2026-09-02'))

    // Exact thread hit wins regardless of cwd.
    await expect(
      readAssistantExcerpt({ engine: 'codex', baseDir, threadId, cwd: 'C:\\other' }),
    ).resolves.toBe('fresh answer')
    // Without a thread, the freshest cwd match wins.
    await expect(
      readAssistantExcerpt({ engine: 'codex', baseDir, cwd: 'C:\\work\\repo' }),
    ).resolves.toBe('fresh answer')
    // Unknown cwd resolves nothing.
    await expect(
      readAssistantExcerpt({ engine: 'codex', baseDir, cwd: 'C:\\nowhere' }),
    ).resolves.toBeUndefined()
  })

  it('reads janus histories by exact session id', async () => {
    const baseDir = await home()
    await writeHomeFile(
      baseDir,
      '.janus/history/sess-1.jsonl',
      JSON.stringify({
        id: 'sess-1',
        messages: [
          { role: 'user', content: 'do it' },
          { role: 'assistant', content: 'first' },
          { role: 'assistant', content: [{ type: 'text', text: 'second ' }, { type: 'tool-call', toolName: 'x' }, { type: 'text', text: 'done' }] },
        ],
      }),
    )
    await expect(
      readAssistantExcerpt({ engine: 'janus', baseDir, sessionId: 'sess-1' }),
    ).resolves.toBe('second done')
    await expect(
      readAssistantExcerpt({ engine: 'janus', baseDir, sessionId: 'missing' }),
    ).resolves.toBeUndefined()
    await expect(readAssistantExcerpt({ engine: 'janus', baseDir })).resolves.toBeUndefined()
  })
})
