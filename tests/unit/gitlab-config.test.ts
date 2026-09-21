import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GitlabConfigStore,
  classifyFetchError,
  normalizeInstanceUrl,
} from '../../src/main/hosted/gitlab-config'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/janusx-test-userdata' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plain: string) => Buffer.from(`enc:${plain}`),
    decryptString: (encrypted: Buffer) => encrypted.toString().replace(/^enc:/, ''),
  },
}))

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function userDataDir() {
  const path = await mkdtemp(join(tmpdir(), 'gitlab-config-'))
  roots.push(path)
  return path
}

describe('normalizeInstanceUrl', () => {
  it.each([
    ['https://git.company.com', 'https://git.company.com'],
    ['https://git.company.com/', 'https://git.company.com'],
    ['git.company.com', 'https://git.company.com'],
    ['http://10.0.0.5/gitlab', 'http://10.0.0.5/gitlab'],
    ['https://git.company.com/gitlab/', 'https://git.company.com/gitlab'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeInstanceUrl(input)).toBe(expected)
  })

  it.each([[''], ['not a url'], ['ftp://host/x'], ['https://']])('rejects %s', (input) => {
    expect(normalizeInstanceUrl(input)).toBeNull()
  })
})

describe('classifyFetchError', () => {
  it('separates cert, auth, and network failures', () => {
    expect(classifyFetchError({ code: 'SELF_SIGNED_CERT_IN_CHAIN' })).toBe('cert')
    expect(classifyFetchError({ code: 'CERT_HAS_EXPIRED' })).toBe('cert')
    expect(classifyFetchError(new Error('x'), 401)).toBe('auth')
    expect(classifyFetchError({ code: 'ENOTFOUND' })).toBe('network')
    expect(classifyFetchError({ code: 'ETIMEDOUT' })).toBe('network')
    expect(classifyFetchError(new Error('boom'))).toBe('network')
  })
})

describe('GitlabConfigStore', () => {
  let servers: Server[] = []
  beforeEach(() => {
    servers = []
    delete process.env.GITLAB_TOKEN
  })
  afterEach(async () => {
    for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()))
    delete process.env.GITLAB_TOKEN
  })

  function serve(handler: (url: string, headers: Record<string, string | string[] | undefined>) => { status: number; body: unknown }) {
    const server = createServer((req, res) => {
      const result = handler(req.url ?? '/', req.headers)
      res.writeHead(result.status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(result.body))
    })
    servers.push(server)
    return new Promise<string>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        resolve(`http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`)
      })
    })
  }

  it('round-trips config with a keychain token and env override', async () => {
    const store = new GitlabConfigStore(await userDataDir())
    const saved = await store.saveConfig({ url: 'https://git.company.com/', token: 'glpat-test' })
    expect(saved).toMatchObject({ url: 'https://git.company.com', tokenSource: 'keychain' })
    process.env.GITLAB_TOKEN = 'glpat-env'
    expect((await store.getConfig()).tokenSource).toBe('env')
    delete process.env.GITLAB_TOKEN
    await store.clearToken()
    expect((await store.getConfig()).tokenSource).toBe('none')
  })

  it('rejects invalid URLs without persisting', async () => {
    const store = new GitlabConfigStore(await userDataDir())
    await expect(store.saveConfig({ url: 'not a url' })).rejects.toThrow('实例地址无效')
    expect((await store.getConfig()).url).toBe('')
  })

  it('verifies live instances and classifies failures', async () => {
    const store = new GitlabConfigStore(await userDataDir())
    const authed = await serve((url, headers) => {
      if (url !== '/api/v4/user') return { status: 404, body: {} }
      return headers['private-token'] === 'good'
        ? { status: 200, body: { username: 'zhangsan' } }
        : { status: 401, body: { message: 'unauthorized' } }
    })
    const ok = await store.verify({ url: authed, token: 'good' })
    expect(ok).toMatchObject({ ok: true, username: 'zhangsan' })
    const denied = await store.verify({ url: authed, token: 'bad' })
    expect(denied).toMatchObject({ ok: false, code: 'auth' })
    const missing = await store.verify({ url: authed })
    expect(missing).toMatchObject({ ok: false, code: 'token' })
    const badUrl = await store.verify({ url: 'not a url', token: 'x' })
    expect(badUrl).toMatchObject({ ok: false, code: 'config' })
  })

  it('reports unreachable hosts as network failures', async () => {
    const store = new GitlabConfigStore(await userDataDir())
    // Documentation-reserved address with a closed port: fast refusal.
    const result = await store.verify({ url: 'http://127.0.0.1:1', token: 'x', timeoutMs: 3000 })
    expect(result).toMatchObject({ ok: false, code: 'network' })
  })
})
