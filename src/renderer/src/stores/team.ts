import { create } from 'zustand'
import type { MemberView, PublicUser, TenantWithRole } from '../../../shared/ipc/team'
import type { MembershipStatus, TeamRole } from '../../../shared/team/types'
import { clearSession, setSession, teamService } from '@/services/team'

export type TeamStatus = 'unknown' | 'guest' | 'local' | 'authed'

interface TeamStore {
  status: TeamStatus
  user: PublicUser | null
  tenants: TenantWithRole[]
  activeTenantId: string | null
  members: MemberView[]
  busy: boolean
  error: string | null
  /** 本地模式下强制唤起挡板（侧栏登录入口用）。 */
  gateForced: boolean
  /** 侧栏请求打开设置 team 页的计数器（Titlebar 订阅后打开弹窗）。 */
  settingsRequest: number
  bootstrap: () => Promise<void>
  login: (email: string, password: string) => Promise<boolean>
  register: (input: { email: string; password: string; name?: string; inviteCode?: string }) => Promise<boolean>
  logout: () => Promise<void>
  /** 不登录直接用软件（本地模式）：团队功能届时再引导登录。 */
  skipLogin: () => void
  requestLogin: () => void
  closeGate: () => void
  switchTenant: (tenantId: string) => Promise<void>
  createTenant: (name: string) => Promise<void>
  inviteMember: (role?: TeamRole) => Promise<{ code: string; expiresAt: string } | null>
  acceptInvite: (code: string) => Promise<boolean>
  refreshMembers: () => Promise<void>
  setRole: (userId: string, role: TeamRole) => Promise<boolean>
  setMemberStatus: (userId: string, status: MembershipStatus) => Promise<boolean>
  openTeamSettings: () => void
  clearError: () => void
}

function applyBundle(
  set: (partial: Partial<TeamStore>) => void,
  bundle: { user: PublicUser; tenants: TenantWithRole[]; session: { activeTenantId: string } },
): string | null {
  const activeTenantId = bundle.session.activeTenantId || bundle.tenants[0]?.id || null
  set({ status: 'authed', user: bundle.user, tenants: bundle.tenants, activeTenantId, error: null, gateForced: false })
  return activeTenantId
}

