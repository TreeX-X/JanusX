import {
  normalizeRemoteNotificationSettings,
  type RemoteNotificationSettings,
} from '../../shared/notifications'
import { configService } from '../config/service'
import { RemoteDeliveryStore } from './delivery-store'
import { FeishuRemoteNotificationProvider } from './providers/feishu-provider'
import type {
  RemoteNotificationDispatchOptions,
  RemoteNotificationEvent,
  RemoteNotificationProvider,
  RemoteProviderId,
  RemoteSendResult,
} from './types'

export class RemoteNotificationDispatcher {
  private readonly providers: Record<RemoteProviderId, RemoteNotificationProvider>

  constructor(
    private readonly store = new RemoteDeliveryStore(),
    providers?: Partial<Record<RemoteProviderId, RemoteNotificationProvider>>,
  ) {
    this.providers = {
      feishu: providers?.feishu ?? new FeishuRemoteNotificationProvider(),
    }
  }

  async dispatch(
    event: RemoteNotificationEvent,
    options: RemoteNotificationDispatchOptions = {},
  ): Promise<RemoteSendResult[]> {
    const settings = normalizeRemoteNotificationSettings(
      options.settings ?? (await configService.getRemoteNotificationSettings()),
    )
    if (!settings.enabled) return []
    if (!shouldNotify(event, settings)) return []

    const results: RemoteSendResult[] = []
    const providerConfig = settings.providers.feishu
    if (providerConfig.enabled) {
      const provider = this.providers.feishu
      const ttlMs = settings.dedupeWindowSeconds * 1000
      const timeoutMs = settings.timeoutSeconds * 1000

      if (!this.store.reserve(event.id, provider.id, ttlMs)) {
        results.push({
          providerId: provider.id,
          ok: true,
          skipped: true,
          reason: 'deduped',
        })
      } else {
        try {
          await provider.send(event, providerConfig, { timeoutMs })
          this.store.markSent(event.id, provider.id, ttlMs)
          results.push({ providerId: provider.id, ok: true })
        } catch (error) {
          this.store.clearReservation(event.id, provider.id)
          results.push({
            providerId: provider.id,
            ok: false,
            reason: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    return results
  }

  async testFeishu(settings?: RemoteNotificationSettings): Promise<RemoteSendResult> {
    const resolved = normalizeRemoteNotificationSettings(
      settings ?? (await configService.getRemoteNotificationSettings()),
    )
    const provider = this.providers.feishu

    try {
      await provider.test(resolved.providers.feishu, {
        timeoutMs: resolved.timeoutSeconds * 1000,
      })
      return { providerId: provider.id, ok: true }
    } catch (error) {
      return {
        providerId: provider.id,
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      }
    }
  }

  clearDedupe(): void {
    this.store.clear()
  }
}

function shouldNotify(
  event: RemoteNotificationEvent,
  settings: RemoteNotificationSettings,
): boolean {
  if (event.type === 'completed' && !settings.notifyOnCompleted) return false
  if (event.type === 'failed' && !settings.notifyOnFailed) return false
  if (event.type === 'attention' && !settings.notifyOnAttention) return false
  if (event.type === 'approval' && !settings.notifyOnApproval) return false

  if (event.type === 'completed' && settings.minDurationSeconds > 0) {
    const elapsedSeconds = getElapsedSeconds(event.startedAt, event.endedAt)
    if (elapsedSeconds !== null && elapsedSeconds < settings.minDurationSeconds) return false
  }

  return true
}

function getElapsedSeconds(startedAt?: string, endedAt?: string): number | null {
  if (!startedAt) return null
  const start = Date.parse(startedAt)
  if (!Number.isFinite(start)) return null

  const end = endedAt ? Date.parse(endedAt) : NaN
  const resolvedEnd = Number.isFinite(end) ? end : Date.now()
  return Math.max(0, Math.floor((resolvedEnd - start) / 1000))
}

export const remoteNotificationDispatcher = new RemoteNotificationDispatcher()
