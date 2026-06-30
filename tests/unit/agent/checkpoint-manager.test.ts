import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'path'

// --- Mock infrastructure ---

const mockFiles: Record<string, string> = {}
const storedBlobs = new Map<string, Buffer>()
let storeCounter = 0
let uuidCounter = 0

vi.mock('crypto', () => {
  return {
    randomUUID: vi.fn(() => `uuid-${++uuidCounter}`),
    createHash: vi.fn(),
  }
})

vi.mock('../../../src/main/agent/checkpoint/git-adapter', () => {
  return {
    GitAdapter: vi.fn().mockImplementation(() => ({
      getCurrentBranch: vi.fn().mockResolvedValue('main'),
      stashPush: vi.fn().mockResolvedValue('stash@{0}'),
      stashPop: vi.fn().mockResolvedValue(undefined),
      stashDrop: vi.fn().mockResolvedValue(undefined),
      listTrackedFiles: vi.fn().mockResolvedValue(['src/index.ts', 'README.md']),
      hashObject: vi.fn().mockResolvedValue('abc123'),
      diff: vi.fn().mockResolvedValue(''),
    })),
  }
})

vi.mock('../../../src/main/agent/checkpoint/blob-store', () => {
  return {
    BlobStore: vi.fn().mockImplementation(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      store: vi.fn().mockImplementation(async (content: Buffer) => {
        const hash = `sha1-${++storeCounter}`
        storedBlobs.set(hash, content)
        return hash
      }),
      retrieve: vi.fn().mockImplementation(async (hash: string) => {
        return storedBlobs.get(hash) ?? null
      }),
      exists: vi.fn().mockImplementation(async (hash: string) => {
        return storedBlobs.has(hash)
      }),
      listHashes: vi.fn().mockImplementation(async () => {
        return Array.from(storedBlobs.keys())
      }),
      delete: vi.fn().mockImplementation(async (hash: string) => {
        storedBlobs.delete(hash)
      }),
      clear: vi.fn().mockImplementation(async () => {
        storedBlobs.clear()
      }),
    })),
  }
})

