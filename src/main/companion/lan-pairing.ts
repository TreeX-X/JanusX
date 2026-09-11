import { randomBytes } from 'crypto'

/**
 * @file LAN pairing codes (M3 remote-control prerequisite)
 * @description Short single-use codes that bootstrap trust between the host
 *              and a LAN client. The host shows a code, the client redeems it
 *              once; on success the host learns the client's team device UUID
 *              and serves it through the gateway policy allowlist
 *              (operatorOpenId === deviceId, see contracts).
 *              Transport (HTTP/WS server, mDNS) is intentionally out of scope:
 *              this module only defines the trust handshake, in memory.
 */

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_BYTES = 5

export interface LanPairing {
  code: string
  hostDeviceId: string
  hostDeviceName: string
  createdAt: number
  expiresAt: number
  redeemedByDeviceId: string | null
}

export type LanRedeemResult =
  | { ok: true; pairing: LanPairing }
  | { ok: false; reason: 'unknown-code' | 'expired-code' | 'redeemed-code' }

export class LanPairingCodes {
  private readonly codes = new Map<string, LanPairing>()

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs: number = 10 * 60 * 1000,
  ) {}

  issue(hostDeviceId: string, hostDeviceName: string): { code: string; expiresAt: number } {
    let code = ''
    do {
      code = this.newCode()
    } while (this.codes.has(code))
    const createdAt = this.now()
    this.codes.set(code, {
      code,
      hostDeviceId,
      hostDeviceName,
      createdAt,
      expiresAt: createdAt + this.ttlMs,
      redeemedByDeviceId: null,
    })
    return { code, expiresAt: createdAt + this.ttlMs }
  }

  redeem(rawCode: string, clientDeviceId: string): LanRedeemResult {
    const code = rawCode.trim().toUpperCase()
    const pairing = this.codes.get(code)
    if (!pairing) return { ok: false, reason: 'unknown-code' }
    if (pairing.redeemedByDeviceId) return { ok: false, reason: 'redeemed-code' }
    if (pairing.expiresAt <= this.now()) {
      this.codes.delete(code)
      return { ok: false, reason: 'expired-code' }
    }
    pairing.redeemedByDeviceId = clientDeviceId
    return { ok: true, pairing }
  }

  /** Active (unredeemed, unexpired) code count, for diagnostics. */
  pending(): number {
    let count = 0
    for (const pairing of this.codes.values()) {
      if (!pairing.redeemedByDeviceId && pairing.expiresAt > this.now()) count += 1
    }
    return count
  }

  private newCode(): string {
    const bytes = randomBytes(CODE_BYTES)
    let code = ''
    for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length]
    return code
  }
}
