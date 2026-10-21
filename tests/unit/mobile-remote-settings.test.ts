import { describe, expect, it } from 'vitest'
import { mobileRemoteSettings } from '../../src/renderer/src/lib/mobile-remote-settings'
import defaults from '../../src/shared/remote-defaults.json'

describe('mobile remote settings migration', () => {
  const read = (values: Record<string, string>) => (key: string) => values[key] ?? null
  it('supplies public signaling on fresh profiles and when storage is unavailable', () => {
    const expected = { network: 'public', ...defaults }
    expect(mobileRemoteSettings(read({}))).toEqual(expected)
    expect(mobileRemoteSettings(() => { throw Error('storage unavailable') })).toEqual(expected)
  })
  it('fills an old empty public endpoint while preserving STUN customization', () => {
    expect(mobileRemoteSettings(read({ 'remote.network': 'public', 'remote.signalUrl': ' ', 'remote.stunUrl': 'stun:custom.example:3478' })))
      .toEqual({ network: 'public', signalUrl: defaults.signalUrl, stunUrl: 'stun:custom.example:3478' })
  })
  it('migrates the previous bundled endpoint but preserves custom paths and LAN selection', () => {
    expect(mobileRemoteSettings(read({ 'remote.signalUrl': 'wss://janusx-signal.740288105.workers.dev/signal', 'remote.network': 'lan' })))
      .toEqual({ network: 'lan', ...defaults })
    expect(mobileRemoteSettings(read({ 'remote.signalUrl': 'wss://janusx-signal.740288105.workers.dev/custom' })).signalUrl)
      .toBe('wss://janusx-signal.740288105.workers.dev/custom')
  })
  it('preserves explicit LAN, custom signaling, and disabled STUN', () => {
    expect(mobileRemoteSettings(read({ 'remote.network': 'lan', 'remote.signalUrl': 'wss://my.example/signal', 'remote.stunUrl': '' })))
      .toEqual({ network: 'lan', signalUrl: 'wss://my.example/signal', stunUrl: '' })
  })
  it('replaces temporary Quick Tunnel addresses without rewriting custom services', () => {
    expect(mobileRemoteSettings(read({ 'remote.network': 'public', 'remote.signalUrl': 'wss://old-test.trycloudflare.com/signal' })).signalUrl)
      .toBe(defaults.signalUrl)
    expect(mobileRemoteSettings(read({ 'remote.signalUrl': 'not-a-url' })).signalUrl).toBe('not-a-url')
  })
})
