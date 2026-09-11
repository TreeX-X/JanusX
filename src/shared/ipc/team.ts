import type {
  AuthBundle,
  Membership,
  MembershipStatus,
  Project,
  TeamRole,
  TeamSession,
  Tenant,
  User,
} from '../team/types'

export type { AuthBundle }

export const TEAM_CHANNELS = {
  register: 'team:register',
  login: 'team:login',
  logout: 'team:logout',
  refresh: 'team:refresh',
  me: 'team:me',
  listTenants: 'team:listTenants',
  createTenant: 'team:createTenant',
  switchTenant: 'team:switchTenant',
  inviteMember: 'team:inviteMember',
  acceptInvite: 'team:acceptInvite',
  listMembers: 'team:listMembers',
  listProjects: 'team:listProjects',
  setRole: 'team:setRole',
  setMemberStatus: 'team:setMemberStatus',
} as const

/** 脱敏用户视图：永不经过 IPC（含密码哈希）。 */
export interface PublicUser {
  id: string
  email: string
  name: string
  status: User['status']
  createdAt: string
}

export interface TenantWithRole extends Tenant {
  myRole: TeamRole
}

export interface MemberView {
  user: PublicUser
  membership: Membership
}

export interface MeResult {
  user: PublicUser
  tenants: TenantWithRole[]
  session: TeamSession
}

export type TeamResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }

export interface TeamDeviceInput {
  deviceId: string
  name: string
}

export interface RegisterInput {
  email: string
  password: string
  name?: string
  inviteCode?: string
  device: TeamDeviceInput
}

export interface LoginInput {
  email: string
  password: string
  device: TeamDeviceInput
}

export interface TeamAPI {
  register(input: RegisterInput): Promise<TeamResult<AuthBundle>>
  login(input: LoginInput): Promise<TeamResult<AuthBundle>>
  logout(token: string): Promise<TeamResult<{ success: boolean }>>
  refresh(refreshToken: string): Promise<TeamResult<AuthBundle>>
  me(token: string): Promise<TeamResult<MeResult>>
  listTenants(token: string): Promise<TeamResult<TenantWithRole[]>>
  /** 建组织即切换过去（换发该组织的会话），免去再调一次 switch。 */
  createTenant(token: string, name: string): Promise<TeamResult<AuthBundle>>
  switchTenant(token: string, tenantId: string): Promise<TeamResult<AuthBundle>>
  inviteMember(token: string, tenantId: string, role?: TeamRole): Promise<TeamResult<{ code: string; expiresAt: string }>>
  acceptInvite(token: string, code: string): Promise<TeamResult<TenantWithRole>>
  listMembers(token: string, tenantId: string): Promise<TeamResult<MemberView[]>>
  listProjects(token: string, tenantId: string): Promise<TeamResult<Project[]>>
  setRole(token: string, tenantId: string, userId: string, role: TeamRole): Promise<TeamResult<{ success: boolean }>>
  setMemberStatus(
    token: string,
    tenantId: string,
    userId: string,
    status: MembershipStatus,
  ): Promise<TeamResult<{ success: boolean }>>
}
