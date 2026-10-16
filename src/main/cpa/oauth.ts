// Note: CPA callback port fallback and external authorization — see .agents/notes/workbench/service-integrations.md
import type { Session } from 'electron'
import { createServer } from 'node:net'
import type { CpaOAuthFallback } from '../../shared/ipc/cpa'

const CALLBACK_PORTS = { codex: 1455, claude: 54545, antigravity: 51121 } as const
type PortFailure = CpaOAuthFallback['reason']

/** Match CPA's actual IPv4 listener, release the probe without accepting requests. */
export function probeCpaOAuthPort(port: number): Promise<PortFailure | undefined> {
  return new Promise((resolve) => {
    const server = createServer()
    const timer = setTimeout(() => { server.close(); resolve('unavailable') }, 1000)
    server.once('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      resolve(error.code === 'EACCES' ? 'restricted' : error.code === 'EADDRINUSE' ? 'occupied' : 'unavailable')
    })
    server.listen(port, '0.0.0.0', () => server.close(() => { clearTimeout(timer); resolve(undefined) }))
  })
}

export function isCpaOAuthAuthorizationUrl(input: string): boolean {
  try {
    const url = new URL(input)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
    return url.origin === 'https://auth.openai.com' && url.pathname === '/oauth/authorize'
      || url.origin === 'https://claude.ai' && url.pathname === '/oauth/authorize'
      || url.origin === 'https://accounts.google.com' && ['/o/oauth2/auth', '/o/oauth2/v2/auth'].includes(url.pathname)
  } catch { return false }
}

/** The trusted local CPA partition only; no credential access or page injection. */
export class CpaOAuthBridge {
  private disposed = false
  private revision = 0
  private active?: { revision: number; requestId: number; provider: string; ready: boolean; state?: string }
  private readonly seenStates = new Set<string>()
  private readonly abort = new AbortController()
  private timer?: ReturnType<typeof setTimeout>
  private checking = new Set<string>()

  constructor(private readonly session: Session, private readonly origin: string,
    private readonly report: (fallback: CpaOAuthFallback | undefined) => void,
    private readonly probe = probeCpaOAuthPort,
    private readonly status?: (state: string, signal: AbortSignal) => Promise<string | undefined>) {
    const filter = { urls: [`${origin}/v8/management/oauth/*`] }
    session.webRequest.onBeforeRequest(filter, (details, callback) => {
      void this.beforeRequest(details, callback).catch(() => callback({ cancel: true }))
    })
    session.webRequest.onCompleted(filter, (details) => {
      if (this.disposed) return
      const url = new URL(details.url)
      const flow = this.active
      if (!flow || url.origin !== origin) return
      if (url.pathname === '/v8/management/oauth/auth-url' && details.id === flow.requestId) {
        if (details.statusCode >= 200 && details.statusCode < 300) flow.ready = true
        else this.clear()
      } else if (url.pathname === '/v8/management/oauth/session' && details.method === 'DELETE'
        && details.statusCode >= 200 && details.statusCode < 300 && url.searchParams.get('state') === flow.state) this.clear()
    })
    session.webRequest.onErrorOccurred(filter, (details) => {
      if (!this.disposed && this.active?.requestId === details.id
        && new URL(details.url).pathname === '/v8/management/oauth/auth-url') this.clear()
    })
  }

  /** State from the vetted authorization link is authoritative if the user opens it. */
  observeAuthorization(input: string): void {
    if (this.disposed || !isCpaOAuthAuthorizationUrl(input)) return
    const url = new URL(input)
    const provider = url.hostname === 'auth.openai.com' ? 'codex' : url.hostname === 'claude.ai' ? 'claude' : 'antigravity'
    if (this.active?.provider === provider) this.observeState(url.searchParams.get('state'))
  }

  private observeState(state: string | null): void {
    if (!state || !/^[a-zA-Z0-9_.-]{1,128}$/.test(state)) return
    const flow = this.active
    const seen = this.seenStates.has(state)
    this.seenStates.add(state)
    if (this.seenStates.size > 128) this.seenStates.delete(this.seenStates.values().next().value!)
    if (!flow?.ready || (flow.state ? flow.state !== state : seen)) return
    flow.state = state
    if (!this.status || this.checking.has(state)) return
    this.checking.add(state)
    void this.status(state, this.abort.signal).then((result) => {
      if (!this.disposed && this.active === flow && ['ok', 'error'].includes(result ?? '')) this.clear()
    }).catch(() => { /* A temporary management failure is not an OAuth result. */ })
      .finally(() => this.checking.delete(state))
  }

  private clear(): void {
    this.active = undefined
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    this.report(undefined)
  }

  private async beforeRequest(details: Electron.OnBeforeRequestListenerDetails,
    callback: (response: Electron.CallbackResponse) => void): Promise<void> {
    if (this.disposed) { callback({ cancel: true }); return }
    const url = new URL(details.url)
    if (url.origin === this.origin && (details.method === 'GET' && url.pathname === '/v8/management/oauth/status'
      || details.method === 'DELETE' && url.pathname === '/v8/management/oauth/session')) {
      this.observeState(url.searchParams.get('state'))
      callback({}); return
    }
    const provider = url.searchParams.get('provider')
    if (details.method !== 'GET' || url.origin !== this.origin || url.pathname !== '/v8/management/oauth/auth-url'
      || !provider || !Object.hasOwn(CALLBACK_PORTS, provider)
      || !['true', '1', 'yes', 'on'].includes(url.searchParams.get('is_webui')?.toLowerCase() ?? '')) {
      callback({}); return
    }
    const revision = ++this.revision
    this.clear()
    const port = CALLBACK_PORTS[provider as keyof typeof CALLBACK_PORTS]
    const reason = await this.probe(port)
    if (this.disposed) { callback({ cancel: true }); return }
    if (revision === this.revision && reason) {
      this.active = { revision, requestId: details.id, provider, ready: false }
      this.report({ provider: provider as CpaOAuthFallback['provider'], port, reason })
      this.timer = setTimeout(() => { if (this.active?.revision === revision) this.clear() }, 5 * 60_000)
      this.timer.unref()
    }
    if (reason) {
      // CPA still owns PKCE/state, cancellation, callback validation and token exchange.
      url.searchParams.set('is_webui', 'false')
      callback({ redirectURL: url.href })
    } else callback({})
  }

  dispose(): void {
    this.disposed = true
    this.abort.abort()
    if (this.timer) clearTimeout(this.timer)
    this.session.webRequest.onBeforeRequest(null)
    this.session.webRequest.onCompleted(null)
    this.session.webRequest.onErrorOccurred(null)
  }
}
