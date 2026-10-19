import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JanusChatStorageSnapshot } from '../../src/shared/ipc/janus-chat'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))

function snapshot(id: string): JanusChatStorageSnapshot {
  return {
    version: 1,
    activeConversationId: id,
    conversations: [{
      id,
      title: id,
      createdAt: 1,
      updatedAt: 1,
      messages: [],
      attachedWorkspaceIds: [],
      toolTraces: [],
      contextEpoch: 0,
    }],
  }
}

function revision(id: string, parentId: string | null, state = snapshot(id)): string {
  return JSON.stringify({ type: 'snapshot', version: 1, id, parentId, createdAt: 1, snapshot: state })
}

describe('JanusChatStore', () => {
  let root = ''
  let journalPath = ''
  let legacyPath = ''

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'janusx-chat-store-'))
    journalPath = join(root, 'chat-conversations.jsonl')
    legacyPath = join(root, 'chat-conversations.json')
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('reads the legacy snapshot when no journal exists', async () => {
    await fs.writeFile(legacyPath, JSON.stringify(snapshot('legacy')))
    const { JanusChatStore } = await import('../../src/main/janus/chat-store')
    const store = new JanusChatStore({ journalPath, legacyPath })

    expect(await store.load()).toMatchObject({ activeConversationId: 'legacy' })
  })

  it.each(['00000000-0000-4000-8000-000000000123', '../outside', '', null])('round-trips valid memo bindings and discards invalid identities: %s', async memoId => {
    const { JanusChatStore } = await import('../../src/main/janus/chat-store')
    const state = snapshot('memo-chat')
    Object.assign(state.conversations[0], { memoId })
    await new JanusChatStore({ journalPath, legacyPath }).save(state)
    const loaded = await new JanusChatStore({ journalPath, legacyPath }).load()
    expect(loaded!.conversations[0].memoId).toBe(typeof memoId === 'string' && memoId.startsWith('0000') ? memoId : undefined)
  })

  it('appends linked snapshot revisions and loads the current head', async () => {
    const { JanusChatStore } = await import('../../src/main/janus/chat-store')
    const store = new JanusChatStore({ journalPath, legacyPath })
    await store.save(snapshot('first'))
    await store.save(snapshot('second'))

    const entries = (await fs.readFile(journalPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line))
    expect(entries).toHaveLength(2)
    expect(entries[0].parentId).toBeNull()
    expect(entries[1].parentId).toBe(entries[0].id)

    const reloaded = new JanusChatStore({ journalPath, legacyPath })
    expect(await reloaded.load()).toMatchObject({ activeConversationId: 'second' })
  })

  it('ignores malformed and disconnected journal tails', async () => {
    const { JanusChatStore } = await import('../../src/main/janus/chat-store')
    const store = new JanusChatStore({ journalPath, legacyPath })
    await store.save(snapshot('valid'))
    await fs.appendFile(journalPath, '{partial\n')
    await fs.appendFile(journalPath, `${JSON.stringify({
      type: 'snapshot', version: 1, id: 'orphan', parentId: 'missing', createdAt: 2, snapshot: snapshot('orphan'),
    })}\n`)

    const reloaded = new JanusChatStore({ journalPath, legacyPath })
    expect(await reloaded.load()).toMatchObject({ activeConversationId: 'valid' })
  })

  it('keeps duplicate, branch and orphan validation while only returning the last accepted revision', async () => {
    await fs.writeFile(journalPath, [
      revision('root', null),
      revision('a', 'root'),
      revision('root', null, snapshot('duplicate')),
      revision('orphan', 'missing'),
      revision('orphan-child', 'orphan'),
      revision('b', 'root'),
      revision('a-child', 'a'),
      '{bad json}',
      JSON.stringify({ type: 'snapshot', version: 1, id: 'invalid', parentId: null, createdAt: 1, snapshot: {} }),
      revision('invalid-child', 'invalid'),
      '{"torn":',
    ].join('\n'))
    const { JanusChatStore } = await import('../../src/main/janus/chat-store')
    expect(await new JanusChatStore({ journalPath, legacyPath }).load()).toEqual(snapshot('a-child'))
  })

  it('decodes UTF-8 and CRLF across chunks and accepts a complete final revision without a newline', async () => {
    const large = snapshot('large')
    large.conversations[0].messages = Array.from({ length: 12 }, (_, index) => ({
      id: `message-${index}`, role: 'user', timestamp: index, content: '中文🙂'.repeat(12_000),
    }))
    const first = revision('large', null, large)
    // Put a multi-byte character over the 256 KiB stream boundary.
    const prefix = ' '.repeat(256 * 1024 - Buffer.byteLength(first.slice(0, first.indexOf('中文'))) - 1)
    await fs.writeFile(journalPath, `${prefix}${first}\r\n \r\n${revision('final', 'large', large)}`)
    const { JanusChatStore } = await import('../../src/main/janus/chat-store')
    expect(await new JanusChatStore({ journalPath, legacyPath }).load()).toEqual(large)
  })

  it('falls back to legacy when the journal is empty, invalid or unreadable', async () => {
    await fs.writeFile(legacyPath, JSON.stringify(snapshot('legacy')))
    const { JanusChatStore } = await import('../../src/main/janus/chat-store')
    for (const text of ['', '  \r\n{partial', revision('orphan', 'absent')]) {
      await fs.writeFile(journalPath, text)
      expect(await new JanusChatStore({ journalPath, legacyPath }).load()).toMatchObject({ activeConversationId: 'legacy' })
    }
    await fs.unlink(journalPath)
    await fs.mkdir(journalPath)
    expect(await new JanusChatStore({ journalPath, legacyPath }).load()).toMatchObject({ activeConversationId: 'legacy' })
  })

  it('recovers the valid head before saving without load and serializes concurrent revisions', async () => {
    await fs.writeFile(journalPath, `${revision('root', null)}\n${revision('orphan', 'missing')}\n`)
    const { JanusChatStore } = await import('../../src/main/janus/chat-store')
    const store = new JanusChatStore({ journalPath, legacyPath })
    await Promise.all([store.save(snapshot('next')), store.save(snapshot('last'))])
    const lines = (await fs.readFile(journalPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    expect(lines[2].parentId).toBe('root')
    expect(lines[3].parentId).toBe(lines[2].id)
    expect(await new JanusChatStore({ journalPath, legacyPath }).load()).toMatchObject({ activeConversationId: 'last' })
  })
})
