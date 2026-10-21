import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os'

// Note: .agents/notes/remote/android-pairing-handshake.md
export function lanAddresses(interfaces: Record<string, NetworkInterfaceInfo[] | undefined> = networkInterfaces()) {
  return Object.entries(interfaces).flatMap(([name, addresses]) => (addresses ?? [])
    .filter(a => a.family === 'IPv4' && !a.internal && !/^(169\.254\.|127\.|0\.)/.test(a.address))
    .map(a => ({ name, address: a.address })))
    .sort((a, b) => Number(/zerotier|tailscale|vpn|virtual|vethernet|docker|vmware|wsl/i.test(a.name))
      - Number(/zerotier|tailscale|vpn|virtual|vethernet|docker|vmware|wsl/i.test(b.name)) || a.name.localeCompare(b.name))
}

export function validateSignalUrl(value: string): string {
  const url = new URL(value)
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname)
  if ((url.protocol !== 'wss:' && !(url.protocol === 'ws:' && local)) || url.username || url.password
    || url.hash || value.length > 2048) throw Error('公网信令请使用 wss://；ws:// 仅用于本机或局域网')
  return value
}
