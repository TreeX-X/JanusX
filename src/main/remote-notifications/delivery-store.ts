export class RemoteDeliveryStore {
  private readonly reservations = new Map<string, number>()
  private readonly sent = new Map<string, number>()

  reserve(eventId: string, providerId: string, ttlMs: number, now = Date.now()): boolean {
    this.prune(now)
    const key = this.key(eventId, providerId)
    if (this.reservations.has(key) || this.sent.has(key)) return false

    const expiresAt = now + Math.max(0, ttlMs)
    this.reservations.set(key, expiresAt)
    return true
  }

  markSent(eventId: string, providerId: string, ttlMs: number, now = Date.now()): void {
    const key = this.key(eventId, providerId)
    this.reservations.delete(key)
    this.sent.set(key, now + Math.max(0, ttlMs))
  }

  clearReservation(eventId: string, providerId: string): void {
    this.reservations.delete(this.key(eventId, providerId))
  }

  clear(): void {
    this.reservations.clear()
    this.sent.clear()
  }

  private key(eventId: string, providerId: string): string {
    return `${providerId}:${eventId}`
  }

  private prune(now: number): void {
    for (const [key, expiresAt] of this.reservations) {
      if (expiresAt <= now) this.reservations.delete(key)
    }
    for (const [key, expiresAt] of this.sent) {
      if (expiresAt <= now) this.sent.delete(key)
    }
  }
}
