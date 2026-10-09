// Note: verified first-use resources stay outside release packages — see .agents/notes/knowledge/requirements/knowledge-accumulate-review-wiki-rereview.md
import { app, net } from 'electron'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, statfs, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream } from 'node:stream/web'
import type { KnowledgeLocalEnvironment, KnowledgeLocalResources } from '../../shared/knowledge-automation'
import { detectManagedGpu } from './knowledge-local-environment'

type Asset = { name: string; url: string; bytes: number; sha256: string }
export const LOCAL_RESOURCE_CATALOG = {
  runtime: { name: 'llama-b11277-bin-win-vulkan-x64.zip', bytes: 33095916,
    url: 'https://github.com/ggml-org/llama.cpp/releases/download/b11277/llama-b11277-bin-win-vulkan-x64.zip',
    sha256: 'de762f675bdf6583d3118f5c016ea8fc009263821c072d26f6ed58f4b03e2fc2' },
  model: { name: 'Qwen3.5-4B-Q5_K_M.gguf', bytes: 3143656608,
    url: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/Qwen3.5-4B-Q5_K_M.gguf',
    sha256: '8814232b85594dcd46c50e5b8b29324a7efe9e746edbe8a3d1df3d3fce7aad39' },
}
type FetchResource = (url: string, options: { signal: AbortSignal }) => Promise<Response>

async function hashFile(path: string, signal: AbortSignal): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path, { signal })) hash.update(chunk)
  signal.throwIfAborted()
  return hash.digest('hex')
}

/** Bounded streaming transfer; only a complete, verified file can replace the cached asset. */
export async function ensureLocalResource(asset: Asset, root: string, signal: AbortSignal, fetcher: FetchResource,
  progress: (phase: 'verifying' | 'downloading', received: number) => void): Promise<string> {
  const path = join(root, asset.name)
  signal.throwIfAborted()
  progress('verifying', 0)
  const existing = await stat(path).catch(error => { if (error.code === 'ENOENT') return undefined; throw error })
  if (existing?.isFile() && existing.size === asset.bytes && await hashFile(path, signal) === asset.sha256) return path
  const disk = await statfs(root)
  if (disk.bavail * disk.bsize < asset.bytes + 512 * 1024 ** 2) throw new Error('local-disk-insufficient')
  const temporary = join(root, `.${asset.name}.${randomUUID()}.part`)
  const stalled = new AbortController()
  const active = AbortSignal.any([signal, stalled.signal, AbortSignal.timeout(4 * 60 * 60 * 1000)])
  let timer: ReturnType<typeof setTimeout>
  const touch = () => { clearTimeout(timer); timer = setTimeout(() => stalled.abort(), 60000); timer.unref?.() }
  let received = 0
  const hash = createHash('sha256')
  try {
    progress('downloading', 0); touch()
    const response = await fetcher(asset.url, { signal: active })
    if (!response.ok || !response.body || response.url && !response.url.startsWith('https://')) {
      await response.body?.cancel(); throw new Error('local-download-failed')
    }
    const length = response.headers.get('content-length')
    if (length !== null && Number(length) !== asset.bytes) {
      await response.body.cancel(); throw new Error('local-download-size-mismatch')
    }
    await pipeline(Readable.fromWeb(response.body as ReadableStream<Uint8Array>), new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length; touch()
        if (received > asset.bytes) { callback(new Error('local-download-size-mismatch')); return }
        hash.update(chunk); progress('downloading', received); callback(null, chunk)
      },
    }), createWriteStream(temporary, { flags: 'wx' }), { signal: active })
    progress('verifying', received)
    if (received !== asset.bytes) throw new Error('local-download-size-mismatch')
    if (hash.digest('hex') !== asset.sha256) throw new Error('local-download-hash-mismatch')
    active.throwIfAborted()
    await rename(temporary, path)
    return path
  } finally { clearTimeout(timer!); await rm(temporary, { force: true }) }
}

/** The pinned archive is hashed first. Reject unsafe paths and oversized contents before extraction. */
export async function extractLocalRuntime(archive: string, target: string, signal: AbortSignal): Promise<void> {
  const script = `
    $ErrorActionPreference = 'Stop'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($env:JANUSX_LOCAL_ARCHIVE)
    try {
      if ($zip.Entries.Count -gt 512) { throw 'Too many entries' }
      $size = 0L
      foreach ($entry in $zip.Entries) {
        if ($entry.FullName -match '(^[/\\\\]|:|(^|[/\\\\])\\.\\.([/\\\\]|$))') { throw 'Unsafe path' }
        $size += $entry.Length
        if ($size -gt 268435456) { throw 'Archive too large' }
      }
    } finally { $zip.Dispose() }
    [IO.Compression.ZipFile]::ExtractToDirectory($env:JANUSX_LOCAL_ARCHIVE, $env:JANUSX_LOCAL_TARGET)
  `
  await new Promise<void>((done, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, signal, timeout: 120000, env: { ...process.env, JANUSX_LOCAL_ARCHIVE: archive, JANUSX_LOCAL_TARGET: target } },
      error => error ? reject(new Error('local-runtime-extract-failed')) : done())
  })
}

