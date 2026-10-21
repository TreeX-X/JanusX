import { describe, expect, it } from 'vitest'
import type { NetworkInterfaceInfo } from 'node:os'
import { lanAddresses, validateSignalUrl } from '../../src/main/remote/network'

describe('mobile signaling network', () => {
  it('excludes unusable IPv4 addresses and ranks physical interfaces before virtual networks', () => {
    const ipv4 = (address: string, internal = false) => ({ address, family: 'IPv4', internal }) as NetworkInterfaceInfo
    expect(lanAddresses({
      'ZeroTier One': [ipv4('10.44.166.1')], Ethernet: [ipv4('192.168.31.5')],
      WLAN: [ipv4('169.254.37.210')], Loopback: [ipv4('127.0.0.1', true)], IPv6: [{ family: 'IPv6' } as NetworkInterfaceInfo],
    })).toEqual([{ name: 'Ethernet', address: '192.168.31.5' }, { name: 'ZeroTier One', address: '10.44.166.1' }])
  })
  it('allows public TLS signaling and local test signaling, rejects insecure public endpoints and URL credentials', () => {
    for (const url of ['wss://signal.example.com/signal', 'ws://127.0.0.1/signal', 'ws://10.0.2.2:43821/signal', 'ws://192.168.31.5/signal'])
      expect(validateSignalUrl(url)).toBe(url)
    for (const url of ['ws://signal.example.com/signal', 'https://example.com', 'wss://user:secret@example.com/signal', 'wss://example.com/signal#ignored', 'not-a-url'])
      expect(() => validateSignalUrl(url)).toThrow()
  })
})
