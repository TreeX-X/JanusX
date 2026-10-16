import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProxyManager } from '../src/utils/proxy'
import http from 'node:http'
import { connect } from 'node:net'
import { getGlobalDispatcher, setGlobalDispatcher } from 'undici'

const proxyKeys = [
  'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy',
] as const
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
const originalProxyEnv = new Map(proxyKeys.map((key) => [key, process.env[key]]))
const originalDispatcher = getGlobalDispatcher()

afterEach(async () => {
  vi.restoreAllMocks()
  const currentDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(originalDispatcher)
  if (currentDispatcher !== originalDispatcher) await currentDispatcher.destroy()
  if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform)
  for (const key of proxyKeys) {
    const value = originalProxyEnv.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('ProxyManager auto detection', () => {
  it('routes the runtime built-in fetch through the configured dispatcher', async () => {
    const destination = http.createServer((_request, response) => response.end('fetch-through-proxy'))
    await new Promise<void>((resolve) => destination.listen(0, '127.0.0.1', resolve))
    const port = (destination.address() as { port: number }).port
    const targets: string[] = []
    const proxy = http.createServer()
    proxy.on('connect', (request, socket) => {
      targets.push(request.url!)
      const upstream = connect(port, '127.0.0.1', () => {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); socket.pipe(upstream); upstream.pipe(socket)
      })
      socket.on('error', () => upstream.destroy()); upstream.on('error', () => socket.destroy())
      socket.on('close', () => upstream.destroy()); upstream.on('close', () => socket.destroy())
    })
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve))
    const manager = new ProxyManager()
    try {
      manager.configure(`http://127.0.0.1:${(proxy.address() as { port: number }).port}`)
      const response = await fetch('http://janusx-fetch-fixture.invalid/test', { signal: AbortSignal.timeout(3000) })
      expect(await response.text()).toBe('fetch-through-proxy')
      expect(targets).toEqual(['janusx-fetch-fixture.invalid:80'])
    } finally {
      manager.dispose()
      const dispatcher = getGlobalDispatcher()
      setGlobalDispatcher(originalDispatcher)
      await dispatcher.destroy()
      destination.closeAllConnections()
      await Promise.all([new Promise<void>((resolve) => destination.close(() => resolve())), new Promise<void>((resolve) => proxy.close(() => resolve()))])
    }
  })
  it('preserves explicit agents, including direct connections, while proxying ordinary requests', () => {
    const original = vi.spyOn(http, 'request').mockImplementation((() => ({})) as typeof http.request)
    const manager = new ProxyManager()
    try {
      manager.configure('http://127.0.0.1:7897')
      const direct = new http.Agent()
      http.request('http://127.0.0.1/control', { agent: direct })
      http.request({ hostname: 'localhost', agent: false })
      http.request('https://example.test/')
      expect(original.mock.calls[0][1]).toMatchObject({ agent: direct })
      expect(original.mock.calls[1][0]).toMatchObject({ agent: false })
      expect(original.mock.calls[2][1]).toMatchObject({ agent: manager.getAgent() })
      direct.destroy()
    } finally { manager.dispose() }
  })
  it('applies an empty result so a stale proxy can be cleared', () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' })
    for (const key of proxyKeys) delete process.env[key]

    const manager = new ProxyManager()
    const configure = vi.spyOn(manager, 'configure').mockImplementation(() => undefined)

    manager.autoDetect()

    expect(configure).toHaveBeenCalledWith(null)
  })
})
