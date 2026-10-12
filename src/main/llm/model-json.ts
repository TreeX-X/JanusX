// Note: shared model transport retained during engineering exit — see .agents/notes/blueprint/implementation-baseline.md
export function modelEndpoint(value: string, local = false): URL {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('invalid-model-endpoint') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || local && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || !local && url.protocol !== 'https:') throw new Error('invalid-model-endpoint')
  return url
}

export async function modelJsonRequest(url: URL, body: unknown, signal: AbortSignal, key?: string, limit = 1024 * 1024): Promise<unknown> {
  const response = await fetch(url, { method: 'POST', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`model-http-${response.status}`)
  const reader = response.body?.getReader()
  if (!reader) throw new Error('invalid-model-response')
  let length = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > limit) throw new Error('model-response-too-large')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => undefined) }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new Error('invalid-model-json') }
}
