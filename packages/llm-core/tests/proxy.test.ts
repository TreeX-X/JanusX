import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProxyManager } from '../src/utils/proxy'

const proxyKeys = [
  'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy',
] as const
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
const originalProxyEnv = new Map(proxyKeys.map((key) => [key, process.env[key]]))

afterEach(() => {
  vi.restoreAllMocks()
  if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform)
  for (const key of proxyKeys) {
    const value = originalProxyEnv.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('ProxyManager auto detection', () => {
  it('applies an empty result so a stale proxy can be cleared', () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' })
    for (const key of proxyKeys) delete process.env[key]

    const manager = new ProxyManager()
    const configure = vi.spyOn(manager, 'configure').mockImplementation(() => undefined)

    manager.autoDetect()

    expect(configure).toHaveBeenCalledWith(null)
  })
})
