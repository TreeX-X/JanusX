import { SUPPORTED_HARNESS_PROFILE, sha256HexBytes } from '@janus-agent/harness-node'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { projectChatContext } from '../../src/main/harness/chat-context'

const REPO = '8fa19f17-c717-43a8-93a7-810a5e0cbc91'
const ID = '11111111-1111-4111-8111-111111111111'
const uri = 'note://' + REPO + '/' + ID
const roots: string[] = []
async function checkout(title: string, body = 'Missing behavior.') {
  const root = await mkdtemp(join(tmpdir(), 'project-context-'))
  roots.push(root)
  await mkdir(join(root, '.agents', 'notes'), { recursive: true })
  await writeFile(join(root, '.agents', 'harness.json'), JSON.stringify({ schemaVersion: 1, repoId: REPO, name: 'Context fixture', profile: SUPPORTED_HARNESS_PROFILE }))
  const raw = ['---', 'schema: harness-note/1', 'id: ' + ID, 'kind: requirement', 'lifecycle: accepted', 'created: 2026-09-25', '---',
    '# ' + title, '', '## Problem', body, '', '## Expected behavior', 'Works.', '', '## Scope', 'Widget.', '', '## Acceptance criteria', '- [ ] AC-1: works', ''].join('\n')
  await writeFile(join(root, '.agents', 'notes', 'requirement.md'), raw)
  return { root, hash: sha256HexBytes(Buffer.from(raw)) }
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

describe('project chat checkout selection', () => {
  it('selects the exact authorized checkout among divergent copies of one Note', async () => {
    const a = await checkout('Selected checkout')
    const b = await checkout('Other checkout')
    const context = await projectChatContext([b.root, a.root], [{ uri, checkoutPath: a.root, expectedHash: a.hash }])
    expect(context).toContain('# Selected checkout')
    expect(context).not.toContain('# Other checkout')
    await expect(projectChatContext([a.root, b.root], [{ uri }])).rejects.toThrow('CONFLICT')
    await expect(projectChatContext([a.root], [{ uri, checkoutPath: b.root }])).rejects.toThrow('PERMISSION_DENIED')
    await expect(projectChatContext([a.root, b.root], [{ uri, checkoutPath: b.root, expectedHash: a.hash }])).rejects.toThrow('STALE_BASELINE')
  })

  it('does not let a valid duplicate URI authorize a second unattached checkout', async () => {
    const a = await checkout('Allowed')
    const b = await checkout('Unattached')
    await expect(projectChatContext([a.root], [{ uri, checkoutPath: a.root }, { uri, checkoutPath: b.root }]))
      .rejects.toThrow('PERMISSION_DENIED')
  })

  it('deduplicates repeated references and equivalent authorized root spellings', async () => {
    const a = await checkout('Allowed')
    const ref = { uri, checkoutPath: a.root, expectedHash: a.hash }
    const context = await projectChatContext([a.root, a.root + '/.'], [ref, ref])
    expect(context.match(/Note: note:\/\//g)).toHaveLength(1)
  })
})

// Note: batch selection degrades at the byte budget instead of failing the turn —
// see .agents/notes/2026-09-30-blueprint-batch-context--7c1e4a92.md
describe('project chat context budget', () => {
  /** One Note whose body alone exceeds the per-turn budget. */
  it('always admits the first Note even when it alone overflows', async () => {
    const a = await checkout('Oversized', 'x'.repeat(150_000))
    const context = await projectChatContext([a.root], [{ uri, checkoutPath: a.root, expectedHash: a.hash }])
    expect(context).toContain('# Oversized')
    expect(context).not.toContain('Context budget reached')
  })

  it('refuses identity failures instead of injecting a partial baseline', async () => {
    const a = await checkout('Stale')
    await expect(projectChatContext([a.root], [{ uri, checkoutPath: a.root, expectedHash: '0'.repeat(64) }]))
      .rejects.toThrow('STALE_BASELINE')
  })
})
