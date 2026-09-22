import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readAssistantExcerpt } from '../../src/main/sessions/transcript-excerpt'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function fixture(lines: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'transcript-excerpt-'))
  roots.push(dir)
  const path = join(dir, 'transcript.jsonl')
  await writeFile(path, lines.join('\n'))
  return path
}

const assistantLine = (text: string) =>
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } })
const userLine = (text: string) =>
  JSON.stringify({ type: 'user', message: { content: text } })

describe('readAssistantExcerpt', () => {
  it('returns the last assistant text for claude transcripts', async () => {
    const path = await fixture([
      userLine('do the thing'),
      assistantLine('first answer'),
      userLine('again'),
      assistantLine('final answer'),
    ])
    await expect(readAssistantExcerpt(path, 'claude')).resolves.toBe('final answer')
  })

  it('skips corrupt lines and non-text blocks', async () => {
    const path = await fixture([
      '{broken',
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use' }] } }),
      assistantLine('usable'),
    ])
    await expect(readAssistantExcerpt(path, 'claude')).resolves.toBe('usable')
  })

  it('truncates long answers to the excerpt cap', async () => {
    const path = await fixture([assistantLine('x'.repeat(2000))])
    const excerpt = await readAssistantExcerpt(path, 'claude')
    expect(excerpt).toHaveLength(500)
  })

  it('yields undefined for other engines, missing files, and empty transcripts', async () => {
    const path = await fixture([assistantLine('answer')])
    await expect(readAssistantExcerpt(path, 'codex')).resolves.toBeUndefined()
    await expect(readAssistantExcerpt(path, 'opencode')).resolves.toBeUndefined()
    await expect(
      readAssistantExcerpt(join(tmpdir(), 'transcript-excerpt-missing.jsonl'), 'claude'),
    ).resolves.toBeUndefined()
    await expect(readAssistantExcerpt(undefined, 'claude')).resolves.toBeUndefined()
    const empty = await fixture([userLine('only a question')])
    await expect(readAssistantExcerpt(empty, 'claude')).resolves.toBeUndefined()
  })
})
