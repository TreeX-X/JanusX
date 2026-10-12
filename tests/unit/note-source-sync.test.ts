import { afterEach, expect, it, vi } from 'vitest'
const read = vi.hoisted(() => vi.fn())
vi.mock('@/services/harness', () => ({ readNoteSource: read }))
vi.mock('@/i18n', () => ({ default: { t: (key: string) => key } }))
import { noteSourceKey, useNoteSourceStore } from '../../src/renderer/src/stores/note-source'
const root = 'C:/fixture', uri = 'note://repo/note'
const source = (hash: string) => ({ uri, sourceHash: hash, doc: { body: hash } })
afterEach(() => { vi.useRealTimers(); read.mockReset(); useNoteSourceStore.setState({ sources: {} }) })

it('delivers the post-write body while a same-Note read is stuck, and rejects its late stale result', async () => {
  let release!: (value: any) => void
  read.mockImplementationOnce(() => new Promise(resolve => { release = resolve })).mockResolvedValue(source('new'))
  const old = useNoteSourceStore.getState().refresh(root, uri)
  await vi.waitFor(() => expect(read).toHaveBeenCalledOnce())
  const current = useNoteSourceStore.getState().refresh(root, uri, true)
  expect(await current).toMatchObject({ sourceHash: 'new' })
  expect(await old).toMatchObject({ sourceHash: 'new' })
  release(source('old')); await Promise.resolve()
  expect(useNoteSourceStore.getState().sources[noteSourceKey(root, uri)].sourceHash).toBe('new')
})

it('releases timed-out body reads for a real retry and ignores the expired response', async () => {
  vi.useFakeTimers()
  let release!: (value: any) => void
  read.mockImplementationOnce(() => new Promise(resolve => { release = resolve })).mockResolvedValue(source('recovered'))
  const failed = useNoteSourceStore.getState().refresh(root, uri).catch(error => error.message)
  await vi.advanceTimersByTimeAsync(15001)
  expect(await failed).toContain('refreshTimeout')
  expect(await useNoteSourceStore.getState().refresh(root, uri)).toMatchObject({ sourceHash: 'recovered' })
  release(source('expired')); await Promise.resolve()
  expect(useNoteSourceStore.getState().sources[noteSourceKey(root, uri)].sourceHash).toBe('recovered')
  expect(read).toHaveBeenCalledTimes(2)
})
