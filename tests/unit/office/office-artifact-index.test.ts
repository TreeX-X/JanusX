import { writeFileSync } from 'fs'
import { mkdtemp, mkdir, rename, rm, symlink, utimes, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OfficeArtifactIndex,
  type OfficeArtifactIndexError,
} from '../../../src/main/office/office-artifact-index'
import type { OfficeFilesChangedEvent } from '../../../src/shared/office'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'janusx-office-index-'))
  temporaryDirectories.push(directory)
  return directory
}

function createHarness(
  roots: Map<string, string>,
  options: { maxVisitedEntries?: number; maxFiles?: number; now?: () => number } = {},
) {
  const events: OfficeFilesChangedEvent[] = []
  const subscribers = new Map<string, (eventType: 'change' | 'rename' | 'error', filename: string | Buffer | null) => void>()
  const unsubscribed: string[] = []
  const subscribe = vi.fn((rootPath: string, subscriber: typeof subscribers extends Map<string, infer T> ? T : never) => {
    subscribers.set(rootPath, subscriber)
    return () => {
      subscribers.delete(rootPath)
      unsubscribed.push(rootPath)
    }
  })
  const index = new OfficeArtifactIndex(
    async (workspaceId) => roots.get(workspaceId),
    {
      subscribe,
      onChanged: (event) => events.push(event),
      debounceMs: 200,
      ...options,
    },
  )
  return { index, events, subscribers, unsubscribed, subscribe }
}

function codeOf(error: unknown): string | undefined {
  return (error as OfficeArtifactIndexError | undefined)?.code
}

