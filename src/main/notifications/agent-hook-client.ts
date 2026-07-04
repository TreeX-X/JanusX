import http from 'http'
import { stdin } from 'process'
import type { AgentHookPayload, AgentHookSource } from './agent-hook-types'

const MAX_STDIN_BYTES = 1024 * 1024

function getArgValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name)
  if (index < 0) return undefined
  return argv[index + 1]
}

function getEnvValue(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim() ? value : undefined
}

function firstString(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  for (const key of keys) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }
  return undefined
}

function parseJson(raw: string): unknown {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

async function readHookStdin(): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    size += buffer.length
    if (size > MAX_STDIN_BYTES) break
    chunks.push(buffer)
  }

  return Buffer.concat(chunks).toString('utf8')
}

function normalizePayload(source: AgentHookSource, event: string, raw: unknown): AgentHookPayload {
  const toolInput =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>).tool_input
      : undefined

  const message =
    firstString(raw, ['message', 'prompt', 'notification', 'reason', 'last_assistant_message']) ??
    firstString(toolInput, ['prompt', 'description', 'task'])

  return {
    source,
    event,
    terminalId: getEnvValue('JANUSX_HOOK_TERMINAL_ID'),
    workspaceId: getEnvValue('JANUSX_HOOK_WORKSPACE_ID'),
    sessionId: firstString(raw, ['session_id', 'sessionId']),
    cwd: process.cwd(),
    message,
    timestamp: new Date().toISOString(),
    raw,
  }
}

function postHookEvent(port: string, token: string, payload: AgentHookPayload): Promise<void> {
  const body = JSON.stringify(payload)

  return new Promise((resolve) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port: Number(port),
        path: '/api/agent-hook',
        method: 'POST',
        timeout: 2_000,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (response) => {
        response.resume()
        response.on('end', resolve)
      },
    )

    request.on('error', resolve)
    request.on('timeout', () => {
      request.destroy()
      resolve()
    })
    request.end(body)
  })
}

export function isAgentHookClientInvocation(argv = process.argv): boolean {
  return argv.includes('--janusx-hook')
}

export async function runAgentHookClient(argv = process.argv): Promise<void> {
  const source = getArgValue(argv, '--source') as AgentHookSource | undefined
  const event = getArgValue(argv, '--event')
  const port = getEnvValue('JANUSX_HOOK_PORT')
  const token = getEnvValue('JANUSX_HOOK_TOKEN')

  if (!source || !event || !port || !token) return

  const raw = parseJson(await readHookStdin())
  const payload = normalizePayload(source, event, raw)
  await postHookEvent(port, token, payload)
}
