import { describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:net'
import type { Session } from 'electron'
import { CpaOAuthBridge, isCpaOAuthAuthorizationUrl, probeCpaOAuthPort } from '../../src/main/cpa/oauth'

function fixture(reason: 'restricted' | 'occupied' | 'unavailable' | undefined = 'restricted') {
  const onBeforeRequest = vi.fn()
  const report = vi.fn()
  const probe = vi.fn(async () => reason)
  const bridge = new CpaOAuthBridge({ webRequest: { onBeforeRequest } } as unknown as Session,
    'http://127.0.0.1:8317', report, probe)
  const handler = onBeforeRequest.mock.calls[0][1] as (details: unknown, callback: (response: unknown) => void) => void
  const request = (url: string, method = 'GET') => new Promise<any>((resolve) => handler({ url, method }, resolve))
  return { bridge, request, report, probe, onBeforeRequest }
}

describe('CPA OAuth callback fallback', () => {
  it.each([['codex', 1455], ['claude', 54545], ['antigravity', 51121]])('uses the existing manual callback flow for %s when restricted', async (provider, port) => {
    const { request, probe, report } = fixture()
    const result = await request(`http://127.0.0.1:8317/v8/management/oauth/auth-url?provider=${provider}&is_webui=true`)
    expect(probe).toHaveBeenCalledWith(port)
    expect(new URL(result.redirectURL).searchParams.get('is_webui')).toBe('false')
    expect(new URL(result.redirectURL).searchParams.get('provider')).toBe(provider)
    expect(report).toHaveBeenCalledWith({ provider, port, reason: 'restricted' })
  })

  it('keeps available ports on the original automatic callback flow', async () => {
    const f = fixture()
    f.probe.mockResolvedValue(undefined)
    expect(await f.request('http://127.0.0.1:8317/v8/management/oauth/auth-url?provider=codex&is_webui=true')).toEqual({})
    expect(f.report).toHaveBeenCalledWith(undefined)
  })

  it.each(['occupied', 'unavailable'] as const)('reports %s without taking over an existing listener', async (reason) => {
    const { request, report } = fixture(reason)
    await request('http://127.0.0.1:8317/v8/management/oauth/auth-url?provider=codex&is_webui=1')
    expect(report).toHaveBeenCalledWith({ provider: 'codex', port: 1455, reason })
  })

  it.each([
    'http://127.0.0.1:8317/v8/management/oauth/auth-url?provider=xai&is_webui=true',
    'http://127.0.0.1:8317/v8/management/oauth/auth-url?provider=codex&is_webui=false',
    'http://127.0.0.1:8317/v8/management/oauth/callback?provider=codex&is_webui=true',
    'http://127.0.0.1:9000/v8/management/oauth/auth-url?provider=codex&is_webui=true',
  ])('leaves unrelated requests untouched', async (url) => {
    const { request, probe } = fixture()
    expect(await request(url)).toEqual({})
    expect(probe).not.toHaveBeenCalled()
  })

  it('cancels an in-flight probe when its page is disposed and removes the session listener', async () => {
    const f = fixture()
    let finish!: (value: 'restricted') => void
    f.probe.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const result = f.request('http://127.0.0.1:8317/v8/management/oauth/auth-url?provider=codex&is_webui=true')
    f.bridge.dispose(); finish('restricted')
    expect(await result).toEqual({ cancel: true })
    expect(f.report).not.toHaveBeenCalled()
    expect(f.onBeforeRequest).toHaveBeenLastCalledWith(null)
  })

  it('probes an occupied real listener without terminating or replacing it', async () => {
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve))
    const port = (server.address() as { port: number }).port
    try {
      expect(await probeCpaOAuthPort(port)).toBe('occupied')
      expect(server.listening).toBe(true)
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())) }
    expect(await probeCpaOAuthPort(port)).toBeUndefined()
  })
})

describe('CPA OAuth system browser routing', () => {
  it.each([
    'https://auth.openai.com/oauth/authorize?state=fixture',
    'https://claude.ai/oauth/authorize',
    'https://accounts.google.com/o/oauth2/v2/auth',
    'https://accounts.google.com/o/oauth2/auth',
  ])('allows verified authorization endpoints %s', (url) => { expect(isCpaOAuthAuthorizationUrl(url)).toBe(true) })
  it.each([
    'https://evil.example/oauth/authorize', 'https://auth.openai.com.evil.example/oauth/authorize',
    'https://auth.openai.com/help', 'https://user:pass@auth.openai.com/oauth/authorize',
    'http://auth.openai.com/oauth/authorize', 'file:///secret', 'javascript:alert(1)',
  ])('keeps other URLs out of automatic external routing', (url) => { expect(isCpaOAuthAuthorizationUrl(url)).toBe(false) })
})
