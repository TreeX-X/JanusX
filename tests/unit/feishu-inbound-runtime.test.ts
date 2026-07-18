import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemoteNotificationSettings } from '../../src/shared/notifications'
import { FEISHU_CONTROL_DEFAULTS } from '../../src/shared/notifications'
import type { FeishuInboundChannel } from '../../src/main/remote-notifications/feishu-inbound/types'

const { getUserDataPath } = vi.hoisted(() => ({ getUserDataPath: vi.fn(() => '.') }))
vi.mock('electron', () => ({ app: { getPath: getUserDataPath } }))
vi.mock('../../src/main/ipc/terminal-handlers', () => ({ submitCompanionTerminalLine: vi.fn() }))

import { FeishuInboundRuntime } from '../../src/main/remote-notifications/feishu-inbound/runtime'

function settings(appId = 'app-1', enabled = true): RemoteNotificationSettings {
  return {
    enabled,
    notifyOnCompleted: true, notifyOnFailed: true, notifyOnAttention: true, notifyOnApproval: true,
    minDurationSeconds: 0, dedupeWindowSeconds: 60, timeoutSeconds: 10,
    providers: { feishu: {
      enabled: true, mode: 'app', inboundControlEnabled: true, allowedOpenIds: ['ou-1'],
      ...FEISHU_CONTROL_DEFAULTS,
      webhookUrl: '', appId, appSecret: 'secret', receiveIdType: 'chat_id', receiveId: 'oc-1',
    } },
  }
}

