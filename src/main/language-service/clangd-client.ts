import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { NativeSourceLanguage } from '../../shared/ipc/language-service'

const MAX_MESSAGE_BYTES = 16 * 1024 * 1024
const INITIALIZE_TIMEOUT_MS = 10_000
const DEFINITION_TIMEOUT_MS = 8_000
const COMPILE_DATABASE_MAX_DIRECTORIES = 200

interface LspPosition {
  line: number
  character: number
}

interface LspRange {
  start: LspPosition
  end: LspPosition
}

export interface NormalizedDefinition {
  uri: string
  range: LspRange
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface OpenDocument {
  content: string
  version: number
}

export class LspMessageBuffer {
  private buffer = Buffer.alloc(0)

  push(chunk: Buffer | Uint8Array): unknown[] {
    this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)])
    const messages: unknown[] = []

    while (this.buffer.length > 0) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd < 0) break
      const header = this.buffer.subarray(0, headerEnd).toString('ascii')
      const match = /(?:^|\r\n)Content-Length:\s*(\d+)/i.exec(header)
      if (!match) throw new Error('clangd response is missing Content-Length')
      const contentLength = Number(match[1])
      if (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > MAX_MESSAGE_BYTES) {
        throw new Error('clangd response has an invalid Content-Length')
      }
      const messageEnd = headerEnd + 4 + contentLength
      if (this.buffer.length < messageEnd) break
      const body = this.buffer.subarray(headerEnd + 4, messageEnd).toString('utf8')
      this.buffer = this.buffer.subarray(messageEnd)
      messages.push(JSON.parse(body))
    }

    return messages
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPosition(value: unknown): value is LspPosition {
  return isRecord(value)
    && Number.isInteger(value.line)
    && Number.isInteger(value.character)
    && Number(value.line) >= 0
    && Number(value.character) >= 0
}

function isRange(value: unknown): value is LspRange {
  return isRecord(value) && isPosition(value.start) && isPosition(value.end)
}

export function normalizeDefinitionResult(value: unknown): NormalizedDefinition | null {
  const candidate = Array.isArray(value) ? value[0] : value
  if (!isRecord(candidate)) return null

  if (typeof candidate.uri === 'string' && isRange(candidate.range)) {
    return { uri: candidate.uri, range: candidate.range }
  }
  const range = candidate.targetSelectionRange ?? candidate.targetRange
  if (typeof candidate.targetUri === 'string' && isRange(range)) {
    return { uri: candidate.targetUri, range }
  }
  return null
}

function createProcessEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  const allowed = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'LANG', 'LC_ALL']
  for (const key of allowed) {
    if (process.env[key]) env[key] = process.env[key]
  }
  return env
}

