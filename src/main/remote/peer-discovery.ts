/**
 * @file 控制端 mDNS 发现（ToB 双机 LAN 远控）
 * @description 浏览局域网 `_janusx-remote._tcp`，只收协议版本一致、
 *              带设备指纹的条目；mDNS 不可用时调用方降级为手动输 IP。
 */

import { Bonjour } from 'bonjour-service'
import { PEER_PROTOCOL_VERSION, PEER_SERVICE_TYPE } from './peer-server'

export interface DiscoveredPeer {
  deviceId: string
  name: string
  /** 首选 IPv4（被控局域网地址）。 */
  host: string
  port: number
  fingerprint: string
  lastSeenAt: number
}

/** 最小浏览面（测试可注入假实现，真机走 bonjour-service）。 */
export interface PeerBrowser {
  find(
    query: { type: string },
    onUp: (service: {
      name: string
      port: number
      txt: Record<string, string>
      addresses?: string[]
    }) => void,
  ): { stop: () => void }
  destroy: () => void
}

function pickIPv4(addresses?: string[]): string | null {
  for (const address of addresses ?? []) {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(address) && !address.startsWith('127.')) return address
  }
  for (const address of addresses ?? []) {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(address)) return address
  }
  return null
}

export async function discoverPeers(
  timeoutMs = 3000,
  deps: { createBrowser?: () => PeerBrowser; now?: () => number } = {},
): Promise<DiscoveredPeer[]> {
  const now = deps.now ?? Date.now
  const browser = deps.createBrowser?.() ?? (new Bonjour() as unknown as PeerBrowser)
  const found = new Map<string, DiscoveredPeer>()
  try {
    const handle = browser.find({ type: PEER_SERVICE_TYPE }, (service) => {
      if (service.txt?.v !== String(PEER_PROTOCOL_VERSION)) return
      const deviceId = (service.txt.device ?? '').trim()
      const fingerprint = (service.txt.fp ?? '').trim()
      const host = pickIPv4(service.addresses)
      if (!deviceId || !fingerprint || !host || !service.port) return
      found.set(deviceId, {
        deviceId,
        name: service.name,
        host,
        port: service.port,
        fingerprint,
        lastSeenAt: now(),
      })
    })
    await new Promise((resolve) => setTimeout(resolve, timeoutMs))
    handle.stop()
  } finally {
    browser.destroy()
  }
  return [...found.values()]
}
