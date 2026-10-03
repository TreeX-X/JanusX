// Note: local deployment is opt-in and bounded by measured resources — see .agents/notes/2026-10-03-knowledge-accumulate-review-wiki-rereview--3944b368.md
import { execFile } from 'node:child_process'
import { open, stat } from 'node:fs/promises'
import { createServer } from 'node:net'
import { freemem } from 'node:os'
import { isAbsolute } from 'node:path'
import { LOCAL_CONTEXT_OPTIONS, type KnowledgeLocalEnvironment, type KnowledgeLocalSettings } from '../../shared/knowledge-automation'

const MiB = 1024 ** 2
export function localEndpoint(value: string): URL {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('invalid-model-endpoint') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('invalid-model-endpoint')
  return url
}

function command(file: string, args: string[], signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: 15000, maxBuffer: MiB, signal }, (error, stdout, stderr) => {
      if (error) reject(new Error('local-runtime-unavailable'))
      else resolve(stdout + '\n' + stderr)
    })
  })
}

/** Bounded GGUF metadata reader; skips tokenizer arrays without allocating their strings. */
export async function readLocalModelMetadata(path: string): Promise<{ bytes: number; context: number; kvBytesPerToken: number }> {
  const file = await open(path, 'r')
  try {
    const size = (await file.stat()).size
    const data = Buffer.alloc(Math.min(size, 32 * MiB))
    await file.read(data, 0, data.length, 0)
    let offset = 0
    const take = (length: number) => {
      if (!Number.isSafeInteger(length) || length < 0 || offset + length > data.length) throw new Error('invalid-local-model-metadata')
      const start = offset; offset += length; return start
    }
    const u32 = () => data.readUInt32LE(take(4))
    const u64 = () => { const value = Number(data.readBigUInt64LE(take(8))); if (!Number.isSafeInteger(value)) throw new Error('invalid-local-model-metadata'); return value }
    const string = () => { const length = u64(); const start = take(length); return data.toString('utf8', start, start + length) }
    const value = (type: number, keep: boolean, depth = 0): number | string | undefined => {
      if (depth > 2) throw new Error('invalid-local-model-metadata')
      if (type === 8) { if (keep) return string(); take(u64()); return }
      if (type === 9) {
        const element = u32(), count = u64()
        if (count > data.length) throw new Error('invalid-local-model-metadata')
        for (let index = 0; index < count; index++) value(element, false, depth + 1)
        return
      }
      const width = [1, 1, 2, 2, 4, 4, 4, 1, 0, 0, 8, 8, 8][type]
      if (!width) throw new Error('invalid-local-model-metadata')
      const start = take(width)
      if (!keep) return
      if (type === 4) return data.readUInt32LE(start)
      if (type === 10) return Number(data.readBigUInt64LE(start))
      return undefined
    }
    if (data.toString('ascii', take(4), offset) !== 'GGUF' || ![2, 3].includes(u32())) throw new Error('invalid-local-model-metadata')
    u64()
    const count = u64(), metadata = new Map<string, number | string>()
    if (count > 100000) throw new Error('invalid-local-model-metadata')
    for (let index = 0; index < count; index++) {
      const key = string(), item = value(u32(), key === 'general.architecture' || key.startsWith('qwen35.'))
      if (item !== undefined) metadata.set(key, item)
    }
    if (metadata.get('general.architecture') !== 'qwen35') throw new Error('local-model-unsupported')
    const positive = (key: string) => {
      const item = Number(metadata.get(`qwen35.${key}`))
      if (!Number.isSafeInteger(item) || item <= 0) throw new Error('invalid-local-model-metadata')
      return item
    }
    const layers = Math.ceil(positive('block_count') / positive('full_attention_interval'))
    const kvBytesPerToken = layers * positive('attention.head_count_kv') * (positive('attention.key_length') + positive('attention.value_length')) * 2
    return { bytes: size, context: positive('context_length'), kvBytesPerToken }
  } finally { await file.close() }
}

export function recommendLocalContext(input: { memoryMiB: number; vramMiB?: number; modelBytes: number; kvBytesPerToken: number; modelContext: number }): number[] {
  // Include SSM/compute/runtime overhead and leave headroom for the app and other processes.
  const modelMiB = input.modelBytes / MiB
  return LOCAL_CONTEXT_OPTIONS.filter(tokens => tokens <= input.modelContext && (input.vramMiB === undefined
    ? modelMiB * 1.1 + tokens * input.kvBytesPerToken / MiB + 3584 <= input.memoryMiB
    : modelMiB + tokens * input.kvBytesPerToken / MiB + 1280 <= input.vramMiB && input.memoryMiB >= modelMiB + 2048))
}

