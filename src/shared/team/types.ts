/**
 * @file 团队领域模型（ToB M1）
 * @description Tenant / User / Team / Project / Membership 等共享类型，
 *              主进程与渲染进程共用。身份提供方（Local / Feishu / WeCom / OIDC）
 *              均映射到同一套模型（见 IdentityAdapter，M2 实现 LocalProvider）。
 */

/** 项目内角色：首批只做四档，Auditor 等后续再加。 */
export type TeamRole = 'owner' | 'maintainer' | 'contributor' | 'viewer'

export type MembershipStatus = 'active' | 'disabled'

export type TeamUserStatus = 'active' | 'disabled'

/**
 * 资源归属：private 仅本人可见，project 共享到项目/团队。
 * 缺省（历史数据无字段）按 private 处理，但为兼容单机老数据，
 * 无 ownerUserId 的历史资源仍对所有人可见（见 repository.isResourceVisibleTo）。
 */
export type OwnerScope = 'private' | 'project'

export type IdentityProvider = 'local' | 'feishu' | 'wecom' | 'oidc'

export interface ExternalIdentity {
  provider: IdentityProvider
  /** 外部稳定 ID：local 为 email，feishu 为 union_id/open_id，wecom 为 UserId，oidc 为 sub。 */
  sub: string
}

/** 一个邮箱 = 一个 User，可加入多个 Tenant（各组织角色独立）。 */
export interface User {
  id: string
  email: string
  name: string
  externalIds: ExternalIdentity[]
  status: TeamUserStatus
  createdAt: string
}

export interface Tenant {
  id: string
  name: string
  ownerUserId: string
  createdAt: string
}

export interface Team {
  id: string
  tenantId: string
  name: string
  createdAt: string
}

export interface Project {
  id: string
  tenantId: string
  name: string
  createdAt: string
}

/** 用户在组织/项目中的角色与状态；projectId 为空表示组织级成员。 */
export interface Membership {
  tenantId: string
  userId: string
  projectId?: string | null
  role: TeamRole
  status: MembershipStatus
  updatedAt: string
}

/** 按组织签发的邀请码：一次性、带过期、带默认角色。 */
export interface Invite {
  code: string
  tenantId: string
  role: TeamRole
  createdBy: string
  expiresAt: string
  usedBy?: string | null
  createdAt: string
}

/** 远控配对设备：每安装一台一 UUID（M3 账号制远控使用）。 */
export interface Device {
  deviceId: string
  userId: string
  name: string
  tenantId?: string | null
  createdAt: string
  lastSeenAt: string
}

/**
 * 会话只携带身份与活跃组织，不携带角色。
 * 每次鉴权按 activeTenantId 实时查 Membership，避免提权/禁用后 token 残留旧权限。
 */
export interface TeamSession {
  userId: string
  deviceId: string
  activeTenantId: string
  issuedAt: string
  expiresAt: string
}

/** P3 预留：治理字段现在只声明不启用，避免后续重构。 */
export interface AuditReservation {
  actorId: string
  tenantId?: string | null
  policyVersion?: string | null
}

/**
 * 身份适配器：M2 实现 LocalProvider（邮箱+密码+邀请码），
 * Feishu / WeCom / OIDC 后续作为 Provider 接入，不重构调用方。
 */
export interface AuthBundle {
  user: User
  tenants: Array<Tenant & { myRole: TeamRole }>
  session: TeamSession
  token: string
  refreshToken: string
}

export interface IdentityAdapter {
  readonly provider: IdentityProvider
  register(input: {
    email: string
    password: string
    name?: string
    inviteCode?: string
    device: { deviceId: string; name: string }
  }): Promise<AuthBundle>
  login(input: {
    email: string
    password: string
    device: { deviceId: string; name: string }
  }): Promise<AuthBundle>
  logout(token: string): Promise<void>
  resolveSession(token: string): Promise<TeamSession | null>
}