type RuntimeFile = { name: string; sha256: string }
async function runtimeFiles(root: string, signal: AbortSignal, directory = root): Promise<RuntimeFile[]> {
  const files: RuntimeFile[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    signal.throwIfAborted()
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error('local-runtime-extract-failed')
    if (entry.isDirectory()) files.push(...await runtimeFiles(root, signal, path))
    else if (entry.isFile() && entry.name !== 'janusx-install.json') files.push({ name: relative(root, path), sha256: await hashFile(path, signal) })
  }
  return files.sort((a, b) => a.name.localeCompare(b.name))
}

export class KnowledgeLocalResourceInstaller {
  private state: KnowledgeLocalResources
  private controller?: AbortController
  private pending?: Promise<void>
  constructor(private readonly root: () => string, private readonly options: {
    supported?: boolean; fetcher?: FetchResource; catalog?: typeof LOCAL_RESOURCE_CATALOG
    extract?: typeof extractLocalRuntime; probe?: (path: string, signal: AbortSignal) => Promise<KnowledgeLocalEnvironment>
  } = {}) {
    this.state = { supported: options.supported ?? (process.platform === 'win32' && process.arch === 'x64'), phase: 'idle', receivedBytes: 0, totalBytes: 0 }
  }
  status(): KnowledgeLocalResources { return { ...this.state } }
  start(): KnowledgeLocalResources {
    if (this.pending) return this.status()
    this.state = { supported: this.state.supported, phase: 'checking', receivedBytes: 0, totalBytes: 0 }
    this.controller = new AbortController()
    const signal = this.controller.signal
    this.pending = this.install(signal).catch(error => {
      this.state.phase = signal.aborted ? 'cancelled' : 'failed'
      this.state.reason = error instanceof Error && /^local-/.test(error.message) ? error.message
        : (error as NodeJS.ErrnoException)?.code === 'ENOSPC' ? 'local-disk-insufficient' : 'local-download-failed'
    }).finally(() => { this.pending = undefined; this.controller = undefined })
    return this.status()
  }
  async cancel(): Promise<void> { this.controller?.abort(); await this.pending }

  private async install(signal: AbortSignal): Promise<void> {
    if (!this.state.supported) throw new Error('local-download-unsupported')
    const root = resolve(this.root()), catalog = this.options.catalog ?? LOCAL_RESOURCE_CATALOG
    await mkdir(root, { recursive: true })
    const fetcher = this.options.fetcher ?? ((url, options) => net.fetch(url, options))
    const asset = async (component: 'runtime' | 'model') => {
      this.state.component = component; this.state.totalBytes = catalog[component].bytes
      return ensureLocalResource(catalog[component], root, signal, fetcher, (phase, receivedBytes) => {
        this.state.phase = phase; this.state.receivedBytes = receivedBytes
      })
    }
    const runtime = join(root, `runtime-${catalog.runtime.sha256.slice(0, 16)}`)
    let files: RuntimeFile[] = []
    this.state.component = 'runtime'; this.state.phase = 'verifying'
    try {
      const manifest = JSON.parse(await readFile(join(runtime, 'janusx-install.json'), 'utf8'))
      if (manifest.archive === catalog.runtime.sha256) {
        const actual = await runtimeFiles(runtime, signal)
        if (JSON.stringify(actual) === JSON.stringify(manifest.files)) files = actual
      }
    } catch { signal.throwIfAborted() }
    if (!files.some(file => /(^|[/\\])llama-server\.exe$/.test(file.name))) {
      const archive = await asset('runtime')
      this.state.phase = 'extracting'
      const stage = await mkdtemp(join(root, '.runtime-'))
      try {
        await (this.options.extract ?? extractLocalRuntime)(archive, stage, signal)
        files = await runtimeFiles(stage, signal)
        if (!files.some(file => /(^|[/\\])llama-server\.exe$/.test(file.name))) throw new Error('local-runtime-extract-failed')
        await writeFile(join(stage, 'janusx-install.json'), JSON.stringify({ archive: catalog.runtime.sha256, files }))
        signal.throwIfAborted()
        // Only replace the installer-owned version directory, never a user-supplied path.
        const child = relative(root, runtime)
        if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('local-runtime-extract-failed')
        await rm(runtime, { recursive: true, force: true })
        await rename(stage, runtime)
      } finally { await rm(stage, { recursive: true, force: true }) }
    }
    const serverPath = join(runtime, files.find(file => /(^|[/\\])llama-server\.exe$/.test(file.name))!.name)
    this.state.phase = 'checking'
    const report = await (this.options.probe ?? ((path, active) => detectManagedGpu(path,
      { bytes: catalog.model.bytes, context: 262144, kvBytesPerToken: 32768 }, active)))(serverPath, signal)
    this.state.report = report
    if (!report.ok) throw new Error(report.reason ?? 'local-gpu-unavailable')
    const modelPath = await asset('model')
    signal.throwIfAborted()
    this.state = { ...this.state, phase: 'ready', serverPath, modelPath }
  }
}

// userData survives application upgrades; dev and installed profiles keep independent ownership.
export const knowledgeLocalResources = new KnowledgeLocalResourceInstaller(() => join(app.getPath('userData'), 'knowledge', 'local-models'))
