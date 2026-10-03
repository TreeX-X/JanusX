import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureLocalResource, KnowledgeLocalResourceInstaller } from '../../../src/main/knowledge/knowledge-local-resources'

vi.mock('electron', () => ({ app: {}, net: {} }))
let root: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'janusx-model-resources-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
const asset = (name: string, body: string) => ({ name, bytes: Buffer.byteLength(body), url: `https://example.invalid/${name}`, sha256: createHash('sha256').update(body).digest('hex') })
const signal = () => new AbortController().signal
const catalog = { runtime: asset('runtime.zip', 'runtime'), model: asset('model.gguf', 'model') }
const report = { ok: true, mode: 'gpu' as const, device: 'Vulkan0', availableMemoryMiB: 16000,
  modelContextTokens: 262144, recommendedContextTokens: 32768, selectedContextTokens: 32768, supportedContextTokens: [32768] }
const fetcher = vi.fn(async (url: string) => new Response(url.endsWith('runtime.zip') ? 'runtime' : 'model'))
const extract = vi.fn(async (_archive: string, target: string) => {
  await writeFile(join(target, 'llama-server.exe'), 'exe')
  await writeFile(join(target, 'ggml-vulkan.dll'), 'dll')
})
beforeEach(() => { fetcher.mockClear(); extract.mockClear() })
async function finish(installer: KnowledgeLocalResourceInstaller) {
  await vi.waitFor(() => expect(['ready', 'failed', 'cancelled']).toContain(installer.status().phase))
  return installer.status()
}

it('streams and verifies downloads, reuses only matching files and preserves cache on a bad replacement', async () => {
  const spec = asset('file.bin', 'complete'), fetch = vi.fn(async () => new Response('complete'))
  const phases: string[] = []
  const path = await ensureLocalResource(spec, root, signal(), fetch, phase => phases.push(phase))
  expect(await readFile(path, 'utf8')).toBe('complete')
  expect(phases).toContain('downloading')
  await ensureLocalResource(spec, root, signal(), fetch, () => {})
  expect(fetch).toHaveBeenCalledTimes(1)
  await writeFile(path, 'tampered')
  await expect(ensureLocalResource(spec, root, signal(), async () => new Response('bad-hash'), () => {})).rejects.toThrow('local-download-hash-mismatch')
  expect(await readFile(path, 'utf8')).toBe('tampered')
  expect((await readdir(root)).filter(name => name.endsWith('.part'))).toEqual([])
})

it('rejects short, oversized and advertised size mismatches without publishing a model', async () => {
  for (const response of [new Response('x'), new Response('too much'), new Response('model', { headers: { 'content-length': '42' } })]) {
    await expect(ensureLocalResource(catalog.model, root, signal(), async () => response, () => {})).rejects.toThrow('local-download-size-mismatch')
    expect(await readdir(root)).toEqual([])
  }
})

it('cancels an active streamed download and removes the incomplete file', async () => {
  const controller = new AbortController()
  let streamed!: () => void
  const entered = new Promise<void>(resolve => { streamed = resolve })
  let cancelled = false
  const body = new ReadableStream({ start(stream) { stream.enqueue(new TextEncoder().encode('mo')) }, cancel() { cancelled = true } })
  const pending = ensureLocalResource(catalog.model, root, controller.signal, async () => new Response(body), (_phase, bytes) => { if (bytes) streamed() })
  const failure = expect(pending).rejects.toThrow()
  await entered; controller.abort(); await failure
  expect(cancelled).toBe(true)
  expect(await readdir(root)).toEqual([])
})

it('reuses verified installation across app instances, repairs a corrupted DLL and never starts a model', async () => {
  const options = { supported: true, catalog, fetcher, extract, probe: vi.fn(async () => report) }
  const first = new KnowledgeLocalResourceInstaller(() => root, options)
  expect(first.status().phase).toBe('idle'); expect(fetcher).not.toHaveBeenCalled()
  first.start(); const ready = await finish(first)
  expect(ready.phase).toBe('ready'); expect(fetcher).toHaveBeenCalledTimes(2)
  expect(await readFile(ready.modelPath!, 'utf8')).toBe('model')
  const second = new KnowledgeLocalResourceInstaller(() => root, options)
  second.start(); expect((await finish(second)).phase).toBe('ready')
  expect(fetcher).toHaveBeenCalledTimes(2); expect(extract).toHaveBeenCalledTimes(1)
  await writeFile(join(ready.serverPath!, '..', 'ggml-vulkan.dll'), 'corrupt')
  second.start(); expect((await finish(second)).phase).toBe('ready')
  expect(fetcher).toHaveBeenCalledTimes(2); expect(extract).toHaveBeenCalledTimes(2)
})

it('refuses unsupported platforms and stops before downloading weights when GPU checks fail', async () => {
  const unsupported = new KnowledgeLocalResourceInstaller(() => root, { supported: false, fetcher })
  unsupported.start(); expect(await finish(unsupported)).toMatchObject({ phase: 'failed', reason: 'local-download-unsupported' })
  expect(fetcher).not.toHaveBeenCalled()
  const installer = new KnowledgeLocalResourceInstaller(() => root, { supported: true, catalog, fetcher, extract,
    probe: async () => ({ ...report, ok: false, reason: 'local-vram-insufficient' }) })
  installer.start(); expect(await finish(installer)).toMatchObject({ phase: 'failed', reason: 'local-vram-insufficient' })
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher.mock.calls[0]![0]).toBe(catalog.runtime.url)
})

it('cancellation wins over a late probe and retry reuses the completed runtime', async () => {
  let done!: (value: typeof report) => void
  const probe = vi.fn(() => new Promise<typeof report>(resolve => { done = resolve }))
  const installer = new KnowledgeLocalResourceInstaller(() => root, { supported: true, catalog, fetcher, extract, probe })
  installer.start()
  await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(1))
  const cancelled = installer.cancel(); done(report); await cancelled
  expect(installer.status().phase).toBe('cancelled')
  expect(fetcher).toHaveBeenCalledTimes(1)
  probe.mockResolvedValue(report)
  installer.start(); expect((await finish(installer)).phase).toBe('ready')
  expect(fetcher).toHaveBeenCalledTimes(2); expect(extract).toHaveBeenCalledTimes(1)
})
