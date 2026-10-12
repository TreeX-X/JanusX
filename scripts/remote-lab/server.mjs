import { createServer } from 'node:http'
import { AuthProbe } from './auth.mjs'

// Loopback-only identity helper. GitHub Device Flow and Google credential verification run on the host so the
// controller never holds an OAuth token. This survived the transport replacement unchanged; what was removed was
// the WebRTC control page and the Nostr-emulating relay that used to hang off the same server.
export async function createLabServer({ port = 41873, auth = new AuthProbe() } = {}) {
  const server = createServer(async (req, res) => {
    const port = server.address().port
    const origin = 'http://' + req.headers.host
    const respond = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)) }
    try {
      if (!['127.0.0.1:' + port, 'localhost:' + port].includes(req.headers.host)) return respond(403, { error: 'Unexpected Host' })
      if (!req.url?.startsWith('/api/')) return respond(404, { error: 'Not found' })
      if (req.method !== 'POST' || req.headers.origin !== origin || req.headers['x-remote-lab'] !== '1' || !req.headers['content-type']?.startsWith('application/json')) return respond(403, { error: 'Only same-origin loopback JSON requests are allowed' })
      let body = ''; for await (const chunk of req) { body += chunk.toString(); if (body.length > 20000) return respond(413, { error: 'Request too large' }) }
      const input = JSON.parse(body)
      let value
      switch (req.url) {
        case '/api/github/start': value = await auth.githubStart(input); break
        case '/api/github/status': value = await auth.githubStatus(input); break
        case '/api/google/challenge': value = auth.googleChallenge(input); break
        case '/api/google/verify': value = await auth.googleVerify(input); break
        case '/api/auth/cancel': auth.cancel(input.peer); value = { cancelled: true }; break
        default: return respond(404, { error: 'Unknown auth method' })
      }
      respond(200, value)
    } catch (error) { respond(400, { error: String(error.message).slice(0,240) }) }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  return server
}
