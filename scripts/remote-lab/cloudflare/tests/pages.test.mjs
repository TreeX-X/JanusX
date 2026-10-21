import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

let mf
before(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [
    { name: 'pages', modules: true, compatibilityDate: '2026-10-21',
      scriptPath: fileURLToPath(new URL('../pages/public/_worker.js', import.meta.url)),
      serviceBindings: { SIGNAL_SERVICE: 'janusx-signal' } },
    { name: 'janusx-signal', modules: true, compatibilityDate: '2026-10-21',
      scriptPath: fileURLToPath(new URL('../.wrangler/test-bundle/worker.js', import.meta.url)),
      durableObjects: { SIGNAL: { className: 'Signaling', useSQLite: true } } },
  ] }))
  await mf.ready
})
after(async () => { await mf?.dispose() })

test('Pages service binding preserves health, endpoint rejection and WebSocket join', async () => {
  assert.equal(await (await mf.dispatchFetch('https://entry.test/health')).text(), 'JanusX signaling\n')
  assert.equal((await mf.dispatchFetch('https://entry.test/unknown')).status, 404)
  assert.equal((await mf.dispatchFetch('https://entry.test/signal')).status, 426)
  const response = await mf.dispatchFetch('https://entry.test/signal', { headers: { Upgrade: 'websocket' } })
  assert.equal(response.status, 101)
  const ws = response.webSocket
  ws.accept()
  const joined = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('join timeout through Pages')), 5000)
    ws.addEventListener('message', event => { clearTimeout(timer); resolve(JSON.parse(event.data)) }, { once: true })
  })
  ws.send(JSON.stringify({ type: 'join', role: 'host', invite: 'a'.repeat(48) }))
  assert.deepEqual(await joined, { type: 'joined' })
  ws.close(1000, 'test complete')
})