function encodeMessage(message: unknown): Buffer {
  const body = JSON.stringify(message)
  return Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`, 'utf8')
}

async function isFile(filePath: string): Promise<boolean> {
  return stat(filePath).then((value) => value.isFile()).catch(() => false)
}

async function findUnder(directory: string, depth: number, budget: { remaining: number }): Promise<string | null> {
  if (budget.remaining-- <= 0) return null
  if (await isFile(join(directory, 'compile_commands.json'))) return directory
  if (depth === 0) return null
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    const result = await findUnder(join(directory, entry.name), depth - 1, budget)
    if (result) return result
  }
  return null
}

export async function findCompilationDatabase(workspacePath: string): Promise<string | null> {
  const rootDatabase = join(workspacePath, 'compile_commands.json')
  if (await isFile(rootDatabase)) return dirname(rootDatabase)
  const budget = { remaining: COMPILE_DATABASE_MAX_DIRECTORIES }
  for (const directory of ['build', 'out', 'cmake-build-debug', 'cmake-build-release']) {
    const result = await findUnder(join(workspacePath, directory), 2, budget)
    if (result) return result
  }
  return null
}

export class ClangdClient {
  private readonly messages = new LspMessageBuffer()
  private readonly pending = new Map<number, PendingRequest>()
  private readonly documents = new Map<string, OpenDocument>()
  private nextRequestId = 1
  private disposed = false

  private constructor(
    private readonly workspacePath: string,
    private readonly child: ChildProcessWithoutNullStreams,
  ) {
    child.stdout.on('data', (chunk: Buffer) => {
      try {
        for (const message of this.messages.push(chunk)) this.handleMessage(message)
      } catch (error) {
        this.failAll(error instanceof Error ? error : new Error('Failed to parse clangd response'))
        this.kill()
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      const message = chunk.toString('utf8').trim()
      if (message) console.debug(`[clangd] ${message}`)
    })
    child.on('error', (error) => this.failAll(error))
    child.on('exit', (code, signal) => {
      this.failAll(new Error(`clangd exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`))
    })
  }

  static async create(workspacePath: string): Promise<ClangdClient> {
    const compileCommandsDirectory = await findCompilationDatabase(workspacePath)
    const args = ['--background-index', '--header-insertion=never', '--log=error']
    if (compileCommandsDirectory) args.push(`--compile-commands-dir=${compileCommandsDirectory}`)
    const child = spawn('clangd', args, {
      cwd: workspacePath,
      env: createProcessEnvironment(),
      stdio: 'pipe',
      windowsHide: true,
    })
    const client = new ClangdClient(workspacePath, child)
    try {
      await client.initialize()
      return client
    } catch (error) {
      client.kill()
      throw error
    }
  }

  get isAlive(): boolean {
    return !this.disposed && this.child.exitCode === null && this.child.signalCode === null
  }

  async definition(input: {
    filePath: string
    language: NativeSourceLanguage
    content: string
    position: LspPosition
  }): Promise<NormalizedDefinition | null> {
    const uri = pathToFileURL(input.filePath).toString()
    const current = this.documents.get(uri)
    if (!current) {
      this.documents.set(uri, { content: input.content, version: 1 })
      this.notify('textDocument/didOpen', {
        textDocument: { uri, languageId: input.language, version: 1, text: input.content },
      })
    } else if (current.content !== input.content) {
      const version = current.version + 1
      this.documents.set(uri, { content: input.content, version })
      this.notify('textDocument/didChange', {
        textDocument: { uri, version },
        contentChanges: [{ text: input.content }],
      })
    }

    const result = await this.request('textDocument/definition', {
      textDocument: { uri },
      position: input.position,
    }, DEFINITION_TIMEOUT_MS)
    return normalizeDefinitionResult(result)
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    try {
      await this.request('shutdown', null, 1_000)
      this.notify('exit', null)
    } catch {
      // Process teardown below is the final lifecycle boundary.
    } finally {
      this.kill()
    }
  }

  private async initialize(): Promise<void> {
    const rootUri = pathToFileURL(this.workspacePath).toString()
    await this.request('initialize', {
      processId: process.pid,
      clientInfo: { name: 'JanusX', version: '0.8.0' },
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: this.workspacePath }],
      capabilities: {
        general: { positionEncodings: ['utf-16'] },
        textDocument: { definition: { dynamicRegistration: false } },
        workspace: { configuration: false, workspaceFolders: true },
      },
    }, INITIALIZE_TIMEOUT_MS)
    this.notify('initialized', {})
  }

  private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    if (!this.isAlive) return Promise.reject(new Error('clangd is not running'))
    const id = this.nextRequestId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`clangd request timed out: ${method}`))
      }, timeoutMs)
      timer.unref?.()
      this.pending.set(id, { resolve, reject, timer })
      this.child.stdin.write(encodeMessage({ jsonrpc: '2.0', id, method, params }), (error) => {
        if (!error) return
        const pending = this.pending.get(id)
        if (!pending) return
        clearTimeout(pending.timer)
        this.pending.delete(id)
        pending.reject(error)
      })
    })
  }

  private notify(method: string, params: unknown): void {
    if (!this.isAlive) return
    this.child.stdin.write(encodeMessage({ jsonrpc: '2.0', method, params }))
  }

  private handleMessage(message: unknown): void {
    if (!isRecord(message) || typeof message.id !== 'number') return
    const pending = this.pending.get(message.id)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(message.id)
    if (isRecord(message.error)) {
      pending.reject(new Error(typeof message.error.message === 'string' ? message.error.message : 'clangd request failed'))
      return
    }
    pending.resolve(message.result)
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  private kill(): void {
    if (this.disposed) return
    this.disposed = true
    this.failAll(new Error('clangd session disposed'))
    this.child.kill()
  }
}
