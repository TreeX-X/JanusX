import { createServer, request } from 'node:http'
import { OFFICE_PREVIEW_CONTROLS } from './office-preview-controls'

// Keep OfficeCLI's resource, selection and streaming endpoints on the same origin.
export async function createOfficePreviewProxy(upstreamPort: number): Promise<{ port: number; stop(): Promise<void> }> {
  const server = createServer((incoming, outgoing) => {
    if (incoming.headers.origin && incoming.headers.origin !== `http://${incoming.headers.host}`) {
      outgoing.writeHead(403).end(); return
    }
    const upstream = request({ hostname: '127.0.0.1', port: upstreamPort, path: incoming.url, method: incoming.method,
      headers: { ...incoming.headers, host: `127.0.0.1:${upstreamPort}`, 'accept-encoding': 'identity' } }, response => {
      const headers = { ...response.headers }
      if (incoming.method === 'GET' && (headers['content-type'] ?? '').includes('text/html')) {
        const chunks: Buffer[] = []
        response.on('data', chunk => chunks.push(Buffer.from(chunk)))
        response.on('end', () => {
          const html = Buffer.concat(chunks).toString('utf8')
          delete headers['content-length']
          delete headers['content-encoding']
          outgoing.writeHead(response.statusCode ?? 200, headers)
          outgoing.end(html.replace(/<\/body>/i, OFFICE_PREVIEW_CONTROLS + '</body>'))
        })
      } else { outgoing.writeHead(response.statusCode ?? 200, headers); response.pipe(outgoing) }
    })
    upstream.on('error', () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end() })
    outgoing.on('close', () => upstream.destroy())
    incoming.pipe(upstream)
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  server.unref()
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Office preview proxy unavailable')
  return { port: address.port, stop: () => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() }) }
}
