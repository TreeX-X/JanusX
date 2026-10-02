import { mkdtemp, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentHookBridge } from '../../src/main/notifications/agent-hook-bridge'
import { matchesEngineEvents } from '../../src/main/notifications/agent-engine-capabilities'
import type { AgentHookPayload } from '../../src/main/notifications/agent-hook-types'

vi.mock('electron', () => ({ app: { isPackaged: true, getPath: () => tmpdir() } }))
const { AgentHookConfigManager } = await import('../../src/main/notifications/agent-hook-config')

describe('OpenCode plugin delivery', () => {
  const payloads: AgentHookPayload[] = []
  let bridge: AgentHookBridge
  let plugin: { event: (input: { event: unknown }) => Promise<void> }

  beforeEach(async () => {
    payloads.length = 0
    bridge = new AgentHookBridge({ onPayload: payload => payloads.push(payload) })
    await bridge.start()
    const homeDir = await mkdtemp(join(tmpdir(), 'janusx-opencode-hook-'))
    const manager = new AgentHookConfigManager({ homeDir, userDataDir: homeDir })
    await manager.ensureInstalled('opencode')
    for (const [key, value] of Object.entries(manager.buildTerminalEnv({
      engine: 'opencode', terminalId: 'opencode-term', workspaceId: 'workspace',
    }, bridge.getEnv()))) vi.stubEnv(key, value)
    const source = await readFile(join(manager.getOpencodeConfigDir(), 'plugins', 'janusx-notify.js'), 'utf8')
    const factory = new Function(source.replace('export const JanusXNotifyPlugin', 'const JanusXNotifyPlugin') + '\nreturn JanusXNotifyPlugin;')()
    plugin = await factory({ directory: 'C:/repo' })
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await bridge.stop()
  })

  it('preserves SDK status objects and session IDs across busy, approval, idle and error events', async () => {
    for (const event of [
      { type: 'session.status', properties: { sessionID: 'ses_1', status: { type: 'busy' } } },
      { type: 'permission.asked', properties: { sessionID: 'ses_1' } },
      { type: 'session.idle', properties: { sessionID: 'ses_1' } },
      { type: 'session.error', properties: { sessionID: 'ses_1', error: 'provider failed' } },
    ]) await plugin.event({ event })
    expect(payloads).toHaveLength(4)
    for (const payload of payloads) expect(payload).toMatchObject({
      source: 'opencode', terminalId: 'opencode-term', workspaceId: 'workspace', sessionId: 'ses_1', cwd: 'C:/repo',
    })
    for (const [index, phase] of (['start', 'approval', 'complete', 'fail'] as const).entries()) {
      const payload = payloads[index]
      expect(matchesEngineEvents('opencode', phase, payload.event, payload.raw)).toBe(true)
    }
  })

  it('ignores unrelated events and runs independently when bridge env is absent', async () => {
    await plugin.event({ event: { type: 'message.updated' } })
    vi.stubEnv('JANUSX_HOOK_PORT', '')
    await plugin.event({ event: { type: 'session.idle' } })
    expect(payloads).toHaveLength(0)
  })

  it('binds created session info and recognizes question events as input rather than approval', async () => {
    await plugin.event({ event: { type: 'session.created', properties: { info: { id: 'ses_created' } } } })
    expect(payloads[0].sessionId).toBe('ses_created')
    for (const event of ['question.asked', 'question.v2.asked']) {
      await plugin.event({ event: { type: event, properties: { sessionID: 'ses_created' } } })
      const payload = payloads.at(-1)!
      expect(payload.event).toBe(event)
      expect(matchesEngineEvents('opencode', 'attention', event)).toBe(true)
      expect(matchesEngineEvents('opencode', 'approval', event)).toBe(false)
    }
  })

  it('returns when the bridge accepts the connection but never responds', async () => {
    const stalled = createServer(() => {})
    await new Promise<void>(resolve => stalled.listen(0, '127.0.0.1', resolve))
    const address = stalled.address()
    vi.stubEnv('JANUSX_HOOK_PORT', String(typeof address === 'object' && address ? address.port : 0))
    try {
      const started = Date.now()
      await plugin.event({ event: { type: 'session.idle' } })
      expect(Date.now() - started).toBeLessThan(5000)
    } finally {
      stalled.closeAllConnections()
      await new Promise<void>(resolve => stalled.close(() => resolve()))
    }
  }, 6000)
})
