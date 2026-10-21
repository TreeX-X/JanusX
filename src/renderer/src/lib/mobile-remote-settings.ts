import defaults from '../../../shared/remote-defaults.json'
import { REMOTE_LAN_ONLY, REMOTE_SETTINGS_PREFIX } from '../../../shared/remote-scope'

/** Fill missing defaults without replacing explicit LAN choices or custom services. */
export function mobileRemoteSettings(read: (key: string) => string | null) {
  const saved = (key: string) => {
    try { return read(`${REMOTE_SETTINGS_PREFIX}${key}`) } catch { return null }
  }
  if (REMOTE_LAN_ONLY) return { network: 'lan', signalUrl: '', stunUrl: '' }
  let signalUrl = saved('signalUrl')?.trim() || defaults.signalUrl
  // Move the previous bundled public endpoint to the verified Pages entry.
  if (signalUrl === 'wss://janusx-signal.740288105.workers.dev/signal') signalUrl = defaults.signalUrl
  try {
    // Quick Tunnel URLs are temporary diagnostics, not a durable saved service.
    if (new URL(signalUrl).hostname.endsWith('.trycloudflare.com')) signalUrl = defaults.signalUrl
  } catch { /* Keep malformed custom input visible so the user can correct it. */ }
  return {
    network: saved('network') === 'lan' ? 'lan' : 'public',
    signalUrl,
    // An explicitly empty STUN setting is useful for LAN-only operation.
    stunUrl: saved('stunUrl') ?? defaults.stunUrl,
  }
}
