import { createServer, type IncomingMessage, type Server } from 'http'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => join(tmpdir(), 'janusx-test-user-data')),
    getAppPath: vi.fn(() => join(tmpdir(), 'janusx-app')),
    isPackaged: true,
  },
}))

const { buildPiExtension } = await import('../../src/main/notifications/agent-hook-config')

interface CapturedPost {
  auth: unknown
  body: Record<string, unknown>
}

interface StubCtx {
  cwd?: string
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

type PiHandler = (event: unknown, ctx: StubCtx) => Promise<void>

async function loadExtension(): Promise<Record<string, PiHandler>> {
  // The extension is dependency-free plain script: evaluate in-process instead
  // of importing a temp file (vitest's module runner cannot load files
  // outside the project root). jiti loads the same source in production.
  const source = buildPiExtension().replace(
    'export default function janusxNotify',
    'function janusxNotify',
  )
  const factory = new Function(`${source}\nreturn janusxNotify;`)() as (pi: {
    on: (event: string, handler: PiHandler) => void
  }) => void
  const handlers: Record<string, PiHandler> = {}
  factory({ on: (event, handler) => { handlers[event] = handler } })
  return handlers
}

describe('pi notify extension', () => {
  let server: Server
  let posts: CapturedPost[] = []
  let port = 0
  const savedEnv = { ...process.env }

  beforeEach(async () => {
    posts = []
    server = createServer(async (request, response) => {
      const body = JSON.parse(await readBody(request)) as Record<string, unknown>
      posts.push({ auth: request.headers.authorization, body })
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ ok: true }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    port = typeof address === 'object' && address ? address.port : 0
    process.env.JANUSX_HOOK_PORT = String(port)
    process.env.JANUSX_HOOK_TOKEN = 'pi-test-token'
    process.env.JANUSX_HOOK_TERMINAL_ID = 'term-pi'
    process.env.JANUSX_HOOK_WORKSPACE_ID = 'workspace-1'
  })

  afterEach(async () => {
    process.env = { ...savedEnv }
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('posts UserPromptSubmit on agent_start and Stop on agent_settled', async () => {
    const handlers = await loadExtension()

    await handlers.agent_start({}, { cwd: 'C:/repo' })
    await handlers.agent_settled({}, { cwd: 'C:/repo' })

    expect(posts).toHaveLength(2)
    expect(posts[0].auth).toBe('Bearer pi-test-token')
    expect(posts[0].body).toMatchObject({
      source: 'pi',
      event: 'UserPromptSubmit',
      terminalId: 'term-pi',
      workspaceId: 'workspace-1',
      cwd: 'C:/repo',
    })
    expect(posts[1].body).toMatchObject({ source: 'pi', event: 'Stop' })
  })

  it('maps confirm prompts to approval and other kinds to input', async () => {
    const handlers = await loadExtension()

    await handlers.ui_prompt_start({ kind: 'confirm', title: 'Allow rm?' }, {})
    await handlers.ui_prompt_start({ kind: 'select', title: 'Pick one' }, {})

    expect(posts).toHaveLength(2)
    expect(posts[0].body).toMatchObject({ event: 'PermissionRequest', message: 'Allow rm?' })
    expect(posts[1].body).toMatchObject({ event: 'Notification', message: 'Pick one' })
    expect((posts[1].body.raw as Record<string, unknown>).matcher).toBe('idle_prompt')
  })

  it('reports rate-limit/provider errors as synthetic api-error only', async () => {
    const handlers = await loadExtension()

    await handlers.after_provider_response({ status: 429 }, {})
    await handlers.after_provider_response({ status: 200 }, {})

    expect(posts).toHaveLength(1)
    expect(posts[0].body).toMatchObject({
      source: 'pi',
      event: 'janusx.turn.api-error',
      message: 'pi provider responded 429',
    })
  })

  it('stays silent without hook env', async () => {
    const handlers = await loadExtension()
    delete process.env.JANUSX_HOOK_PORT

    await handlers.agent_start({}, {})
    await handlers.agent_settled({}, {})

    expect(posts).toHaveLength(0)
  })
})
