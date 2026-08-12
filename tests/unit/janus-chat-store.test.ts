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
    }],
  }
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
})