describe('FeishuInboundRuntime', () => {
  let channels: FeishuInboundChannel[]
  let factory: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getUserDataPath.mockReset()
    getUserDataPath.mockReturnValue('.')
    channels = []
    factory = vi.fn(() => {
      const channel: FeishuInboundChannel = {
        onMessage: () => vi.fn(), onCardAction: () => vi.fn(), onError: () => vi.fn(),
        onReconnecting: () => vi.fn(), onReconnected: () => vi.fn(),
        connect: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn().mockResolvedValue(undefined),
        receipts: { send: vi.fn().mockResolvedValue(undefined) },
      }
      channels.push(channel)
      return channel
    })
  })

  it('starts once, reconfigures changed credentials, and stops idempotently', async () => {
    const runtime = new FeishuInboundRuntime(factory)
    runtime.configure({} as never)
    await runtime.reconfigure(settings())
    await runtime.reconfigure(settings())
    expect(factory).toHaveBeenCalledOnce()
    expect(channels[0].connect).toHaveBeenCalledOnce()
    expect(runtime.getStatus()).toEqual({ state: 'connected' })

    await runtime.reconfigure(settings('app-2'))
    expect(factory).toHaveBeenCalledTimes(2)
    expect(channels[0].disconnect).toHaveBeenCalledOnce()
    expect(channels[1].connect).toHaveBeenCalledOnce()

    await Promise.all([runtime.stop(), runtime.stop()])
    expect(channels[1].disconnect).toHaveBeenCalledOnce()
    expect(runtime.getStatus()).toEqual({ state: 'disabled' })
  })

  it('does not start for webhook or disabled control', async () => {
    const runtime = new FeishuInboundRuntime(factory)
    runtime.configure({} as never)
    const disabled = settings()
    disabled.providers.feishu.mode = 'webhook'
    await runtime.reconfigure(disabled)
    expect(factory).not.toHaveBeenCalled()
    expect(runtime.getStatus()).toEqual({ state: 'disabled' })
    expect(runtime.getControlStatus()).toMatchObject({ enabled: false, configured: true })
  })

  it('reports startup failure without rejecting application reconfiguration', async () => {
    factory.mockImplementationOnce(() => {
      const channel: FeishuInboundChannel = {
        onMessage: () => vi.fn(), onCardAction: () => vi.fn(), onError: () => vi.fn(),
        onReconnecting: () => vi.fn(), onReconnected: () => vi.fn(),
        connect: vi.fn().mockRejectedValue(new Error('network unavailable')),
        disconnect: vi.fn().mockResolvedValue(undefined),
        receipts: { send: vi.fn().mockResolvedValue(undefined) },
      }
      return channel
    })
    const runtime = new FeishuInboundRuntime(factory)
    runtime.configure({} as never)
    await expect(runtime.reconfigure(settings())).resolves.toBeUndefined()
    expect(runtime.getStatus()).toEqual({ state: 'failed', error: 'network unavailable' })
  })

  it('contains gateway construction failure and retries the same configuration', async () => {
    getUserDataPath.mockImplementationOnce(() => { throw new Error('secret gateway failed') })
    const runtime = new FeishuInboundRuntime(factory)
    runtime.configure({} as never)

    await expect(runtime.reconfigure(settings())).resolves.toBeUndefined()
    expect(factory).not.toHaveBeenCalled()
    expect(runtime.getStatus()).toEqual({ state: 'failed', error: '[redacted] gateway failed' })
    expect(runtime.getControlStatus()).toMatchObject({ state: 'error', error: '[redacted] gateway failed' })

    await expect(runtime.reconfigure(settings())).resolves.toBeUndefined()
    expect(factory).toHaveBeenCalledOnce()
    expect(runtime.getStatus()).toEqual({ state: 'connected' })
  })

  it('contains factory and partial listener-construction failures', async () => {
    const factoryFailure = new FeishuInboundRuntime(vi.fn(() => { throw new Error('factory failed') }))
    factoryFailure.configure({} as never)
    await expect(factoryFailure.reconfigure(settings())).resolves.toBeUndefined()
    expect(factoryFailure.getStatus()).toEqual({ state: 'failed', error: 'factory failed' })

    const disposeMessage = vi.fn()
    const disconnect = vi.fn().mockResolvedValue(undefined)
    const partialChannel: FeishuInboundChannel = {
      onMessage: () => disposeMessage,
      onCardAction: () => { throw new Error('listener failed') },
      onError: () => vi.fn(), onReconnecting: () => vi.fn(), onReconnected: () => vi.fn(),
      connect: vi.fn(), disconnect,
      receipts: { send: vi.fn().mockResolvedValue(undefined) },
    }
    const listenerFailure = new FeishuInboundRuntime(() => partialChannel)
    listenerFailure.configure({} as never)
    await expect(listenerFailure.reconfigure(settings())).resolves.toBeUndefined()
    expect(disposeMessage).toHaveBeenCalledOnce()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(listenerFailure.getStatus()).toEqual({ state: 'failed', error: 'listener failed' })
  })

  it('exposes bounded credential-free control status', async () => {
    const rawSecret = `  ${'runtime-credential-fragment-'.repeat(16)}\nsecret-tail  `
    const normalizedSecret = rawSecret.trim().replace(/\s+/g, ' ')
    const rawAppId = '  app\nidentifier  '
    const normalizedAppId = rawAppId.trim().replace(/\s+/g, ' ')
    let asyncError: (error: unknown) => void = () => undefined
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    factory
      .mockImplementationOnce(() => ({
      onMessage: () => vi.fn(), onCardAction: () => vi.fn(), onError: () => vi.fn(),
      onReconnecting: () => vi.fn(), onReconnected: () => vi.fn(),
      connect: vi.fn().mockRejectedValue(new Error(`${normalizedAppId} ${normalizedSecret} failed`)),
      disconnect: vi.fn().mockResolvedValue(undefined),
      receipts: { send: vi.fn().mockResolvedValue(undefined) },
    }))
      .mockImplementationOnce(() => ({
        onMessage: () => vi.fn(), onCardAction: () => vi.fn(),
        onError: (handler) => { asyncError = handler; return vi.fn() },
        onReconnecting: () => vi.fn(), onReconnected: () => vi.fn(),
        connect: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn().mockResolvedValue(undefined),
        receipts: { send: vi.fn().mockResolvedValue(undefined) },
      }))
    const runtime = new FeishuInboundRuntime(factory)
    runtime.configure({} as never)
    const configured = settings(rawAppId)
    configured.providers.feishu.appSecret = rawSecret
    await runtime.reconfigure(configured)
    expect(runtime.getControlStatus()).toMatchObject({
      state: 'error', enabled: true, configured: true,
      error: '[redacted] [redacted] failed', updatedAt: expect.any(Number),
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain('runtime-credential-fragment')
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-tail')
    expect(JSON.stringify(log.mock.calls)).not.toContain('identifier')

    await runtime.reconfigure(configured)
    asyncError(new Error(`async ${normalizedSecret} ${normalizedAppId}`))
    const serialized = JSON.stringify(runtime.getControlStatus())
    expect(serialized).not.toContain('runtime-credential-fragment')
    expect(serialized).not.toContain('secret-tail')
    expect(serialized).not.toContain('identifier')
    expect(runtime.getControlStatus().error).toBe('async [redacted] [redacted]')
    log.mockRestore()
  })
})
