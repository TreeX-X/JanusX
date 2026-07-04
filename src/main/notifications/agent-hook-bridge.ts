import { randomBytes } from 'crypto'
import http, { type IncomingMessage, type ServerResponse } from 'http'
import type { AgentHookPayload } from './agent-hook-types'

const MAX_BODY_BYTES = 1024 * 1024

export interface AgentHookBridgeEnv {
  JANUSX_HOOK_PORT: string
  JANUSX_HOOK_TOKEN: string
}

interface AgentHookBridgeOptions {
  onPayload: (payload: AgentHookPayload) => void
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0

    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Hook payload is too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })

    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  })
  response.end(body)
}

function isHookPayload(value: unknown): value is AgentHookPayload {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.source === 'string' && typeof record.event === 'string'
}

export class AgentHookBridge {
  private server: http.Server | null = null
  private port: number | null = null
  private readonly token = randomBytes(24).toString('hex')
  private readonly onPayload: (payload: AgentHookPayload) => void

  constructor(options: AgentHookBridgeOptions) {
    this.onPayload = options.onPayload
  }

  async start(): Promise<void> {
    if (this.server && this.port !== null) return

    const server = http.createServer((request, response) => {
      void this.handleRequest(request, response)
    })

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject)
        const address = server.address()
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to bind hook bridge'))
          return
        }
        this.server = server
        this.port = address.port
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    const server = this.server
    if (!server) return

    this.server = null
    this.port = null

    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  }

  getEnv(): AgentHookBridgeEnv {
    if (this.port === null) {
      throw new Error('Hook bridge is not started')
    }

    return {
      JANUSX_HOOK_PORT: String(this.port),
      JANUSX_HOOK_TOKEN: this.token,
    }
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'POST' || request.url !== '/api/agent-hook') {
      sendJson(response, 404, { ok: false })
      return
    }

    if (request.headers.authorization !== `Bearer ${this.token}`) {
      sendJson(response, 401, { ok: false })
      return
    }

    try {
      const raw = await readRequestBody(request)
      const payload = JSON.parse(raw) as unknown
      if (!isHookPayload(payload)) {
        sendJson(response, 400, { ok: false })
        return
      }

      this.onPayload(payload)
      sendJson(response, 200, { ok: true })
    } catch {
      if (!response.headersSent) {
        sendJson(response, 400, { ok: false })
      }
    }
  }
}