vi.mock('fs/promises', () => {
  return {
    readFile: vi.fn().mockImplementation(async (...args: unknown[]) => {
      const path = String(args[0])
      const encoding = typeof args[1] === 'string' ? args[1] : undefined
      if (mockFiles[path]) {
        return encoding ? mockFiles[path] : Buffer.from(mockFiles[path])
      }
      throw new Error('ENOENT')
    }),
    writeFile: vi.fn().mockImplementation(async (path: string, data: string) => {
      mockFiles[String(path)] = typeof data === 'string' ? data : String(data)
    }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    unlink: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockImplementation(async (path: string) => {
      if (String(path) === '/workspace' || mockFiles[String(path)]) return
      throw new Error('ENOENT')
    }),
    stat: vi.fn().mockImplementation(async (path: string) => {
      if (String(path) !== '/workspace') {
        throw new Error('ENOENT')
      }

      return {
        isDirectory: () => true,
      }
    }),
  }
})

// --- Tests ---

describe('CheckpointManager', () => {
  let manager: import('../../../src/main/agent/checkpoint/checkpoint-manager').CheckpointManager

  beforeEach(async () => {
    // Reset counters and file state
    Object.keys(mockFiles).forEach(key => delete mockFiles[key])
    storedBlobs.clear()
    storeCounter = 0
    uuidCounter = 0

    // Populate mockFiles with tracked file content (paths as the source code would resolve them)
    mockFiles[join('/workspace', 'src/index.ts')] = 'export const hello = "world"'
    mockFiles[join('/workspace', 'README.md')] = '# JanusX'

    const { CheckpointManager } = await import('../../../src/main/agent/checkpoint/checkpoint-manager')
    manager = new CheckpointManager()
    await manager.initialize('/workspace')
  })

  it('initialize() creates storage dirs', async () => {
    const fs = await import('fs/promises')
    const mkdirMock = vi.mocked(fs.mkdir)
    expect(mkdirMock).toHaveBeenCalled()
    const firstCallPath = mkdirMock.mock.calls[0][0] as string
    expect(firstCallPath).toContain('checkpoints')
    expect(firstCallPath).toContain('blobs')
    expect(mkdirMock.mock.calls[0][1]).toEqual({ recursive: true })
  })

  it('createCheckpoint() returns checkpoint with correct fields', async () => {
    const checkpoint = await manager.createCheckpoint({
      terminalId: 'term-1',
      engine: 'claude',
      prompt: 'test prompt',
      cwd: '/workspace',
    })
    expect(checkpoint.id).toBe('uuid-1')
    expect(checkpoint.terminalId).toBe('term-1')
    expect(checkpoint.engine).toBe('claude')
    expect(checkpoint.branch).toBe('main')
    expect(checkpoint.status).toBe('ready')
    expect(checkpoint.prompt).toBe('test prompt')
    expect(checkpoint.conversationIndex).toBe(1)
    expect(checkpoint.filesSnapshot).toBeDefined()
    expect(checkpoint.schemaVersion).toBe(2)
  })

  it('createCheckpoint() increments conversationIndex globally', async () => {
    await manager.createCheckpoint({
      terminalId: 'term-1',
      engine: 'claude',
      prompt: 'first',
      cwd: '/workspace',
    })
    await manager.createCheckpoint({
      terminalId: 'term-1',
      engine: 'claude',
      prompt: 'second',
      cwd: '/workspace',
    })
    await manager.createCheckpoint({
      terminalId: 'term-2',
      engine: 'codex',
      prompt: 'other terminal',
      cwd: '/workspace',
    })

    const list = await manager.listCheckpoints()
    const term1Cps = list.filter(cp => cp.terminalId === 'term-1')
    const term2Cps = list.filter(cp => cp.terminalId === 'term-2')
    expect(term1Cps.find(cp => cp.prompt === 'first')?.conversationIndex).toBe(1)
    expect(term1Cps.find(cp => cp.prompt === 'second')?.conversationIndex).toBe(2)
    expect(term2Cps[0].conversationIndex).toBe(3)
  })

  it('createCheckpoint() snapshots tracked files', async () => {
    const checkpoint = await manager.createCheckpoint({
      terminalId: 'term-1',
      engine: 'claude',
      prompt: 'snapshot test',
      cwd: '/workspace',
    })
    expect(Object.keys(checkpoint.filesSnapshot)).toContain('src/index.ts')
    expect(Object.keys(checkpoint.filesSnapshot)).toContain('README.md')
  })

  it('finalizeCheckpoint() keeps ready checkpoints ready', async () => {
    const checkpoint = await manager.createCheckpoint({
      terminalId: 'term-1',
      engine: 'claude',
      prompt: 'finalize test',
      cwd: '/workspace',
    })
    expect(checkpoint.status).toBe('ready')
    await manager.finalizeCheckpoint(checkpoint.id, '/workspace')
    const list = await manager.listCheckpoints()
    const finalized = list.find(cp => cp.id === checkpoint.id)
    expect(finalized?.status).toBe('ready')
  })

  it('finalizeCheckpoint() throws for unknown id', async () => {
    await expect(manager.finalizeCheckpoint('nonexistent-id', '/workspace')).rejects.toThrow(
      'Checkpoint not found: nonexistent-id',
    )
  })

  it('restoreCheckpoint() returns empty conflicts when files unchanged', async () => {
    const checkpoint = await manager.createCheckpoint({
      terminalId: 'term-1',
      engine: 'claude',
      prompt: 'restore test',
      cwd: '/workspace',
    })
    const result = await manager.restoreCheckpoint(checkpoint.id, '/workspace')
    expect(result.conflicts).toEqual([])
  })

  it('restoreCheckpoint() throws for unknown id', async () => {
    await expect(manager.restoreCheckpoint('nonexistent-id', '/workspace')).rejects.toThrow(
      'Checkpoint not found: nonexistent-id',
    )
  })

  it('listCheckpoints() returns sorted by createdAt desc', async () => {
    await manager.createCheckpoint({
      terminalId: 'term-1',
      engine: 'claude',
      prompt: 'first',
      cwd: '/workspace',
    })
    // Small delay to ensure different createdAt
    await new Promise(r => setTimeout(r, 10))
    await manager.createCheckpoint({
      terminalId: 'term-1',
      engine: 'claude',
      prompt: 'second',
      cwd: '/workspace',
    })

    const list = await manager.listCheckpoints()
    expect(list.length).toBe(2)
    // Most recent first
    expect(list[0].createdAt >= list[1].createdAt).toBe(true)
  })

  it('listCheckpoints() filters by terminalId', async () => {
    await manager.createCheckpoint({
      terminalId: 'term-1',
      engine: 'claude',
      prompt: 'terminal 1',
      cwd: '/workspace',
    })
    await manager.createCheckpoint({
      terminalId: 'term-2',
      engine: 'claude',
      prompt: 'terminal 2',
      cwd: '/workspace',
    })

    const filtered = await manager.listCheckpoints({ terminalId: 'term-1' })
    expect(filtered.length).toBe(1)
    expect(filtered[0].terminalId).toBe('term-1')
  })

  it('listCheckpoints() filters by engine', async () => {
    await manager.createCheckpoint({
      terminalId: 'term-1',
      engine: 'claude',
      prompt: 'claude engine',
      cwd: '/workspace',
    })
    await manager.createCheckpoint({
      terminalId: 'term-1',
      engine: 'codex',
      prompt: 'codex engine',
      cwd: '/workspace',
    })

    const filtered = await manager.listCheckpoints({ engine: 'codex' })
    expect(filtered.length).toBe(1)
    expect(filtered[0].engine).toBe('codex')
  })

  it('deleteCheckpoint() removes from internal map', async () => {
    const checkpoint = await manager.createCheckpoint({
      terminalId: 'term-1',
      engine: 'claude',
      prompt: 'delete me',
      cwd: '/workspace',
    })
    const before = await manager.listCheckpoints()
    expect(before.length).toBe(1)

    await manager.deleteCheckpoint(checkpoint.id)
    const after = await manager.listCheckpoints()
    expect(after.length).toBe(0)
  })

  it('deleteCheckpoint() removes unreferenced blobs', async () => {
    const checkpoint = await manager.createCheckpoint({
      terminalId: 'term-1',
      engine: 'claude',
      prompt: 'delete blobs',
      cwd: '/workspace',
    })
    expect(storedBlobs.size).toBeGreaterThan(0)

    await manager.deleteCheckpoint(checkpoint.id)

    expect(storedBlobs.size).toBe(0)
  })

  it('clearAll() clears checkpoint blobs', async () => {
    await manager.createCheckpoint({
      terminalId: 'term-1',
      engine: 'claude',
      prompt: 'clear blobs',
      cwd: '/workspace',
    })
    expect(storedBlobs.size).toBeGreaterThan(0)

    await manager.clearAll()

    expect(storedBlobs.size).toBe(0)
  })

  it('deleteCheckpoint() is a no-op for unknown id', async () => {
    // Should not throw
    await manager.deleteCheckpoint('nonexistent-id')
    const list = await manager.listCheckpoints()
    expect(list.length).toBe(0)
  })

  it('getDiff() returns diff string for known file', async () => {
    const checkpoint = await manager.createCheckpoint({
      terminalId: 'term-1',
      engine: 'claude',
      prompt: 'diff test',
      cwd: '/workspace',
    })

    mockFiles[join('/workspace', 'src/index.ts')] = 'export const hello = "janus"'

    const diff = await manager.getDiff(checkpoint.id, 'src/index.ts', '/workspace')
    expect(diff).toContain('--- a/src/index.ts')
    expect(diff).toContain('janus')
  })

  it('getDiff() returns empty string for unknown file', async () => {
    const checkpoint = await manager.createCheckpoint({
      terminalId: 'term-1',
      engine: 'claude',
      prompt: 'diff test',
      cwd: '/workspace',
    })
    const diff = await manager.getDiff(checkpoint.id, 'nonexistent.ts')
    expect(diff).toBe('')
  })

  it('getDiff() returns empty string for unknown checkpoint', async () => {
    const diff = await manager.getDiff('nonexistent-id', 'src/index.ts')
    expect(diff).toBe('')
  })
})
