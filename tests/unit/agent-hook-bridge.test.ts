import http from 'http'
import { describe, expect, it } from 'vitest'
import { AgentHookBridge } from '../../src/main/notifications/agent-hook-bridge'
import type { AgentHookPayload } from '../../src/main/notifications/agent-hook-types'

function post(port: string, token: string, payload: AgentHookPayload): Promise<number> {
  const body = JSON.stringify(payload)

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port: Number(port),
        path: '/api/agent-hook',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (response) => {
        response.resume()
        response.on('end', () => resolve(response.statusCode ?? 0))
      },
    )

    request.on('error', reject)
    request.end(body)
  })
}

describe('AgentHookBridge', () => {
  it('accepts authorized hook payloads on localhost', async () => {
    const payloads: AgentHookPayload[] = []
    const bridge = new AgentHookBridge({
      onPayload: (payload) => payloads.push(payload),
    })

    await bridge.start()
    const env = bridge.getEnv()

    try {
      const status = await post(env.JANUSX_HOOK_PORT, env.JANUSX_HOOK_TOKEN, {
        source: 'codex',
        event: 'Stop',
        terminalId: 'term-1',
      })

      expect(status).toBe(200)
      expect(payloads).toEqual([
        {
          source: 'codex',
          event: 'Stop',
          terminalId: 'term-1',
        },
      ])
    } finally {
      await bridge.stop()
    }
  })
})
