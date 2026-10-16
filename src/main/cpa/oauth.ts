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

  constructor(private readonly session: Session, private readonly origin: string,
    private readonly report: (fallback: CpaOAuthFallback | undefined) => void,
    private readonly probe = probeCpaOAuthPort) {
    session.webRequest.onBeforeRequest({ urls: [`${origin}/v8/management/oauth/auth-url*`] }, (details, callback) => {
      void this.beforeRequest(details, callback).catch(() => callback({ cancel: true }))
    })
  }

  private async beforeRequest(details: Electron.OnBeforeRequestListenerDetails,
    callback: (response: Electron.CallbackResponse) => void): Promise<void> {
    if (this.disposed) { callback({ cancel: true }); return }
    const url = new URL(details.url)
    const provider = url.searchParams.get('provider')
    if (details.method !== 'GET' || url.origin !== this.origin || url.pathname !== '/v8/management/oauth/auth-url'
      || !provider || !Object.hasOwn(CALLBACK_PORTS, provider)
      || !['true', '1', 'yes', 'on'].includes(url.searchParams.get('is_webui')?.toLowerCase() ?? '')) {
      callback({}); return
    }
    const revision = ++this.revision
    const port = CALLBACK_PORTS[provider as keyof typeof CALLBACK_PORTS]
    const reason = await this.probe(port)
    if (this.disposed) { callback({ cancel: true }); return }
    if (revision === this.revision) this.report(reason ? { provider: provider as CpaOAuthFallback['provider'], port, reason } : undefined)
    if (reason) {
      // CPA still owns PKCE/state, cancellation, callback validation and token exchange.
      url.searchParams.set('is_webui', 'false')
      callback({ redirectURL: url.href })
    } else callback({})
  }

  dispose(): void {
    this.disposed = true
    this.session.webRequest.onBeforeRequest(null)
  }
}
