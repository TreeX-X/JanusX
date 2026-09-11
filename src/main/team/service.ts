/**
 * @file 团队服务与 LocalProvider（ToB M2）
 * @description 自建邮箱账号 + 一邮一户多组织。会话语义：
 *              access 只证身份（userId+device），权限每次按 activeTenant
 *              实时查 Membership；登出（本设备 rev / 全局 tv）与禁用
 *              （membership 状态 / mu 版本）均即时生效。
 */

import { readFile, writeFile } from 'fs/promises'
import { mkdir } from 'fs/promises'
import { dirname } from 'path'
import type {
  AuthBundle,
  IdentityAdapter,
  Membership,
  MembershipStatus,
  Project,
  TeamRole,
  TeamSession,
  Tenant,
  User,
} from '../../shared/team/types'
import { teamStore, type RefreshRecord, type StoredUser, type TeamDocs, type TeamStore } from './store'
import { teamSecretFile } from './paths'
import {
  hashPassword,
  newId,
  newInviteCode,
  newMachineSecret,
  signToken,
  verifyPassword,
  verifyToken,
} from './crypto'

export class TeamError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'TeamError'
    this.code = code
  }
}

const ROLE_RANK: Record<TeamRole, number> = { viewer: 0, contributor: 1, maintainer: 2, owner: 3 }
const ACCESS_TTL_MS = 2 * 60 * 60 * 1000
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const LOGIN_MAX_FAILS = 5
const LOGIN_WINDOW_MS = 5 * 60 * 1000

interface AccessClaims {
  uid: string
  did: string
  tid: string
  tv: number
  dr: number
  mu: number
  exp: number
}

interface RefreshClaims {
  uid: string
  did: string
  rid: string
  exp: number
}

export interface MeResult {
  user: User
  tenants: Array<Tenant & { myRole: TeamRole }>
  session: TeamSession
}

