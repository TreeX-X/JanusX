import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { existsSync } from 'fs'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'blob-test-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('BlobStore', () => {
  it('initialize() creates the directory', async () => {
    const { BlobStore } = await import('../../../src/main/agent/checkpoint/blob-store')
    const storePath = join(tmpDir, 'blobs')
    const store = new BlobStore(storePath)
    expect(existsSync(storePath)).toBe(false)
    await store.initialize()
    expect(existsSync(storePath)).toBe(true)
  })

  it('store() returns a 40-char hex SHA1 hash', async () => {
    const { BlobStore } = await import('../../../src/main/agent/checkpoint/blob-store')
    const store = new BlobStore(join(tmpDir, 'blobs'))
    await store.initialize()
    const hash = await store.store(Buffer.from('hello world'))
    expect(hash).toHaveLength(40)
    expect(hash).toMatch(/^[0-9a-f]{40}$/)
  })

  it('store() same content returns same hash (dedup)', async () => {
    const { BlobStore } = await import('../../../src/main/agent/checkpoint/blob-store')
    const store = new BlobStore(join(tmpDir, 'blobs'))
    await store.initialize()
    const content = Buffer.from('duplicate test content')
    const hash1 = await store.store(content)
    const hash2 = await store.store(content)
    expect(hash1).toBe(hash2)
  })

  it('store() returns different hash for different content', async () => {
    const { BlobStore } = await import('../../../src/main/agent/checkpoint/blob-store')
    const store = new BlobStore(join(tmpDir, 'blobs'))
    await store.initialize()
    const hash1 = await store.store(Buffer.from('content A'))
    const hash2 = await store.store(Buffer.from('content B'))
    expect(hash1).not.toBe(hash2)
  })

  it('retrieve() returns the stored content', async () => {
    const { BlobStore } = await import('../../../src/main/agent/checkpoint/blob-store')
    const store = new BlobStore(join(tmpDir, 'blobs'))
    await store.initialize()
    const content = Buffer.from('retrieve test')
    const hash = await store.store(content)
    const retrieved = await store.retrieve(hash)
    expect(retrieved).not.toBeNull()
    expect(retrieved!.toString()).toBe('retrieve test')
  })

  it('retrieve() returns null for nonexistent hash', async () => {
    const { BlobStore } = await import('../../../src/main/agent/checkpoint/blob-store')
    const store = new BlobStore(join(tmpDir, 'blobs'))
    await store.retrieve('0000000000000000000000000000000000000000')
    const result = await store.retrieve('0000000000000000000000000000000000000000')
    expect(result).toBeNull()
  })

  it('exists() returns true for stored hash', async () => {
    const { BlobStore } = await import('../../../src/main/agent/checkpoint/blob-store')
    const store = new BlobStore(join(tmpDir, 'blobs'))
    await store.initialize()
    const hash = await store.store(Buffer.from('exists test'))
    expect(await store.exists(hash)).toBe(true)
  })

  it('exists() returns false for missing hash', async () => {
    const { BlobStore } = await import('../../../src/main/agent/checkpoint/blob-store')
    const store = new BlobStore(join(tmpDir, 'blobs'))
    await store.initialize()
    expect(await store.exists('0000000000000000000000000000000000000000')).toBe(false)
  })

  it('listHashes() returns stored blob hashes', async () => {
    const { BlobStore } = await import('../../../src/main/agent/checkpoint/blob-store')
    const store = new BlobStore(join(tmpDir, 'blobs'))
    await store.initialize()
    const hash = await store.store(Buffer.from('list test'))
    expect(await store.listHashes()).toEqual([hash])
  })

  it('delete() removes a stored blob', async () => {
    const { BlobStore } = await import('../../../src/main/agent/checkpoint/blob-store')
    const store = new BlobStore(join(tmpDir, 'blobs'))
    await store.initialize()
    const hash = await store.store(Buffer.from('delete test'))
    await store.delete(hash)
    expect(await store.exists(hash)).toBe(false)
  })

  it('clear() removes all blobs and keeps the store usable', async () => {
    const { BlobStore } = await import('../../../src/main/agent/checkpoint/blob-store')
    const store = new BlobStore(join(tmpDir, 'blobs'))
    await store.initialize()
    await store.store(Buffer.from('clear test'))
    await store.clear()
    expect(await store.listHashes()).toEqual([])
    const hash = await store.store(Buffer.from('after clear'))
    expect(await store.exists(hash)).toBe(true)
  })
})