export const useTeamStore = create<TeamStore>((set, get) => ({
  status: 'unknown',
  user: null,
  tenants: [],
  activeTenantId: null,
  members: [],
  busy: false,
  error: null,
  gateForced: false,
  settingsRequest: 0,

  bootstrap: async () => {
    set({ busy: true })
    try {
      const result = await teamService.me()
      if (!result.ok) {
        set({ status: 'guest', user: null, tenants: [], activeTenantId: null, members: [], busy: false })
        return
      }
      // 有账号无组织也是 authed：挡板引导建组织，主界面不受阻。
      const activeTenantId = applyBundle(set, result.value)
      set({ busy: false })
      if (activeTenantId) await get().refreshMembers()
    } catch {
      set({ status: 'guest', busy: false, error: '团队服务不可用' })
    }
  },

  login: async (email, password) => {
    set({ busy: true, error: null })
    try {
      const result = await teamService.login({ email, password })
      if (!result.ok) {
        set({ busy: false, error: result.error.message })
        return false
      }
      setSession(result.value)
      const activeTenantId = applyBundle(set, result.value)
      set({ busy: false })
      if (activeTenantId) await get().refreshMembers()
      return true
    } catch {
      set({ busy: false, error: '团队服务不可用' })
      return false
    }
  },

  register: async (input) => {
    set({ busy: true, error: null })
    try {
      const result = await teamService.register(input)
      if (!result.ok) {
        set({ busy: false, error: result.error.message })
        return false
      }
      setSession(result.value)
      const activeTenantId = applyBundle(set, result.value)
      set({ busy: false })
      if (activeTenantId) await get().refreshMembers()
      return true
    } catch {
      set({ busy: false, error: '团队服务不可用' })
      return false
    }
  },

  logout: async () => {
    await teamService.logout()
    clearSession()
    set({ status: 'guest', user: null, tenants: [], activeTenantId: null, members: [], error: null, gateForced: false })
  },

  skipLogin: () => set({ status: 'local', error: null, gateForced: false }),
  requestLogin: () => set({ gateForced: true }),
  closeGate: () => set({ gateForced: false }),

  switchTenant: async (tenantId) => {
    set({ busy: true, error: null })
    try {
      const result = await teamService.switchTenant(tenantId)
      if (!result.ok) {
        // 会话过期或被禁用：退回 guest，挡板接管。
        if (result.error.code === 'signed-out' || result.error.code === 'forbidden') {
          clearSession()
          set({ status: 'guest', busy: false })
        } else {
          set({ busy: false, error: result.error.message })
        }
        return
      }
      setSession(result.value)
      const activeTenantId = applyBundle(set, result.value)
      set({ busy: false })
      if (activeTenantId) await get().refreshMembers()
    } catch {
      set({ busy: false, error: '团队服务不可用' })
    }
  },

  createTenant: async (name) => {
    const trimmed = name.trim()
    if (!trimmed) {
      set({ error: '组织名称不能为空' })
      return
    }
    set({ busy: true, error: null })
    try {
      // 服务端建组织即换发该组织的会话，直接落本地。
      const created = await teamService.createTenant(trimmed)
      if (!created.ok) {
        set({ busy: false, error: created.error.message })
        return
      }
      setSession(created.value)
      const activeTenantId = applyBundle(set, created.value)
      set({ busy: false })
      if (activeTenantId) await get().refreshMembers()
    } catch {
      set({ busy: false, error: '团队服务不可用' })
    }
  },

  inviteMember: async (role) => {
    const { activeTenantId } = get()
    if (!activeTenantId) return null
    set({ busy: true, error: null })
    try {
      const result = await teamService.inviteMember(activeTenantId, role)
      set({ busy: false })
      if (!result.ok) {
        set({ error: result.error.message })
        return null
      }
      return result.value
    } catch {
      set({ busy: false, error: '团队服务不可用' })
      return null
    }
  },

  acceptInvite: async (code) => {
    const trimmed = code.trim()
    if (!trimmed) {
      set({ error: '邀请码不能为空' })
      return false
    }
    set({ busy: true, error: null })
    try {
      const result = await teamService.acceptInvite(trimmed)
      if (!result.ok) {
        set({ busy: false, error: result.error.message })
        return false
      }
      set({ busy: false })
      await get().switchTenant(result.value.id)
      return true
    } catch {
      set({ busy: false, error: '团队服务不可用' })
      return false
    }
  },

  refreshMembers: async () => {
    const { activeTenantId } = get()
    if (!activeTenantId) {
      set({ members: [] })
      return
    }
    try {
      const result = await teamService.listMembers(activeTenantId)
      if (result.ok) set({ members: result.value })
    } catch {
      /* 成员列表失败不阻塞主流程 */
    }
  },

  setRole: async (userId, role) => {
    const { activeTenantId } = get()
    if (!activeTenantId) return false
    try {
      const result = await teamService.setRole(activeTenantId, userId, role)
      if (!result.ok) {
        set({ error: result.error.message })
        return false
      }
      await get().refreshMembers()
      // 自己的角色变了：重拉会话上下文。
      if (userId === get().user?.id) await get().bootstrap()
      return true
    } catch {
      set({ error: '团队服务不可用' })
      return false
    }
  },

  setMemberStatus: async (userId, status) => {
    const { activeTenantId } = get()
    if (!activeTenantId) return false
    try {
      const result = await teamService.setMemberStatus(activeTenantId, userId, status)
      if (!result.ok) {
        set({ error: result.error.message })
        return false
      }
      await get().refreshMembers()
      return true
    } catch {
      set({ error: '团队服务不可用' })
      return false
    }
  },

  openTeamSettings: () => set((s) => ({ settingsRequest: s.settingsRequest + 1 })),
  clearError: () => set({ error: null }),
}))