async function assertPortFree(url: URL): Promise<void> {
  if (url.protocol !== 'http:') throw new Error('invalid-model-endpoint')
  await new Promise<void>((resolve, reject) => {
    const server = createServer()
    server.once('error', () => reject(new Error('local-port-unavailable')))
    server.listen(Number(url.port || 80), url.hostname.replace(/[[\]]/g, ''), () => server.close(error => error ? reject(error) : resolve()))
  })
}

export async function detectLocalEnvironment(config: KnowledgeLocalSettings, signal: AbortSignal): Promise<KnowledgeLocalEnvironment> {
  const report: KnowledgeLocalEnvironment = { ok: false, mode: 'cpu', availableMemoryMiB: Math.floor(freemem() / MiB),
    modelContextTokens: 0, recommendedContextTokens: 0, selectedContextTokens: 0, supportedContextTokens: [] }
  try {
    signal.throwIfAborted()
    const url = localEndpoint(config.endpoint)
    if (!Number.isSafeInteger(config.contextTokens) || config.contextTokens < 0
      || config.contextTokens !== 0 && !LOCAL_CONTEXT_OPTIONS.some(tokens => tokens === config.contextTokens)) throw new Error('local-context-unsupported')
    if (!config.serverPath && !config.modelPath) {
      report.mode = 'service'
      const options = { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]), redirect: 'error' as const }
      // A refused connection is a missing service, not a failed hardware assessment.
      try {
        const health = await fetch(new URL('/health', url), options)
        await health.body?.cancel()
        if (!health.ok) throw new Error('unhealthy')
      } catch { throw new Error('local-service-unavailable') }
      try {
        const response = await fetch(new URL('/props', url), options)
        if (!response.ok) { await response.body?.cancel(); throw new Error('missing-props') }
        const props = await response.json() as { default_generation_settings?: { n_ctx?: number } }
        const context = props.default_generation_settings?.n_ctx
        if (!Number.isSafeInteger(context) || Number(context) < 32768) throw new Error('invalid-context')
        report.modelContextTokens = Number(context)
        report.supportedContextTokens = LOCAL_CONTEXT_OPTIONS.filter(tokens => tokens <= Number(context))
      } catch { throw new Error('local-service-context-unknown') }
    } else {
      if (!isAbsolute(config.serverPath) || !isAbsolute(config.modelPath)) throw new Error('invalid-local-model-path')
      try { if (!(await stat(config.serverPath)).isFile() || !(await stat(config.modelPath)).isFile()) throw new Error() }
      catch { throw new Error('invalid-local-model-path') }
      const model = await readLocalModelMetadata(config.modelPath)
      report.modelContextTokens = model.context
      await assertPortFree(url)
      const devices = await command(config.serverPath, ['--list-devices'], signal)
      let nvidia: string = ''
      if (/NVIDIA/i.test(devices)) nvidia = await command('nvidia-smi', ['--query-gpu=name,memory.free', '--format=csv,noheader,nounits'], signal).catch(() => '')
      const candidates = [...devices.matchAll(/^\s*(\S+):\s*(.+?)\s*\([\d.]+ MiB, ([\d.]+) MiB free\)/gm)]
        .map(match => {
          let free = Number(match[3])
          if (/NVIDIA/i.test(match[2]!)) {
            const readings = nvidia.split(/\r?\n/).filter(line => line.startsWith(match[2]! + ',')).map(line => Number(line.split(',').at(-1))).filter(Number.isFinite)
            // If no reliable free VRAM measurement is available, use the CPU budget.
            free = readings.length ? Math.min(free, ...readings) : 0
          }
          return { device: match[1]!, name: match[2]!, free }
        }).sort((a, b) => b.free - a.free)
      const budget = { memoryMiB: report.availableMemoryMiB, modelBytes: model.bytes, kvBytesPerToken: model.kvBytesPerToken, modelContext: model.context }
      const gpu = candidates.find(candidate => recommendLocalContext({ ...budget, vramMiB: candidate.free }).length > 0)
      if (gpu) {
        report.mode = 'gpu'; report.device = gpu.device; report.deviceName = gpu.name; report.availableVramMiB = Math.floor(gpu.free)
      }
      report.supportedContextTokens = recommendLocalContext({ ...budget, vramMiB: report.availableVramMiB })
    }
    const automatic = report.supportedContextTokens.filter(tokens => tokens <= 131072)
    report.recommendedContextTokens = automatic.at(-1) ?? 0
    report.selectedContextTokens = config.contextTokens || report.recommendedContextTokens
    if (!report.supportedContextTokens.length) throw new Error('local-memory-insufficient')
    if (!report.supportedContextTokens.includes(report.selectedContextTokens)) throw new Error('local-context-unsupported')
    signal.throwIfAborted()
    report.ok = true
  } catch (error) {
    signal.throwIfAborted()
    report.reason = error instanceof Error && /^(invalid-local|invalid-model|local-)/.test(error.message) ? error.message : 'local-environment-failed'
  }
  return report
}