describe('OfficeArtifactIndex', () => {
  beforeEach(() => vi.useRealTimers())

  afterEach(async () => {
    vi.useRealTimers()
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
  })

  it('lists safe case-insensitive Office entries by descending mtime without following ignored or linked trees', async () => {
    const root = await temporaryDirectory()
    const outside = await temporaryDirectory()
    await mkdir(join(root, 'reports'))
    await mkdir(join(root, 'node_modules'))
    await writeFile(join(root, 'reports', 'old.DOCX'), 'old')
    await writeFile(join(root, 'new.XLSX'), 'newer')
    await writeFile(join(root, 'notes.txt'), 'ignore')
    await writeFile(join(root, 'node_modules', 'hidden.pptx'), 'ignore')
    await writeFile(join(outside, 'outside.pptx'), 'outside')
    await symlink(outside, join(root, 'linked'), 'junction')
    await utimes(join(root, 'reports', 'old.DOCX'), new Date(1_000), new Date(1_000))
    await utimes(join(root, 'new.XLSX'), new Date(2_000), new Date(2_000))
    const harness = createHarness(new Map([['workspace', root]]))

    const entries = await harness.index.list('workspace')

    expect(entries.map((entry) => entry.relPath)).toEqual(['new.XLSX', 'reports/old.DOCX'])
    expect(entries.map((entry) => entry.ext)).toEqual(['.xlsx', '.docx'])
    expect(Object.keys(entries[0]).sort()).toEqual(['ext', 'mtimeMs', 'relPath', 'size'])
    expect(JSON.stringify(entries)).not.toContain(root)
    expect(harness.events).toEqual([{ workspaceId: 'workspace', entries, reason: 'initial' }])
  })

  it('distinguishes empty, unreadable, traversal-limit, and result-limit outcomes', async () => {
    const empty = await temporaryDirectory()
    const missing = join(empty, 'missing')
    const roots = new Map([['empty', empty], ['missing', missing]])
    const harness = createHarness(roots)

    await expect(harness.index.list('empty')).resolves.toEqual([])
    await expect(harness.index.list('missing')).rejects.toSatisfy((error) => codeOf(error) === 'IO')

    await writeFile(join(empty, 'one.docx'), '1')
    await writeFile(join(empty, 'two.xlsx'), '2')
    const traversalLimited = createHarness(roots, { maxVisitedEntries: 1 })
    await expect(traversalLimited.index.list('empty')).rejects.toSatisfy((error) => codeOf(error) === 'SCAN_LIMIT')
    const resultLimited = createHarness(roots, { maxFiles: 1 })
    await expect(resultLimited.index.list('empty')).rejects.toSatisfy((error) => codeOf(error) === 'SCAN_LIMIT')
  })

  it('ensures once and reconciles targeted Office changes with one debounced snapshot', async () => {
    vi.useFakeTimers()
    const root = await temporaryDirectory()
    await writeFile(join(root, 'report.docx'), 'old')
    const harness = createHarness(new Map([['workspace', root]]))
    await Promise.all([harness.index.ensure('workspace'), harness.index.ensure('workspace'), harness.index.list('workspace')])
    expect(harness.subscribe).toHaveBeenCalledTimes(1)
    harness.events.length = 0

    await writeFile(join(root, 'report.docx'), 'updated-content')
    await writeFile(join(root, 'added.pptx'), 'presentation')
    const subscriber = harness.subscribers.get(root)!
    subscriber('change', 'report.docx')
    subscriber('change', 'added.pptx')
    subscriber('change', 'ordinary.ts')
    await vi.advanceTimersByTimeAsync(200)

    await vi.waitFor(() => expect(harness.events).toHaveLength(1))
    expect(harness.events[0].reason).toBe('watch')
    expect(harness.events[0].entries.map((entry) => entry.relPath).sort()).toEqual(['added.pptx', 'report.docx'])
    expect(harness.events[0].entries.find((entry) => entry.relPath === 'report.docx')?.size).toBe(15)
  })

  it('subscribes before scanning so initialization cannot miss a workspace change', async () => {
    const root = await temporaryDirectory()
    await writeFile(join(root, 'existing.docx'), 'existing')
    const events: OfficeFilesChangedEvent[] = []
    const scanClock = vi.fn(() => 0)
    const index = new OfficeArtifactIndex(async () => root, {
      subscribe: (_rootPath, subscriber) => {
        writeFileSync(join(root, 'late.xlsx'), 'late')
        subscriber('change', 'late.xlsx')
        subscriber('change', 'ordinary.ts')
        subscriber('rename', 'notes.md')
        return () => {}
      },
      onChanged: (event) => events.push(event),
      now: scanClock,
    })

    const entries = await index.list('workspace')

    expect(entries.map((entry) => entry.relPath).sort()).toEqual(['existing.docx', 'late.xlsx'])
    expect(events).toEqual([{ workspaceId: 'workspace', entries, reason: 'initial' }])
    expect(scanClock).toHaveBeenCalledTimes(3)
  })

  it('reconciles named Office rename, creation, and deletion without a full scan', async () => {
    vi.useFakeTimers()
    const root = await temporaryDirectory()
    const scanClock = vi.fn(() => 0)
    const harness = createHarness(new Map([['workspace', root]]), { now: scanClock })
    await harness.index.ensure('workspace')
    harness.events.length = 0
    scanClock.mockClear()
    const subscriber = harness.subscribers.get(root)!

    await writeFile(join(root, 'report.docx'), 'created')
    subscriber('rename', 'report.docx')
    await vi.advanceTimersByTimeAsync(200)
    await vi.waitFor(() => expect(harness.events).toHaveLength(1))
    expect(harness.events.at(-1)?.entries.map((entry) => entry.relPath)).toEqual(['report.docx'])

    await writeFile(join(root, 'replacement.tmp'), 'replacement')
    await rename(join(root, 'replacement.tmp'), join(root, 'report.docx'))
    subscriber('rename', 'report.docx')
    await vi.advanceTimersByTimeAsync(200)
    await vi.waitFor(() => expect(harness.events).toHaveLength(2))
    expect(harness.events.at(-1)?.entries[0].size).toBe(11)

    await rm(join(root, 'report.docx'))
    subscriber('rename', 'report.docx')
    await vi.advanceTimersByTimeAsync(200)
    await vi.waitFor(() => expect(harness.events).toHaveLength(3))
    expect(harness.events.at(-1)?.entries).toEqual([])
    expect(scanClock).not.toHaveBeenCalled()
  })

  it('uses full reconciliation for non-Office and Office-extension directory rename signals', async () => {
    vi.useFakeTimers()
    const root = await temporaryDirectory()
    await mkdir(join(root, 'reports.data'))
    await mkdir(join(root, 'archive.docx'))
    const scanClock = vi.fn(() => 0)
    const harness = createHarness(new Map([['workspace', root]]), { now: scanClock })
    await harness.index.ensure('workspace')
    harness.events.length = 0
    scanClock.mockClear()
    const subscriber = harness.subscribers.get(root)!

    await writeFile(join(root, 'reports.data', 'report.xlsx'), 'report')
    subscriber('rename', 'reports.data')
    await vi.advanceTimersByTimeAsync(200)
    await vi.waitFor(() => expect(harness.events).toHaveLength(1))
    expect(harness.events.at(-1)?.entries.map((entry) => entry.relPath)).toEqual(['reports.data/report.xlsx'])
    expect(scanClock).toHaveBeenCalled()

    scanClock.mockClear()
    await writeFile(join(root, 'archive.docx', 'slides.pptx'), 'slides')
    subscriber('rename', 'archive.docx')
    await vi.advanceTimersByTimeAsync(200)
    await vi.waitFor(() => expect(harness.events).toHaveLength(2))
    expect(harness.events.at(-1)?.entries.map((entry) => entry.relPath).sort()).toEqual([
      'archive.docx/slides.pptx',
      'reports.data/report.xlsx',
    ])
    expect(scanClock).toHaveBeenCalled()

    scanClock.mockClear()
    await rm(join(root, 'archive.docx'), { recursive: true })
    subscriber('rename', 'archive.docx')
    await vi.advanceTimersByTimeAsync(200)
    await vi.waitFor(() => expect(harness.events).toHaveLength(3))
    expect(harness.events.at(-1)?.entries.map((entry) => entry.relPath)).toEqual(['reports.data/report.xlsx'])
    expect(scanClock).toHaveBeenCalled()
  })

  it('uses fallback reconciliation for Buffer, atomic replace, rename, creation, and deletion signals', async () => {
    vi.useFakeTimers()
    const root = await temporaryDirectory()
    await writeFile(join(root, 'report.docx'), 'old')
    const harness = createHarness(new Map([['workspace', root]]))
    await harness.index.ensure('workspace')
    harness.events.length = 0
    const subscriber = harness.subscribers.get(root)!

    await writeFile(join(root, 'added.XLSX'), 'added')
    subscriber('change', Buffer.from('added.XLSX'))
    await vi.advanceTimersByTimeAsync(200)
    await vi.waitFor(() => expect(harness.events).toHaveLength(1))
    expect(harness.events.at(-1)?.entries.map((entry) => entry.relPath).sort()).toEqual(['added.XLSX', 'report.docx'])

    await writeFile(join(root, 'replacement.tmp'), 'replacement-content')
    await rename(join(root, 'replacement.tmp'), join(root, 'report.docx'))
    subscriber('rename', 'report.docx')
    await vi.advanceTimersByTimeAsync(200)
    await vi.waitFor(() => expect(harness.events).toHaveLength(2))
    expect(harness.events.at(-1)?.entries.find((entry) => entry.relPath === 'report.docx')?.size).toBe(19)

    await rm(join(root, 'report.docx'))
    subscriber('rename', 'report.docx')
    await vi.advanceTimersByTimeAsync(200)
    await vi.waitFor(() => expect(harness.events).toHaveLength(3))
    expect(harness.events.at(-1)?.entries.map((entry) => entry.relPath)).toEqual(['added.XLSX'])
  })

  it('falls back to disk reconciliation for null filenames and watcher recovery signals', async () => {
    vi.useFakeTimers()
    const root = await temporaryDirectory()
    const harness = createHarness(new Map([['workspace', root]]))
    await harness.index.ensure('workspace')
    harness.events.length = 0
    const subscriber = harness.subscribers.get(root)!

    await writeFile(join(root, 'null-signal.docx'), 'created')
    subscriber('rename', null)
    await vi.advanceTimersByTimeAsync(200)
    await vi.waitFor(() => expect(harness.events).toHaveLength(1))
    expect(harness.events.at(-1)?.entries.map((entry) => entry.relPath)).toEqual(['null-signal.docx'])

    await writeFile(join(root, 'recovered.pptx'), 'recovered')
    subscriber('error', null)
    await vi.advanceTimersByTimeAsync(200)
    await vi.waitFor(() => expect(harness.events).toHaveLength(2))
    expect(harness.events.at(-1)?.entries.map((entry) => entry.relPath).sort()).toEqual([
      'null-signal.docx',
      'recovered.pptx',
    ])
  })

  it('disposes only the requested workspace and cancels its pending event', async () => {
    vi.useFakeTimers()
    const rootA = await temporaryDirectory()
    const rootB = await temporaryDirectory()
    await writeFile(join(rootA, 'a.docx'), 'a')
    await writeFile(join(rootB, 'b.docx'), 'b')
    const harness = createHarness(new Map([['a', rootA], ['b', rootB]]))
    await harness.index.ensure('a')
    await harness.index.ensure('b')
    harness.events.length = 0

    harness.subscribers.get(rootA)!('change', 'a.docx')
    harness.index.dispose('a')
    await vi.advanceTimersByTimeAsync(200)

    expect(harness.events).toEqual([])
    expect(harness.unsubscribed).toEqual([rootA])
    expect(harness.subscribers.has(rootB)).toBe(true)
    harness.index.disposeAll()
    expect(harness.unsubscribed).toEqual([rootA, rootB])
  })

  it('invalidates an in-flight ensure without registering a late subscriber', async () => {
    const root = await temporaryDirectory()
    let resolveRoot!: (rootPath: string) => void
    const subscribe = vi.fn(() => () => {})
    const index = new OfficeArtifactIndex(
      async () => new Promise<string>((resolveWorkspace) => { resolveRoot = resolveWorkspace }),
      { subscribe },
    )

    const pending = index.ensure('workspace')
    index.dispose('workspace')
    resolveRoot(root)

    await expect(pending).rejects.toSatisfy((error) => codeOf(error) === 'IO')
    expect(subscribe).not.toHaveBeenCalled()
  })
})
