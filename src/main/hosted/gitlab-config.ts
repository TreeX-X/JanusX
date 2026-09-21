// Note: self-hosted GitLab instance config with keychain PAT — see
// .agents/notes/implemented/feature/2026-09-21-gitlab-instance-config.md
import { readFile, rm, stat } from 'fs/promises'
import { join } from 'path'
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import { URL } from 'url'
import { app, safeStorage } from 'electron'
import { SerialQueue, writeFileAtomic } from '../lib/atomic-file'

export interface GitlabInstanceConfig {
  url: string
  allowInsecure: boolean
  timeoutMs: number
  /** Where the effective token comes from; never the token itself. */
  tokenSource: 'keychain' | 'env' | 'none'
}

export interface GitlabSaveInput {
  url: string
  allowInsecure?: boolean
  timeoutMs?: number
  /** Empty means keep the stored token. */
  token?: string
}

export type GitlabVerifyCode = 'network' | 'auth' | 'cert' | 'config' | 'token'

export interface GitlabVerifyResult {
  ok: boolean
  username?: string
  error?: string
  code?: GitlabVerifyCode
}

const CREDENTIAL_FILE = 'gitlab-credential'
const CONFIG_FILE = 'gitlab-instance.json'
const DEFAULT_TIMEOUT_MS = 30000

interface ElectronSafeStorage {
  isEncryptionAvailable: () => boolean
  encryptString: (plain: string) => Buffer
  decryptString: (encrypted: Buffer) => string
}

function loadKeychain(): ElectronSafeStorage | null {
  try {
    if (!safeStorage || !safeStorage.isEncryptionAvailable()) return null
    return safeStorage
  } catch {
    return null
  }
}

/**
 * Normalize an instance URL. Requires http(s), keeps subpaths (subdirectory
 * deployments), strips trailing slashes. Returns null instead of throwing.
 */