function toUser(stored: StoredUser): User {
  return {
    id: stored.id,
    email: stored.email,
    name: stored.name,
    externalIds: stored.externalIds,
    status: stored.status,
    createdAt: stored.createdAt,
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function assertEmail(email: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TeamError('invalid-email', '邮箱格式不正确')
}

export class TeamService {
  private readonly loginFails = new Map<string, { fails: number; windowStart: number }>()

  constructor(
    private readonly store: TeamStore = teamStore,
    private readonly now: () => number = Date.now,
  ) {}

  private async secret(): Promise<string> {
    try {
      return (await readFile(teamSecretFile(), 'utf8')).trim()
    } catch {
      const created = newMachineSecret()
      await mkdir(dirname(teamSecretFile()), { recursive: true })
      await writeFile(teamSecretFile(), created, 'utf8')
      return created
    }
  }

  private checkRateLimit(email: string): void {
    const record = this.loginFails.get(email)
    if (record && this.now() - record.windowStart < LOGIN_WINDOW_MS && record.fails >= LOGIN_MAX_FAILS) {
      throw new TeamError('rate-limited', '登录尝试过多，请 5 分钟后再试')
    }
  }

  private recordLoginFail(email: string): void {
    const current = this.loginFails.get(email)
    if (!current || this.now() - current.windowStart >= LOGIN_WINDOW_MS) {
      this.loginFails.set(email, { fails: 1, windowStart: this.now() })
    } else {
      current.fails += 1
    }
  }

  private async issuePair(
    user: StoredUser,
    deviceId: string,
    deviceRev: number,
    tenantId: string,
    membershipUpdatedAt: number,
  ): Promise<{ session: TeamSession; token: string; refreshToken: string }> {
    const secret = await this.secret()
    const issuedAt = new Date(this.now()).toISOString()
    const session: TeamSession = {
      userId: user.id,
      deviceId,
      activeTenantId: tenantId,
      issuedAt,
      expiresAt: new Date(this.now() + ACCESS_TTL_MS).toISOString(),
    }
    const access: AccessClaims = {
      uid: user.id,
      did: deviceId,
      tid: tenantId,
      tv: user.tokenVersion,
      dr: deviceRev,
      mu: membershipUpdatedAt,
      exp: this.now() + ACCESS_TTL_MS,
    }
    const rid = newId()
    const refresh: RefreshClaims = { uid: user.id, did: deviceId, rid, exp: this.now() + REFRESH_TTL_MS }
    await this.store.mutate((docs) => {
      docs.refresh.push({ rid, userId: user.id, deviceId, revoked: false, expiresAt: refresh.exp })
    })
    return { session, token: signToken(access as unknown as Record<string, unknown>, secret), refreshToken: signToken(refresh as unknown as Record<string, unknown>, secret) }
  }

  private async buildAuth(user: StoredUser, deviceId: string, tenantId: string): Promise<AuthBundle> {
    const deviceRev = await this.store.read((docs) => docs.devices.find((d) => d.deviceId === deviceId)?.rev ?? 0)
    const tenantList = await this.store.read((docs) => this.tenantRolesLocked(docs, user.id))
    const active = await this.store.read((docs) =>
      docs.memberships.find((m) => m.userId === user.id && m.tenantId === tenantId && m.status === 'active'),
    )
    const mu = active ? Date.parse(active.updatedAt) : 0
    const pair = await this.issuePair(user, deviceId, deviceRev, tenantId, mu)
    return { user: toUser(user), tenants: tenantList, ...pair }
  }

  private tenantRolesLocked(docs: TeamDocs, userId: string): Array<Tenant & { myRole: TeamRole }> {
    return docs.memberships
      .filter((m) => m.userId === userId && m.status === 'active')
      .flatMap((m) => {
        const tenant = docs.tenants.find((t) => t.id === m.tenantId)
        return tenant ? [{ ...tenant, myRole: m.role }] : []
      })
  }

  private async activeMembershipOrThrow(userId: string, tenantId: string, minRole?: TeamRole): Promise<Membership> {
    const membership = await this.store.read((docs) =>
      docs.memberships.find((m) => m.userId === userId && m.tenantId === tenantId && m.status === 'active'),
    )
    if (!membership) throw new TeamError('forbidden', '不在该组织或已被禁用')
    if (minRole && ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
      throw new TeamError('forbidden', '权限不足')
    }
    return membership
  }

  /**
   * 注册只建账号，不建组织：有邀请码则顺带加入对应组织，
   * 无码即纯账号（0 组织），组织一律由 createTenant 显式创建。
   */
  async register(input: {
    email: string
    password: string
    name?: string
    inviteCode?: string
    device: { deviceId: string; name: string }
  }): Promise<AuthBundle> {
    const email = normalizeEmail(input.email)
    assertEmail(email)
    if (!input.password || input.password.length < 8) throw new TeamError('weak-password', '密码至少 8 位')
    if (!input.device.deviceId) throw new TeamError('invalid-device', '缺少设备标识')

    const name = input.name?.trim() || email.split('@')[0]!
    const { salt, hash } = await hashPassword(input.password)
    const nowIso = new Date(this.now()).toISOString()

    const created = await this.store.mutate((docs) => {
      if (docs.users.some((u) => u.email === email)) throw new TeamError('email-taken', '该邮箱已注册，请直接登录')
      const user: StoredUser = {
        id: newId(),
        email,
        name,
        externalIds: [{ provider: 'local', sub: email }],
        status: 'active',
        createdAt: nowIso,
        passSalt: salt,
        passHash: hash,
        tokenVersion: 1,
      }
      docs.users.push(user)
      if (!docs.devices.some((d) => d.deviceId === input.device.deviceId)) {
        docs.devices.push({
          deviceId: input.device.deviceId,
          userId: user.id,
          name: input.device.name || 'Desktop',
          createdAt: nowIso,
          lastSeenAt: nowIso,
          rev: 0,
        })
      }

      let tenantId = ''
      const inviteCode = input.inviteCode?.trim().toUpperCase()
      if (inviteCode) {
        const invite = docs.invites.find((i) => i.code === inviteCode)
        if (!invite) throw new TeamError('invite-invalid', '邀请码无效')
        if (invite.usedBy) throw new TeamError('invite-used', '邀请码已被使用')
        if (Date.parse(invite.expiresAt) <= this.now()) throw new TeamError('invite-expired', '邀请码已过期')
        invite.usedBy = user.id
        docs.memberships.push({
          tenantId: invite.tenantId,
          userId: user.id,
          projectId: null,
          role: invite.role,
          status: 'active',
          updatedAt: nowIso,
        })
        tenantId = invite.tenantId
      }
      return { user, tenantId }
    })

    return this.buildAuth(created.user, input.device.deviceId, created.tenantId)
  }

  private createTenantLocked(docs: TeamDocs, name: string, ownerUserId: string, nowIso: string): string {
    if (!name) throw new TeamError('invalid-name', '组织名称不能为空')
    const tenant: Tenant = { id: newId(), name, ownerUserId, createdAt: nowIso }
    docs.tenants.push(tenant)
    docs.projects.push({ id: newId(), tenantId: tenant.id, name: '默认项目', createdAt: nowIso })
    docs.memberships.push({
      tenantId: tenant.id,
      userId: ownerUserId,
      projectId: null,
      role: 'owner',
      status: 'active',
      updatedAt: nowIso,
    })
    return tenant.id
  }

  async login(input: { email: string; password: string; device: { deviceId: string; name: string } }): Promise<AuthBundle> {
    const email = normalizeEmail(input.email)
    this.checkRateLimit(email)
    const user = await this.store.read((docs) => docs.users.find((u) => u.email === email))
    if (!user || !(await verifyPassword(input.password, user.passSalt, user.passHash))) {
      this.recordLoginFail(email)
      throw new TeamError('invalid-credentials', '邮箱或密码不正确')
    }
    if (user.status !== 'active') throw new TeamError('account-disabled', '账号已被禁用')
    this.loginFails.delete(email)

    const nowIso = new Date(this.now()).toISOString()
    await this.store.mutate((docs) => {
      const device = docs.devices.find((d) => d.deviceId === input.device.deviceId)
      if (device) {
        device.lastSeenAt = nowIso
        if (!device.name && input.device.name) device.name = input.device.name
      } else {
        docs.devices.push({
          deviceId: input.device.deviceId,
          userId: user.id,
          name: input.device.name || 'Desktop',
          createdAt: nowIso,
          lastSeenAt: nowIso,
          rev: 0,
        })
      }
    })

    const firstTenant = await this.store.read(
      (docs) => docs.memberships.find((m) => m.userId === user.id && m.status === 'active')?.tenantId ?? '',
    )
    return this.buildAuth(user, input.device.deviceId, firstTenant)
  }

  async logout(token: string): Promise<{ success: boolean }> {
    const claims = await this.peekAccess(token)
    await this.store.mutate((docs) => {
      for (const record of docs.refresh) {
        if (record.userId === claims.uid && record.deviceId === claims.did) record.revoked = true
      }
      const device = docs.devices.find((d) => d.deviceId === claims.did)
      if (device) device.rev += 1
    })
    return { success: true }
  }

  private async peekAccess(token: string): Promise<AccessClaims> {
    const claims = verifyToken<AccessClaims>(token, await this.secret())
    if (!claims || claims.exp <= this.now()) throw new TeamError('invalid-session', '会话已过期，请重新登录')
    return claims
  }

  async resolveSession(token: string): Promise<TeamSession> {
    const claims = await this.peekAccess(token)
    const { user, deviceRev, membership } = await this.store.read((docs) => ({
      user: docs.users.find((u) => u.id === claims.uid),
      deviceRev: docs.devices.find((d) => d.deviceId === claims.did)?.rev ?? 0,
      membership: claims.tid
        ? docs.memberships.find((m) => m.userId === claims.uid && m.tenantId === claims.tid)
        : undefined,
    }))
    if (!user || user.status !== 'active') throw new TeamError('invalid-session', '账号不可用')
    if (user.tokenVersion !== claims.tv || deviceRev !== claims.dr) {
      throw new TeamError('stale-session', '会话已失效，请重新登录')
    }
    if (claims.tid) {
      // 从未加入 → forbidden；曾加入但禁用/变更 → stale（渲染层静默重进其他组织）。
      if (!membership) throw new TeamError('forbidden', '不在该组织')
      if (membership.status !== 'active') throw new TeamError('stale-session', '你已被该组织禁用')
      if (Date.parse(membership.updatedAt) !== claims.mu) throw new TeamError('stale-session', '成员信息已变更，请重新进入组织')
    }
    return {
      userId: claims.uid,
      deviceId: claims.did,
      activeTenantId: claims.tid,
      issuedAt: new Date(this.now()).toISOString(),
      expiresAt: new Date(claims.exp).toISOString(),
    }
  }

  async refresh(refreshToken: string): Promise<AuthBundle> {
    const secret = await this.secret()
    const claims = verifyToken<RefreshClaims>(refreshToken, secret)
    if (!claims || claims.exp <= this.now()) throw new TeamError('invalid-session', '登录已过期，请重新登录')
    const rotated = await this.store.mutate((docs) => {
      const record: RefreshRecord | undefined = docs.refresh.find((r) => r.rid === claims.rid)
      if (!record || record.revoked || record.userId !== claims.uid || record.deviceId !== claims.did) {
        throw new TeamError('invalid-session', '登录已过期，请重新登录')
      }
      const user = docs.users.find((u) => u.id === claims.uid)
      if (!user || user.status !== 'active') throw new TeamError('invalid-session', '账号不可用')
      record.revoked = true
      const activeTenant = docs.memberships.find((m) => m.userId === user.id && m.status === 'active')?.tenantId ?? ''
      return { user, activeTenant }
    })
    return this.buildAuth(rotated.user, claims.did, rotated.activeTenant)
  }

  async me(token: string): Promise<MeResult> {
    const session = await this.resolveSession(token)
    return this.store.read((docs) => {
      const user = docs.users.find((u) => u.id === session.userId)
      if (!user) throw new TeamError('invalid-session', '账号不可用')
      return { user: toUser(user), tenants: this.tenantRolesLocked(docs, session.userId), session }
    })
  }

  async listTenants(token: string): Promise<Array<Tenant & { myRole: TeamRole }>> {
    const session = await this.resolveSession(token)
    return this.store.read((docs) => this.tenantRolesLocked(docs, session.userId))
  }

  /** 建组织即切换过去：换发该组织的会话，调用方免去再调一次 switch。 */
  async createTenant(token: string, name: string): Promise<AuthBundle> {
    const session = await this.resolveSession(token)
    const trimmed = name.trim()
    const user = await this.store.read((docs) => docs.users.find((u) => u.id === session.userId)!)
    const tenantId = await this.store.mutate((docs) =>
      this.createTenantLocked(docs, trimmed, session.userId, new Date(this.now()).toISOString()),
    )
    return this.buildAuth(user, session.deviceId, tenantId)
  }

  async switchTenant(token: string, tenantId: string): Promise<AuthBundle> {
    const session = await this.resolveSession(token)
    await this.activeMembershipOrThrow(session.userId, tenantId)
    const user = await this.store.read((docs) => docs.users.find((u) => u.id === session.userId)!)
    // 切换组织即换发会话：旧 refresh 按设备回收，由 refresh 轮换自然过期。
    await this.store.mutate((docs) => {
      for (const record of docs.refresh) {
        if (record.userId === session.userId && record.deviceId === session.deviceId) record.revoked = true
      }
    })
    return this.buildAuth(user, session.deviceId, tenantId)
  }

  async inviteMember(token: string, tenantId: string, role: TeamRole = 'viewer'): Promise<{ code: string; expiresAt: string }> {
    const session = await this.resolveSession(token)
    const mine = await this.activeMembershipOrThrow(session.userId, tenantId, 'maintainer')
    if (ROLE_RANK[role] > ROLE_RANK[mine.role]) throw new TeamError('forbidden', '不能邀请高于自己的角色')
    const nowIso = new Date(this.now()).toISOString()
    const invite = { code: newInviteCode(), expiresAt: new Date(this.now() + INVITE_TTL_MS).toISOString() }
    await this.store.mutate((docs) => {
      docs.invites.push({
        code: invite.code,
        tenantId,
        role,
        createdBy: session.userId,
        expiresAt: invite.expiresAt,
        usedBy: null,
        createdAt: nowIso,
      })
    })
    return invite
  }

  async acceptInvite(token: string, code: string): Promise<Tenant & { myRole: TeamRole }> {
    const session = await this.resolveSession(token)
    const normalized = code.trim().toUpperCase()
    const tenant = await this.store.mutate((docs) => {
      const invite = docs.invites.find((i) => i.code === normalized)
      if (!invite) throw new TeamError('invite-invalid', '邀请码无效')
      if (invite.usedBy) throw new TeamError('invite-used', '邀请码已被使用')
      if (Date.parse(invite.expiresAt) <= this.now()) throw new TeamError('invite-expired', '邀请码已过期')
      const existing = docs.memberships.find((m) => m.userId === session.userId && m.tenantId === invite.tenantId)
      if (existing) {
        if (existing.status !== 'active') throw new TeamError('member-disabled', '你曾被该组织禁用，请联系管理员')
        const found = docs.tenants.find((t) => t.id === invite.tenantId)!
        return { tenant: found, role: existing.role }
      }
      invite.usedBy = session.userId
      docs.memberships.push({
        tenantId: invite.tenantId,
        userId: session.userId,
        projectId: null,
        role: invite.role,
        status: 'active',
        updatedAt: new Date(this.now()).toISOString(),
      })
      return { tenant: docs.tenants.find((t) => t.id === invite.tenantId)!, role: invite.role }
    })
    return { ...tenant.tenant, myRole: tenant.role }
  }

  async listMembers(token: string, tenantId: string): Promise<Array<{ user: User; membership: Membership }>> {
    const session = await this.resolveSession(token)
    await this.activeMembershipOrThrow(session.userId, tenantId)
    return this.store.read((docs) =>
      docs.memberships
        .filter((m) => m.tenantId === tenantId)
        .flatMap((m) => {
          const user = docs.users.find((u) => u.id === m.userId)
          return user ? [{ user: toUser(user), membership: m }] : []
        }),
    )
  }

  async listProjects(token: string, tenantId: string): Promise<Project[]> {
    const session = await this.resolveSession(token)
    await this.activeMembershipOrThrow(session.userId, tenantId)
    return this.store.read((docs) => docs.projects.filter((p) => p.tenantId === tenantId))
  }

  async setRole(token: string, tenantId: string, userId: string, role: TeamRole): Promise<{ success: boolean }> {
    const session = await this.resolveSession(token)
    await this.activeMembershipOrThrow(session.userId, tenantId, 'owner')
    const nowIso = new Date(this.now()).toISOString()
    await this.store.mutate((docs) => {
      const target = docs.memberships.find((m) => m.tenantId === tenantId && m.userId === userId)
      if (!target || target.status !== 'active') throw new TeamError('not-found', '成员不存在或已禁用')
      if (target.role === 'owner' && role !== 'owner') {
        const otherOwners = docs.memberships.filter(
          (m) => m.tenantId === tenantId && m.role === 'owner' && m.status === 'active' && m.userId !== userId,
        )
        if (otherOwners.length === 0) throw new TeamError('last-owner', '不能移除最后一个 Owner')
      }
      target.role = role
      target.updatedAt = nowIso
    })
    return { success: true }
  }

  async setMemberStatus(
    token: string,
    tenantId: string,
    userId: string,
    status: MembershipStatus,
  ): Promise<{ success: boolean }> {
    const session = await this.resolveSession(token)
    if (userId === session.userId) throw new TeamError('cannot-modify-self', '不能修改自己的成员状态')
    const mine = await this.activeMembershipOrThrow(session.userId, tenantId, 'maintainer')
    const nowIso = new Date(this.now()).toISOString()
    await this.store.mutate((docs) => {
      const target = docs.memberships.find((m) => m.tenantId === tenantId && m.userId === userId)
      if (!target) throw new TeamError('not-found', '成员不存在')
      if (ROLE_RANK[target.role] >= ROLE_RANK[mine.role] && mine.role !== 'owner') {
        throw new TeamError('forbidden', '不能操作同级或更高角色')
      }
      if (mine.role !== 'owner' && target.role === 'owner') throw new TeamError('forbidden', '只有 Owner 可操作 Owner')
      if (target.role === 'owner' && status !== 'active') {
        const otherOwners = docs.memberships.filter(
          (m) => m.tenantId === tenantId && m.role === 'owner' && m.status === 'active' && m.userId !== userId,
        )
        if (otherOwners.length === 0) throw new TeamError('last-owner', '不能禁用最后一个 Owner')
      }
      target.status = status
      target.updatedAt = nowIso
    })
    return { success: true }
  }
}

export const teamService = new TeamService()

/** M1 IdentityAdapter 的 Local 实现（IPC 层用 TeamService 全量方法）。 */
export const localIdentityProvider: IdentityAdapter = {
  provider: 'local',
  register: (input) => teamService.register(input),
  login: (input) => teamService.login(input),
  logout: (token) => teamService.logout(token).then(() => undefined),
  resolveSession: (token) => teamService.resolveSession(token).catch(() => null),
}
