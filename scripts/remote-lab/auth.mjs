import { randomUUID, createPublicKey, verify } from 'node:crypto'

const safeId = value => typeof value === 'string' && value.length > 4 && value.length <= 256 && /^[\w.-]+$/.test(value)
export class AuthProbe {
  constructor({ fetcher = fetch, now = Date.now } = {}) { this.fetcher = fetcher; this.now = now; this.github = new Map(); this.google = new Map(); this.jwks = null }
  async json(url, options = {}) {
    const endpoint = new URL(url), service = endpoint.hostname + endpoint.pathname
    let response
    try { response = await this.fetcher(url, { ...options, signal: AbortSignal.timeout(20000) }) }
    catch (error) {
      const code = error.cause?.code ?? error.code ?? error.name
      const timeout = ['TimeoutError', 'AbortError'].includes(error.name) || String(code).includes('TIMEOUT')
      // Never expose provider bodies, tokens, proxy addresses or raw nested errors.
      throw new Error(`本机身份 helper ${timeout ? '访问超时' : '无法访问'} ${service}；请检查电脑网络与 Node 代理配置。这是登录服务请求失败，本机信令连接可继续测试。`)
    }
    if (!response.ok) throw new Error('身份服务 ' + service + ' HTTP ' + response.status)
    return response.json()
  }
  sweep() { for (const map of [this.github, this.google]) for (const [id, state] of map) if (state.expiresAt <= this.now()) map.delete(id) }
  async githubStart({ clientId, peer }) {
    this.sweep()
    if (!safeId(clientId) || !safeId(peer)) throw new Error('先填写 GitHub Client ID，并建立测试连接')
    for (const [id, state] of this.github) if (state.peer === peer && state.expiresAt > this.now()) return { attemptId: id, userCode: state.userCode, verificationUri: state.verificationUri, expiresAt: state.expiresAt, interval: state.interval }
    if (this.github.size > 30) throw new Error('本次实验登录申请过多')
    const data = await this.json('https://github.com/login/device/code', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, scope: 'read:user' }) })
    if (data.error || !data.device_code || !data.user_code || !Number.isFinite(data.expires_in) || !Number.isFinite(data.interval)) throw new Error('GitHub 设备授权未启用，或应用编号无效')
    const uri = new URL(data.verification_uri)
    if (uri.protocol !== 'https:' || uri.hostname !== 'github.com') throw new Error('GitHub 返回了非预期授权地址')
    const id = randomUUID(), state = { peer, clientId, deviceCode: data.device_code, userCode: data.user_code, verificationUri: uri.href, expiresAt: this.now() + data.expires_in * 1000, interval: Math.max(5, data.interval), nextPoll: 0, busy: false }
    this.github.set(id, state)
    return { attemptId: id, userCode: state.userCode, verificationUri: state.verificationUri, expiresAt: state.expiresAt, interval: state.interval }
  }
  async githubStatus({ attemptId, peer }) {
    const state = this.github.get(attemptId)
    if (!state || state.peer !== peer) throw new Error('GitHub 授权申请不属于当前设备')
    if (state.expiresAt <= this.now()) { this.github.delete(attemptId); throw new Error('GitHub 授权已到期') }
    if (state.identity) return { status: 'verified', identity: state.identity }
    if (state.busy || this.now() < state.nextPoll) return { status: 'pending', interval: state.interval }
    state.busy = true; state.nextPoll = this.now() + state.interval * 1000
    try {
      const data = await this.json('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: state.clientId, device_code: state.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }) })
      if (data.error === 'authorization_pending') return { status: 'pending', interval: state.interval }
      if (data.error === 'slow_down') { state.interval += 5; state.nextPoll = this.now() + state.interval * 1000; return { status: 'pending', interval: state.interval } }
      if (data.error || !data.access_token) { this.github.delete(attemptId); throw new Error('GitHub 授权失败：' + String(data.error ?? 'missing-token')) }
      const user = await this.json('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + data.access_token, Accept: 'application/vnd.github+json', 'User-Agent': 'JanusX-Remote-Lab' } })
      if (!Number.isSafeInteger(user.id) || typeof user.login !== 'string') throw new Error('GitHub 用户身份无效')
      state.identity = { provider: 'github', subject: String(user.id), name: user.login }
      state.deviceCode = null // Access token is never returned, stored on disk or included in reports.
      return { status: 'verified', identity: state.identity }
    } finally { state.busy = false }
  }
  googleChallenge({ clientId, peer }) {
    this.sweep()
    if (!safeId(clientId) || !clientId.endsWith('.apps.googleusercontent.com') || !safeId(peer)) throw new Error('先填写 Google Web Client ID')
    if (this.google.size > 30) throw new Error('本次实验 Google 申请过多')
    const nonce = randomUUID() + randomUUID()
    this.google.set(peer, { clientId, nonce, expiresAt: this.now() + 5 * 60 * 1000 })
    return { nonce, clientId }
  }
  async googleVerify({ credential, peer }) {
    const state = this.google.get(peer)
    if (!state || state.expiresAt <= this.now()) throw new Error('Google 登录挑战已到期或不存在')
    if (typeof credential !== 'string' || credential.length > 12000) throw new Error('Google 凭据格式无效')
    const parts = credential.split('.')
    if (parts.length !== 3) throw new Error('Google JWT 格式无效')
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()), claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)) throw new Error('Google 凭据签发者或算法无效')
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
    if (!audiences.includes(state.clientId) || (claims.azp != null && claims.azp !== state.clientId) || (audiences.length > 1 && claims.azp !== state.clientId)) throw new Error('Google 凭据不属于当前应用')
    const seconds = this.now() / 1000
    if (!Number.isFinite(claims.exp) || claims.exp <= seconds || !Number.isFinite(claims.iat) || claims.iat > seconds + 30 || claims.nonce !== state.nonce || typeof claims.sub !== 'string' || !claims.sub) throw new Error('Google 凭据过期、重放或身份无效')
    if (!this.jwks || this.jwks.expiresAt <= this.now()) { const data = await this.json('https://www.googleapis.com/oauth2/v3/certs'); this.jwks = { keys: data.keys ?? [], expiresAt: this.now() + 10 * 60 * 1000 } }
    let key = this.jwks.keys.find(k => k.kid === header.kid && k.kty === 'RSA')
    if (!key) { const data = await this.json('https://www.googleapis.com/oauth2/v3/certs'); this.jwks = { keys: data.keys ?? [], expiresAt: this.now() + 10 * 60 * 1000 }; key = this.jwks.keys.find(k => k.kid === header.kid && k.kty === 'RSA') }
    if (!key || !verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) throw new Error('Google 凭据签名无效')
    this.google.delete(peer)
    return { status: 'verified', identity: { provider: 'google', subject: claims.sub, name: claims.name ?? claims.email ?? claims.sub } }
  }
  cancel(peer) { for (const [id, state] of this.github) if (state.peer === peer) this.github.delete(id); this.google.delete(peer) }
}
