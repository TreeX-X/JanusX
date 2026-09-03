import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { executeRoundtableWorkspaceTool } from '../../src/main/roundtable/workspace-tools'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'janusx-roundtable-tools-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ))
})

function contextFor(root: string, signal?: AbortSignal) {
  return { workspaceId: 'w1', workspaceRoot: root, signal: signal ?? new AbortController().signal }
}

describe('roundtable workspace.read', () => {
  it('reads text and reports absolute line numbers', async () => {
    const root = await temporaryDirectory()
    await writeFile(join(root, 'notes.txt'), 'line one\nline two\nline three\n', 'utf-8')

    const result = await executeRoundtableWorkspaceTool('workspace.read', { workspaceId: 'w1', path: 'notes.txt' }, contextFor(root)) as { content: string; sha256: string; lineStart?: number; lineEnd?: number; contentRedacted: boolean }

    expect(result.content).toContain('line two')
    expect(result.lineStart).toBe(1)
    expect(result.lineEnd).toBe(3)
    expect(result.contentRedacted).toBe(false)
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('fails closed for missing files without leaking paths', async () => {
    const root = await temporaryDirectory()

    const error = await executeRoundtableWorkspaceTool('workspace.read', { workspaceId: 'w1', path: 'missing.txt' }, contextFor(root)).then(() => null, (failure: unknown) => failure as Error & { code?: string })

    expect(error).not.toBeNull()
    expect(String(error)).not.toContain('secret')
  })

  it('fails closed for sensitive paths', async () => {
    const root = await temporaryDirectory()
    await writeFile(join(root, '.env'), 'SECRET=not-exposed', 'utf-8')

    const error = await executeRoundtableWorkspaceTool('workspace.read', { workspaceId: 'w1', path: '.env' }, contextFor(root)).then(() => null, (failure: unknown) => failure as Error)

    expect(error).not.toBeNull()
    expect(String(error)).not.toContain('not-exposed')
  })

  it('rejects invalid ranges with WORKSPACE_TOOL_INVALID_RANGE', async () => {
    const root = await temporaryDirectory()
    await writeFile(join(root, 'notes.txt'), 'hello', 'utf-8')

    for (const input of [
      { workspaceId: 'w1', path: 'notes.txt', maxBytes: 0 },
      { workspaceId: 'w1', path: 'notes.txt', maxBytes: 256 * 1024 + 1 },
      { workspaceId: 'w1', path: 'notes.txt', offset: -1 },
    ]) {
      const error = await executeRoundtableWorkspaceTool('workspace.read', input, contextFor(root)).then(() => null, (failure: unknown) => failure as { code?: string })
      expect(error?.code).toBe('WORKSPACE_TOOL_INVALID_RANGE')
    }
  })

  it('rejects workspaceId mismatch with WORKSPACE_TOOL_WORKSPACE_MISMATCH', async () => {
    const root = await temporaryDirectory()
    await writeFile(join(root, 'notes.txt'), 'hello', 'utf-8')

    const error = await executeRoundtableWorkspaceTool('workspace.read', { workspaceId: 'other', path: 'notes.txt' }, contextFor(root)).then(() => null, (failure: unknown) => failure as { code?: string })

    expect(error?.code).toBe('WORKSPACE_TOOL_WORKSPACE_MISMATCH')
  })

  it('aborts before filesystem access when cancelled', async () => {
    const root = await temporaryDirectory()
    await writeFile(join(root, 'notes.txt'), 'hello', 'utf-8')
    const controller = new AbortController()
    controller.abort()

    const error = await executeRoundtableWorkspaceTool('workspace.read', { workspaceId: 'w1', path: 'notes.txt' }, contextFor(root, controller.signal)).then(() => null, (failure: unknown) => failure as { code?: string })

    expect(error?.code).toBe('WORKSPACE_TOOL_CANCELLED')
  })

  it('serves concurrent reads independently', async () => {
    const root = await temporaryDirectory()
    await writeFile(join(root, 'a.txt'), 'aaa\n', 'utf-8')
    await writeFile(join(root, 'b.txt'), 'bbb\n', 'utf-8')
    await writeFile(join(root, 'c.txt'), 'ccc\n', 'utf-8')

    const results = await Promise.all(['a.txt', 'b.txt', 'c.txt'].map((path) =>
      executeRoundtableWorkspaceTool('workspace.read', { workspaceId: 'w1', path }, contextFor(root)) as Promise<{ content: string }>,
    ))

    expect(results.map((item) => item.content.trim()).sort()).toEqual(['aaa', 'bbb', 'ccc'])
  })
})

describe('roundtable workspace.readRange', () => {
  it('reports absolute line numbers for byte-offset ranges', async () => {
    const root = await temporaryDirectory()
    const source = 'one\ntwo\nthree\nfour\n'
    await writeFile(join(root, 'lines.txt'), source, 'utf-8')
    const offset = Buffer.byteLength('one\ntwo\n')

    const result = await executeRoundtableWorkspaceTool('workspace.readRange', { workspaceId: 'w1', path: 'lines.txt', offset, maxBytes: 64 * 1024 }, contextFor(root)) as { content: string; lineStart?: number; lineEnd?: number; sha256: string }

    expect(result.content).toContain('three')
    expect(result.lineStart).toBe(3)
    expect(result.lineEnd).toBe(4)
  })
})

describe('roundtable workspace.list', () => {
  it('lists bounded trees and skips sensitive entries', async () => {
    const root = await temporaryDirectory()
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'src', 'index.ts'), 'index', 'utf-8')
    await writeFile(join(root, 'visible.txt'), 'visible', 'utf-8')
    await writeFile(join(root, '.env'), 'SECRET=x', 'utf-8')

    const result = await executeRoundtableWorkspaceTool('workspace.list', { workspaceId: 'w1', depth: 4 }, contextFor(root)) as { entries: Array<{ path: string }>; truncated: boolean }

    expect(result.truncated).toBe(false)
    expect(result.entries.map((item) => item.path)).toContain('visible.txt')
    expect(JSON.stringify(result.entries)).not.toContain('.env')
  })

  it('rejects invalid bounds with WORKSPACE_TOOL_INVALID_LIST', async () => {
    const root = await temporaryDirectory()

    for (const input of [
      { workspaceId: 'w1', depth: 5 },
      { workspaceId: 'w1', maxEntries: 1001 },
      { workspaceId: 'w1', path: 'missing-dir' },
    ]) {
      const error = await executeRoundtableWorkspaceTool('workspace.list', input, contextFor(root)).then(() => null, (failure: unknown) => failure as { code?: string })
      expect(error).not.toBeNull()
    }
    const depthError = await executeRoundtableWorkspaceTool('workspace.list', { workspaceId: 'w1', depth: 5 }, contextFor(root)).then(() => null, (failure: unknown) => failure as { code?: string })
    expect(depthError?.code).toBe('WORKSPACE_TOOL_INVALID_LIST')
  })

  it('rejects traversal and absolute paths', async () => {
    const root = await temporaryDirectory()

    for (const path of ['../outside', '/outside']) {
      const error = await executeRoundtableWorkspaceTool('workspace.list', { workspaceId: 'w1', path }, contextFor(root)).then(() => null, (failure: unknown) => failure)
      expect(error).not.toBeNull()
    }
  })

  it('does not follow symbolic links', async () => {
    const state = await temporaryDirectory()
    const root = join(state, 'workspace')
    const outside = join(state, 'outside')
    await mkdir(root)
    await mkdir(outside)
    await writeFile(join(root, 'inside.txt'), 'inside', 'utf-8')
    await writeFile(join(outside, 'secret.txt'), 'outside secret', 'utf-8')
    try {
      await symlink(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && ['EACCES', 'EPERM'].includes(String(error.code))) return
      throw error
    }

    const result = await executeRoundtableWorkspaceTool('workspace.list', { workspaceId: 'w1', depth: 4 }, contextFor(root)) as { entries: Array<{ path: string }> }

    expect(result.entries.map((item) => item.path)).toContain('inside.txt')
    expect(JSON.stringify(result.entries)).not.toContain('secret.txt')
  })
})
