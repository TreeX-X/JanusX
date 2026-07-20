import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import type { AgentEngine, AgentEvent, AgentSpawnOptions, StreamSession } from './types'
import { resolveCLIPath } from './cli-resolver'
import { createParser } from './parsers'

const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_MAX_CONCURRENCY = 3
/*-- stderr 缓冲上限：仅保留尾部 256KB，超出丢弃头部，避免异常进程刷屏无界增长 --*/
const MAX_STDERR_CHARS = 256 * 1024

type EventCallback = (event: AgentEvent) => void

export class AgentStreamManager {
  private sessions = new Map<string, StreamSession>()
  private listeners = new Map<string, Set<EventCallback>>()
  private queue: Array<() => Promise<void>> = []
  private running = 0
  private maxConcurrency: number

  constructor(opts?: { maxConcurrency?: number }) {
    this.maxConcurrency = opts?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY
  }

  async start(options: AgentSpawnOptions): Promise<string> {
    return this.startWithId(randomUUID(), options)
  }

  async startWithId(id: string, options: AgentSpawnOptions): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const run = async () => {
        try {
          await this.runTask(id, options)
          resolve(id)
        } catch (err) {
          this.running--
          this.drainQueue()
          reject(err)
        }
      }

      if (this.running >= this.maxConcurrency) {
        this.queue.push(run)
        return
      }
      this.running++
      void run()
    })
  }

  private async runTask(id: string, options: AgentSpawnOptions): Promise<void> {
    const cliPath = await resolveCLIPath(options.engine)
    if (!cliPath) {
      throw new Error(`CLI not found for engine: ${options.engine}`)
    }

    const args = this.buildArgs(options.engine, options.prompt, options.cwd, options.model)
    const abortController = new AbortController()
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

    const proc = spawn(cliPath, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: abortController.signal,
      shell: process.platform === 'win32',
    })

    const parser = createParser(options.engine)
    const timeout = setTimeout(() => {
      this.emit(id, { type: 'error', message: `Timeout: exceeded ${timeoutMs}ms` })
      abortController.abort('timeout')
      proc.kill('SIGTERM')
    }, timeoutMs)

    const session: StreamSession = {
      id, engine: options.engine, process: proc, parser,
      abortController, timeout, startedAt: new Date().toISOString(), status: 'running',
    }
    this.sessions.set(id, session)

    // Line buffering for stdout
    let buffer = ''
    proc.stdout!.on('data', (chunk: Buffer) => {
      if (abortController.signal.aborted) return
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop()!
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const json = JSON.parse(line)
          for (const event of parser.parseLine(json)) {
            this.emit(id, event)
          }
        } catch { /* skip malformed lines */ }
      }
    })

    // Capture stderr
    let stderrBuffer = ''
    proc.stderr!.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString()
      if (stderrBuffer.length > MAX_STDERR_CHARS) {
        stderrBuffer = stderrBuffer.slice(-MAX_STDERR_CHARS)
      }
    })

    // Process close
    proc.on('close', (exitCode) => {
      clearTimeout(timeout)
      // Flush remaining buffer
      if (buffer.trim()) {
        try {
          const json = JSON.parse(buffer)
          for (const event of parser.parseLine(json)) {
            this.emit(id, event)
          }
        } catch { /* skip */ }
      }

      const status = abortController.signal.aborted
        ? (exitCode === null ? 'cancelled' as const : 'error' as const)
        : (exitCode === 0 ? 'done' as const : 'error' as const)

      session.status = status
      this.emit(id, { type: 'done', exitCode: exitCode ?? undefined })

      this.running--
      this.sessions.delete(id)
      this.listeners.delete(id)
      this.drainQueue()
    })

    proc.on('error', (err) => {
      if ((err as any).code === 'ABORT_ERR') return
      this.emit(id, { type: 'error', message: err.message })
    })
  }

  private buildArgs(engine: AgentEngine, prompt: string, cwd: string, model?: string): string[] {
    switch (engine) {
      case 'claude':
        return ['-p', prompt, '--output-format', 'stream-json', '--include-partial-messages', '--verbose', '--no-session-persistence', '--permission-mode', 'acceptEdits']
      case 'codex':
        return ['exec', '--json', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox', '--', prompt]
      case 'opencode': {
        const args = ['run', '--format', 'json', '--dir', cwd, '--dangerously-skip-permissions']
        if (model) args.push('--model', model)
        args.push('--', prompt)
        return args
      }
    }
  }

  private emit(id: string, event: AgentEvent): void {
    const listeners = this.listeners.get(id)
    if (listeners) {
      for (const cb of listeners) {
        try { cb(event) } catch { /* listener error */ }
      }
    }
  }

  onEvent(id: string, callback: EventCallback): () => void {
    if (!this.listeners.has(id)) {
      this.listeners.set(id, new Set())
    }
    this.listeners.get(id)!.add(callback)
    return () => {
      this.listeners.get(id)?.delete(callback)
    }
  }

  cancel(id: string): void {
    const session = this.sessions.get(id)
    if (!session || session.status !== 'running') return
    session.abortController.abort('user-cancel')
    if (session.timeout) clearTimeout(session.timeout)
    session.process.kill('SIGTERM')
    session.status = 'cancelled'
  }

  cancelAll(): void {
    for (const [id, session] of this.sessions) {
      if (session.status === 'running') this.cancel(id)
    }
    this.queue = []
  }

  killAll(): void {
    this.cancelAll()
  }

  getSession(id: string): StreamSession | undefined {
    return this.sessions.get(id)
  }

  listSessions(): StreamSession[] {
    return Array.from(this.sessions.values())
  }

  private drainQueue(): void {
    while (this.queue.length > 0 && this.running < this.maxConcurrency) {
      const next = this.queue.shift()!
      this.running++
      next().finally(() => this.drainQueue())
    }
  }
}

export const agentStreamManager = new AgentStreamManager()
