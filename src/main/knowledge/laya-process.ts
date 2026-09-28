// Note: only a verified, warmed local process can score memory — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import { LAYA_MODEL_REVISION, LAYA_SDK_VERSION, type LayaSettings, type LayaStatus } from '../../shared/laya'
import type { MemoryDecisionInput } from './decision-scorer'

type Launch = (python: string, args: string[]) => ChildProcessWithoutNullStreams
const defaultLaunch: Launch = (python, args) => spawn(python, args, { shell: false, windowsHide: true, stdio: 'pipe', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
export class LayaProcess {
  private child?: ChildProcessWithoutNullStreams
  private config: LayaSettings = { enabled: false, pythonPath: '', modelPath: '' }
  private state: LayaStatus = { phase: 'disabled', reason: 'not-enabled', modelRevision: LAYA_MODEL_REVISION }
  private timer?: ReturnType<typeof setTimeout>
  private idle?: ReturnType<typeof setTimeout>
  private startup?: { promise: Promise<LayaStatus>; resolve: (status: LayaStatus) => void }
  private pending?: { id: string; resolve: (value: unknown) => void; cleanup: () => void }
  constructor(private readonly resourcePath: string, private readonly launch: Launch = defaultLaunch,
    private readonly limits = { startupMs: 120000, downloadMs: 900000, idleMs: 300000 }) {}

  configure(config: LayaSettings): void {
    if (JSON.stringify(config) === JSON.stringify(this.config)) return
    this.config = { ...config }
    this.stop('configuration-changed')
  }
  status(): LayaStatus { return { ...this.state } }
  stop(reason = 'stopped'): void {
    const child = this.child
    const graceful = this.state.phase === 'ready' && !this.pending
    this.child = undefined
    if (this.timer) clearTimeout(this.timer)
    if (this.idle) clearTimeout(this.idle)
    this.state = { ...this.state, phase: this.config.enabled ? 'stopped' : 'disabled', reason }
    this.pending?.cleanup()
    this.pending?.resolve({ status: 'unavailable', reason })
    this.pending = undefined
    this.startup?.resolve(this.status())
    this.startup = undefined
    if (child) {
      // Windows venv python.exe can own an interpreter child. Stop its computation too.
      const terminate = () => {
        if (process.platform === 'win32' && child.pid) {
          const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' })
          killer.on('error', () => child.kill())
        } else child.kill()
      }
      if (graceful) {
        child.stdin.end()
        const force = setTimeout(terminate, 1000)
        child.once('exit', () => clearTimeout(force))
        force.unref()
      } else terminate()
    }
  }
  private fail(reason: string): void {
    this.state = { ...this.state, phase: 'failed', reason }
    // Resolve after recording the failure, without changing it to a successful stop.
    const startup = this.startup
    this.startup = undefined
    this.stop(reason)
    this.state.phase = this.config.enabled ? 'failed' : 'disabled'
    startup?.resolve(this.status())
  }
  private armIdle(): void {
    if (this.idle) clearTimeout(this.idle)
    this.idle = setTimeout(() => this.stop('idle'), this.limits.idleMs)
    this.idle.unref()
  }
  start(prepare = false): Promise<LayaStatus> {
    if (!this.config.enabled) return Promise.resolve(this.status())
    if (this.startup) return this.startup.promise
    if (this.state.phase === 'ready' && !prepare) return Promise.resolve(this.status())
    this.stop('starting')
    if (!isAbsolute(this.config.pythonPath) || !isAbsolute(this.config.modelPath)) {
      this.fail('absolute-paths-required')
      return Promise.resolve(this.status())
    }
    this.state = { phase: prepare ? 'downloading' : 'starting', reason: '', modelRevision: LAYA_MODEL_REVISION }
    let resolve!: (status: LayaStatus) => void
    const promise = new Promise<LayaStatus>(done => { resolve = done })
    this.startup = { promise, resolve }
    let child: ChildProcessWithoutNullStreams
    try { child = this.launch(this.config.pythonPath, ['-u', join(this.resourcePath, 'sidecar.py'), '--model-dir', this.config.modelPath, ...(prepare ? ['--prepare'] : [])]) }
    catch { this.fail('spawn-failed'); return promise }
    this.child = child
    let buffer = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      if (this.child !== child) return
      buffer += chunk
      if (Buffer.byteLength(buffer) > 262144) { this.fail('response-limit'); return }
      while (buffer.includes('\n')) {
        const index = buffer.indexOf('\n')
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        try {
          const message = JSON.parse(line) as Record<string, unknown>
          if (this.startup) {
            if (message.protocol !== 1 || message.revision !== LAYA_MODEL_REVISION
              || message.status !== (prepare ? 'installed' : 'ready')
              || (!prepare && (message.sdk !== LAYA_SDK_VERSION || typeof message.warmupMs !== 'number' || !Number.isFinite(message.warmupMs) || message.warmupMs < 0))) {
              this.fail('verification-or-warmup-failed'); return
            }
            if (this.timer) clearTimeout(this.timer)
            this.state = { ...this.state, phase: prepare ? 'stopped' : 'ready', reason: prepare ? 'prepared' : '',
              ...(!prepare ? { warmupMs: message.warmupMs as number } : {}) }
            this.startup.resolve(this.status()); this.startup = undefined
            if (prepare) { this.stop('prepared'); return }
            this.armIdle()
          } else if (this.pending && message.id === this.pending.id && message.result && typeof message.result === 'object') {
            this.pending.cleanup(); this.pending.resolve(message.result); this.pending = undefined
            if (typeof message.elapsedMs === 'number' && Number.isFinite(message.elapsedMs) && message.elapsedMs >= 0) this.state.lastInferenceMs = message.elapsedMs
            this.armIdle()
          } else { this.fail('protocol-mismatch'); return }
        } catch { this.fail('invalid-json'); return }
      }
    })
    child.stderr.resume()
    child.stdin.on('error', () => { if (this.child === child) this.fail('write-failed') })
    child.once('error', () => { if (this.child === child) this.fail('process-error') })
    child.once('exit', () => { if (this.child === child) this.fail('process-exited') })
    this.timer = setTimeout(() => this.fail(prepare ? 'download-timeout' : 'startup-timeout'), prepare ? this.limits.downloadMs : this.limits.startupMs)
    this.timer.unref()
    return promise
  }

  async score(input: MemoryDecisionInput, signal: AbortSignal): Promise<unknown> {
    if (signal.aborted) return { status: 'unavailable', reason: 'aborted' }
    if (this.state.phase !== 'ready' || !this.child) {
      if (this.config.enabled && this.state.phase !== 'failed') void this.start()
      return { status: 'unavailable', reason: this.state.phase }
    }
    if (this.pending) return { status: 'unavailable', reason: 'busy' }
    const id = randomUUID()
    const request = JSON.stringify({ id, input }) + '\n'
    if (Buffer.byteLength(request) > 262144) return { status: 'unavailable', reason: 'request-limit' }
    if (this.idle) clearTimeout(this.idle)
    return new Promise(resolve => {
      const abort = () => this.fail('inference-aborted')
      signal.addEventListener('abort', abort, { once: true })
      this.pending = { id, resolve, cleanup: () => signal.removeEventListener('abort', abort) }
      this.child!.stdin.write(request, error => { if (error && this.pending?.id === id) this.fail('write-failed') })
    })
  }
}
