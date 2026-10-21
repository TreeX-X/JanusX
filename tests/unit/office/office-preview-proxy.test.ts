import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createOfficePreviewProxy } from '../../../src/main/office/office-preview-proxy'

describe('Office preview proxy', () => {
  let upstream: Server
  let proxy: Awaited<ReturnType<typeof createOfficePreviewProxy>>
  afterEach(async () => {
    await proxy?.stop()
    if (upstream) await new Promise<void>(resolve => { upstream.close(() => resolve()); upstream.closeAllConnections() })
  })
  it('adds controls to HTML while preserving binary resources, selection writes and SSE streaming', async () => {
    upstream = createServer((req, res) => {
      if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><body>Slides</body></html>') }
      else if (req.url === '/image') { res.end(Buffer.from([0, 128, 255])) }
      else if (req.url === '/events') { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: live\n\n') }
      else { req.pipe(res) }
    })
    await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve))
    proxy = await createOfficePreviewProxy((upstream.address() as { port: number }).port)
    const base = `http://127.0.0.1:${proxy.port}`
    expect(await (await fetch(base)).text()).toContain('janus-office-controls')
    expect([...new Uint8Array(await (await fetch(base+'/image')).arrayBuffer())]).toEqual([0,128,255])
    expect(await (await fetch(base+'/api/selection', { method: 'POST', body: 'selection', headers: { origin: base } })).text()).toBe('selection')
    expect((await fetch(base+'/api/selection', { method: 'POST', headers: { origin: 'https://example.com' } })).status).toBe(403)
    const controller = new AbortController()
    const events = await fetch(base+'/events', { signal: controller.signal })
    const reader = events.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('data: live\n\n')
    controller.abort()
  })
})