export function normalizeInstanceUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (!parsed.hostname) return null
  return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`
}

const CERT_CODES = new Set([
  'UNABLE_TO_VERIFY_LEAF_CERTIFICATE',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
])

const NETWORK_CODES = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'EAI_AGAIN',
  'ECONNRESET',
])

/** Map transport failures to user-actionable categories. */
export function classifyFetchError(err: unknown, statusCode?: number): GitlabVerifyCode {
  if (statusCode === 401 || statusCode === 403) return 'auth'
  const code = (err as { code?: string })?.code ?? ''
  if (CERT_CODES.has(code)) return 'cert'
  if (NETWORK_CODES.has(code) || code === 'ABORT_ERR' || (err as Error)?.name === 'TimeoutError') return 'network'
  return 'network'
}

export interface ApiRequestOptions {
  timeoutMs: number
  allowInsecure: boolean
  token: string
}

/** Minimal authenticated GET with explicit TLS control. */
export function apiGetJson<T>(baseUrl: string, path: string, options: ApiRequestOptions): Promise<{ status: number; body: T }> {
  const target = new URL(`${baseUrl}/api/v4${path}`)
  const requestImpl = target.protocol === 'http:' ? httpRequest : httpsRequest
  return new Promise((resolve, reject) => {
    const request = requestImpl(
      target,
      {
        method: 'GET',
        headers: { 'PRIVATE-TOKEN': options.token, Accept: 'application/json' },
        rejectUnauthorized: !options.allowInsecure,
        timeout: options.timeoutMs,
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => {
          try {
            resolve({ status: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as T })
          } catch (err) {
            reject(err)
          }
        })
        response.on('error', reject)
      },
    )
    request.on('timeout', () => request.destroy(new Error('ETIMEDOUT')))
    request.on('error', reject)
    request.end()
  })
}

interface StoredConfig {
  url: string
  allowInsecure: boolean
  timeoutMs: number
}

export class GitlabConfigStore {
  private readonly queue = new SerialQueue()

  constructor(private readonly userDataDir?: string) {}

  private baseDir(): string | null {
    if (this.userDataDir) return this.userDataDir
    try {
      return app.getPath('userData')
    } catch {
      return null
    }
  }

  private configPath(): string | null {
    const base = this.baseDir()
    return base ? join(base, 'janusx', CONFIG_FILE) : null
  }

  private credentialPath(): string | null {
    const base = this.baseDir()
    return base ? join(base, 'janusx', CREDENTIAL_FILE) : null
  }

  private async readStored(): Promise<StoredConfig | null> {
    const path = this.configPath()
    if (!path) return null
    try {
      const raw = await readFile(path, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<StoredConfig>
      if (typeof parsed.url !== 'string' || !parsed.url) return null
      return {
        url: parsed.url,
        allowInsecure: parsed.allowInsecure === true,
        timeoutMs:
          typeof parsed.timeoutMs === 'number' && Number.isFinite(parsed.timeoutMs) && parsed.timeoutMs > 0
            ? Math.min(parsed.timeoutMs, 120000)
            : DEFAULT_TIMEOUT_MS,
      }
    } catch {
      return null
    }
  }

  private async readStoredToken(): Promise<string | null> {
    if (process.env.GITLAB_TOKEN?.trim()) return process.env.GITLAB_TOKEN.trim()
    const path = this.credentialPath()
    if (!path) return null
    const keychain = loadKeychain()
    if (!keychain) return null
    try {
      const encrypted = await readFile(path)
      const plain = keychain.decryptString(encrypted)
      return plain || null
    } catch {
      return null
    }
  }

  private async tokenSource(): Promise<'keychain' | 'env' | 'none'> {
    if (process.env.GITLAB_TOKEN?.trim()) return 'env'
    const path = this.credentialPath()
    if (!path) return 'none'
    try {
      const stats = await stat(path)
      return stats.size > 0 ? 'keychain' : 'none'
    } catch {
      return 'none'
    }
  }

  async getConfig(): Promise<GitlabInstanceConfig> {
    const stored = await this.readStored()
    return {
      url: stored?.url ?? '',
      allowInsecure: stored?.allowInsecure ?? false,
      timeoutMs: stored?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      tokenSource: await this.tokenSource(),
    }
  }

  /**
   * Persist non-secret fields plus an optional token rotation. An empty
   * token keeps the stored one. Throws when a provided token cannot be
   * encrypted on this machine (use GITLAB_TOKEN instead).
   */
  async saveConfig(input: GitlabSaveInput): Promise<GitlabInstanceConfig> {
    const url = normalizeInstanceUrl(input.url)
    if (!url) throw new Error('实例地址无效，需要 http(s):// 开头的地址')
    const document: StoredConfig = {
      url,
      allowInsecure: input.allowInsecure === true,
      timeoutMs:
        typeof input.timeoutMs === 'number' && Number.isFinite(input.timeoutMs) && input.timeoutMs > 0
          ? Math.min(Math.round(input.timeoutMs), 120000)
          : DEFAULT_TIMEOUT_MS,
    }
    const path = this.configPath()
    if (!path) throw new Error('用户数据目录不可用')
    if (input.token?.trim()) {
      const keychain = loadKeychain()
      if (!keychain) {
        throw new Error('本机钥匙串不可用，PAT 请改用 GITLAB_TOKEN 环境变量')
      }
      const encrypted = keychain.encryptString(input.token.trim())
      const credentialPath = this.credentialPath()
      if (!credentialPath) throw new Error('用户数据目录不可用')
      await this.queue.run(async () => {
        await writeFileAtomic(credentialPath, encrypted)
      })
    }
    await this.queue.run(async () => {
      await writeFileAtomic(path, `${JSON.stringify(document, null, 2)}\n`)
    })
    return this.getConfig()
  }

  async clearToken(): Promise<GitlabInstanceConfig> {
    const path = this.credentialPath()
    if (path) {
      await this.queue.run(async () => {
        await rm(path, { force: true })
      })
    }
    return this.getConfig()
  }

  /**
   * Verify against the live instance. Uses form values when given so the
   * connection can be tested before saving; otherwise stored values.
   */
  async verify(input?: Partial<GitlabSaveInput>): Promise<GitlabVerifyResult> {
    const stored = await this.readStored()
    const url = input?.url !== undefined ? normalizeInstanceUrl(input.url) : (stored?.url ?? null)
    if (!url) return { ok: false, code: 'config', error: '实例地址无效，需要 http(s):// 开头的地址' }
    const token = input?.token?.trim() || process.env.GITLAB_TOKEN?.trim() || (await this.readStoredToken())
    if (!token) {
      return { ok: false, code: 'token', error: '未配置 PAT，请填写后重试（api 权限）' }
    }
    const options = {
      timeoutMs: input?.timeoutMs ?? stored?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      allowInsecure: input?.allowInsecure ?? stored?.allowInsecure ?? false,
      token,
    }
    try {
      const { status, body } = await apiGetJson<{ username?: string; name?: string }>(url, '/user', options)
      if (status === 200 && (body.username || body.name)) {
        return { ok: true, username: body.username ?? body.name }
      }
      if (status === 401 || status === 403) {
        return { ok: false, code: 'auth', error: 'PAT 无效或已过期（需要 api 权限）' }
      }
      return { ok: false, code: 'network', error: `实例返回异常状态：${status}` }
    } catch (err) {
      const code = classifyFetchError(err)
      if (code === 'cert') {
        return { ok: false, code, error: '证书校验失败：自签证书请勾选跳过校验（仅内网）' }
      }
      if (code === 'auth') {
        return { ok: false, code, error: 'PAT 无效或已过期（需要 api 权限）' }
      }
      return { ok: false, code: 'network', error: `连接失败：${err instanceof Error ? err.message : String(err)}（检查 VPN 与地址）` }
    }
  }
}

export const gitlabConfigStore = new GitlabConfigStore()
