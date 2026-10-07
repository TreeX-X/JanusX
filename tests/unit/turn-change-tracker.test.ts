import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, rm, mkdir, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { TerminalTurnChangeTracker } from '../../src/main/terminal/turn-change-tracker'
import { captureTurnFiles, compareTurnFiles } from '../../src/main/terminal/turn-file-snapshot'
import type { TerminalTurnChangesEvent } from '../../src/shared/ipc/terminal'

let cwd: string
const published: TerminalTurnChangesEvent[] = []
beforeEach(async () => {
  cwd = await mkdtemp(join(await realpath(tmpdir()), 'janus-turn-diff-'))
  published.length = 0
})
afterEach(async () => {
  const root = await realpath(tmpdir())
  if (!relative(root, await realpath(cwd)).startsWith('janus-turn-diff-')) throw new Error('Unexpected test directory')
  await rm(cwd, { recursive: true, force: true })
})

describe('adjacent completed turn snapshots', () => {
  it('advances after changed and quiet turns, including edits between submissions', async () => {
    await writeFile(join(cwd, 'a.ts'), 'base\n')
    const tracker = new TerminalTurnChangeTracker(event => published.push(event))
    await tracker.register('a', cwd)
    tracker.start('a')
    await writeFile(join(cwd, 'a.ts'), 'base\none\n')
    await tracker.finish('a', 'done', 'cp')
    expect(published[0]).toMatchObject({ fileCount: 1, additions: 1, deletions: 0 })
    tracker.start('a')
    await tracker.finish('a', 'done', 'cp')
    tracker.start('a')
    await tracker.finish('a', 'done', 'cp')
    expect(published.slice(1).map(event => event.fileCount)).toEqual([0, 0])
    // A fresh input checkpoint would miss this inter-turn change.
    await writeFile(join(cwd, 'a.ts'), 'base\none\ntwo\n')
    tracker.start('a')
    await tracker.finish('a', 'done', 'cp')
    expect(published[3]).toMatchObject({ fileCount: 1, additions: 1, deletions: 0 })
    expect(published[0].additions).toBe(1)
  })
  it('ignores repeated starts and ends, and captures failure/interruption changes', async () => {
    const tracker = new TerminalTurnChangeTracker(event => published.push(event))
    await tracker.register('a', cwd)
    tracker.start('a'); tracker.start('a')
    await writeFile(join(cwd, 'new.txt'), 'one\ntwo\n')
    await Promise.all([tracker.finish('a', 'failed', null), tracker.finish('a', 'done', null)])
    expect(published).toHaveLength(1)
    expect(published[0]).toMatchObject({ kind: 'failed', additions: 2 })
    tracker.start('a')
    await rm(join(cwd, 'new.txt'))
    await tracker.finish('a', 'interrupted', null)
    expect(published[1].files[0]).toMatchObject({ status: 'deleted', deletions: 2 })
  })
  it('isolates baselines for two terminals sharing a folder', async () => {
    const tracker = new TerminalTurnChangeTracker(event => published.push(event))
    await tracker.register('a', cwd); await tracker.register('b', cwd)
    await writeFile(join(cwd, 'new.txt'), 'one\n')
    tracker.start('a'); await tracker.finish('a', 'done', null)
    tracker.start('b'); await tracker.finish('b', 'done', null)
    expect(published.map(event => event.fileCount)).toEqual([1, 1])
    tracker.start('a'); await tracker.finish('a', 'done', null)
    expect(published[2].fileCount).toBe(0)
  })
  it.each(['unregister', 'replace'])('discards in-flight results after %s', async action => {
    const initial = await captureTurnFiles(cwd)
    let resolveCapture!: (value: typeof initial) => void
    const capture = vi.fn().mockResolvedValueOnce(initial).mockImplementationOnce(() => new Promise(resolve => { resolveCapture = resolve })).mockResolvedValue(initial)
    const tracker = new TerminalTurnChangeTracker(event => published.push(event), capture)
    await tracker.register('a', cwd)
    tracker.start('a')
    const finish = tracker.finish('a', 'done', null)
    await Promise.resolve()
    tracker.unregister('a')
    if (action === 'replace') await tracker.register('a', cwd)
    resolveCapture(initial)
    await finish
    expect(published).toEqual([])
  })
  it('reports missing boundaries as unavailable and re-establishes a baseline', async () => {
    const initial = await captureTurnFiles(cwd)
    const capture = vi.fn().mockResolvedValueOnce(initial).mockRejectedValueOnce(new Error('unreadable')).mockResolvedValue(initial)
    const error = vi.fn()
    const tracker = new TerminalTurnChangeTracker(event => published.push(event), capture, error)
    await tracker.register('a', cwd)
    for (let i = 0; i < 3; i++) { tracker.start('a'); await tracker.finish('a', 'done', null) }
    expect(published.map(event => event.available)).toEqual([false, false, true])
    expect(error).toHaveBeenCalledTimes(1)
  })
})

describe('bounded file capture', () => {
  it('honors Git ignores and preserves Unicode paths', async () => {
    await promisify(execFile)('git', ['init', '-q'], { cwd })
    await writeFile(join(cwd, '.gitignore'), '*.log\n')
    await writeFile(join(cwd, 'ignored.log'), 'noise')
    await writeFile(join(cwd, '中文 file.ts'), 'source')
    const snapshot = await captureTurnFiles(cwd)
    expect(snapshot.has('中文 file.ts')).toBe(true)
    expect(snapshot.has('ignored.log')).toBe(false)
    expect([...snapshot.keys()].some(path => path.startsWith('.git/'))).toBe(false)
  })
  it('marks binaries and large files without line counts and excludes checkpoint storage', async () => {
    const before = await captureTurnFiles(cwd)
    await mkdir(join(cwd, '.janusX'))
    await writeFile(join(cwd, '.janusX', 'internal.txt'), 'ignore')
    await writeFile(join(cwd, 'binary.bin'), Buffer.from([0, 1, 2]))
    await writeFile(join(cwd, 'large.txt'), Buffer.alloc(2 * 1024 * 1024, 65))
    const after = await captureTurnFiles(cwd)
    expect(after.has('.janusX/internal.txt')).toBe(false)
    expect(compareTurnFiles(before, after)).toEqual([
      expect.objectContaining({ path: 'binary.bin', additions: null, deletions: null }),
      expect.objectContaining({ path: 'large.txt', additions: null, deletions: null }),
    ])
  })
})
