import type {
  AuthBundle,
  LoginInput,
  MemberView,
  RegisterInput,
  TeamResult,
  TenantWithRole,
} from '../../../shared/ipc/team'
import type { TeamRole } from '../../../shared/team/types'

export type { AuthBundle, MemberView, TeamResult, TenantWithRole }

const REFRESH_STORAGE_KEY = 'janusx.team.refresh'
const DEVICE_STORAGE_KEY = 'janusx.team.deviceId'

let accessToken: string | null = null

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_STORAGE_KEY)
    if (existing) return existing
    const created = crypto.randomUUID()
    localStorage.setItem(DEVICE_STORAGE_KEY, created)
    return created
  } catch {
    return `ephemeral-${Math.random().toString(36).slice(2)}`
  }
}

export function getDeviceName(): string {
  const platform = window.electron?.platform ?? 'desktop'
  return `Desktop (${platform})`
}

export function setSession(bundle: AuthBundle): void {
  accessToken = bundle.token
  try {
    localStorage.setItem(REFRESH_STORAGE_KEY, bundle.refreshToken)
  } catch {
    /* 无痕/禁用存储时仅内存会话 */
  }
}

export function clearSession(): void {
  accessToken = null
  try {
    localStorage.removeItem(REFRESH_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

async function refreshSession(): Promise<boolean> {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(REFRESH_STORAGE_KEY)
  } catch {
    stored = null
  }
  if (!stored) return false
  try {
    const result = await window.electron.team.refresh(stored)
    if (!result.ok) {
      clearSession()
      return false
    }
    setSession(result.value)
    return true
  } catch {
    clearSession()
    return false
  }
}

const RETRYABLE_CODES = new Set(['invalid-session', 'stale-session'])

/** 带静默续期的授权调用：access 失效时用 refresh 换发后重试一次。 */
export async function authed<T>(operation: (token: string) => Promise<TeamResult<T>>): Promise<TeamResult<T>> {
  if (accessToken) {
    try {
      const result = await operation(accessToken)
      if (result.ok || !RETRYABLE_CODES.has(result.error.code)) return result
    } catch {
      return { ok: false, error: { code: 'unavailable', message: '团队服务不可用' } }
    }
  }
  if (await refreshSession()) {
    try {
      if (accessToken) return await operation(accessToken)
    } catch {
      return { ok: false, error: { code: 'unavailable', message: '团队服务不可用' } }
    }
  }
  return { ok: false, error: { code: 'signed-out', message: '请先登录' } }
}

export const teamService = {
  register(input: Omit<RegisterInput, 'device'>): Promise<TeamResult<AuthBundle>> {
    return window.electron.team.register({
      ...input,
      device: { deviceId: getDeviceId(), name: getDeviceName() },
    })
  },
  login(input: Omit<LoginInput, 'device'>): Promise<TeamResult<AuthBundle>> {
    return window.electron.team.login({
      ...input,
      device: { deviceId: getDeviceId(), name: getDeviceName() },
    })
  },
  logout(): Promise<void> {
    const run = async () => {
      if (accessToken) {
        try {
          await window.electron.team.logout(accessToken)
        } catch {
          /* best effort */
        }
      }
      clearSession()
    }
    return run()
  },
  me: () => authed((token) => window.electron.team.me(token)),
  listTenants: () => authed((token) => window.electron.team.listTenants(token)),
  createTenant: (name: string) => authed((token) => window.electron.team.createTenant(token, name)),
  switchTenant: (tenantId: string) => authed((token) => window.electron.team.switchTenant(token, tenantId)),
  inviteMember: (tenantId: string, role?: TeamRole) =>
    authed((token) => window.electron.team.inviteMember(token, tenantId, role)),
  acceptInvite: (code: string) => authed((token) => window.electron.team.acceptInvite(token, code)),
  listMembers: (tenantId: string) => authed((token) => window.electron.team.listMembers(token, tenantId)),
  listProjects: (tenantId: string) => authed((token) => window.electron.team.listProjects(token, tenantId)),
  setRole: (tenantId: string, userId: string, role: TeamRole) =>
    authed((token) => window.electron.team.setRole(token, tenantId, userId, role)),
  setMemberStatus: (tenantId: string, userId: string, status: 'active' | 'disabled') =>
    authed((token) => window.electron.team.setMemberStatus(token, tenantId, userId, status)),
}
