import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '' },
}))

import { configureTeamDataRoot } from '../../src/main/team/paths'
import { TeamError, TeamService } from '../../src/main/team/service'
import type { AuthBundle } from '../../src/shared/team/types'

const deviceA = { deviceId: 'device-a', name: 'Desktop A' }
const deviceB = { deviceId: 'device-b', name: 'Desktop B' }
const deviceC = { deviceId: 'device-c', name: 'Desktop C' }
const deviceD = { deviceId: 'device-d', name: 'Desktop D' }

let dataRoot: string
let service: TeamService
/** 首个账号的会话（复用，避免触发登录限流）。 */
let owner1: AuthBundle

beforeAll(() => {
  dataRoot = mkdtempSync(join(tmpdir(), 'janusx-team-m2-'))
  configureTeamDataRoot(dataRoot)
  service = new TeamService()
})

afterAll(() => {
  configureTeamDataRoot(null)
  rmSync(dataRoot, { recursive: true, force: true })
})

/** 真实建组织流程：老账号建组织（自动切过去）→ 以 owner 角色邀请 → 新邮箱注册加入。 */
async function newOrgOwner(email: string, orgName: string, device = deviceB): Promise<AuthBundle> {
  const created = await service.createTenant(owner1.token, orgName)
  const invite = await service.inviteMember(created.token, created.session.activeTenantId, 'owner')
  return service.register({ email, password: 'password-1', name: email.split('@')[0], inviteCode: invite.code, device })
}

describe('M2 register / login', () => {
  it('注册只建账号不建组织', async () => {
    owner1 = await service.register({ email: 'owner@example.com', password: 'password-1', name: 'Owner', device: deviceA })
    expect(owner1.tenants).toEqual([])
    expect(owner1.session.activeTenantId).toBe('')
  })

  it('无邀请码注册即纯账号，可登录', async () => {
    await service.register({ email: 'plain@example.com', password: 'password-1', device: deviceC })
    const login = await service.login({ email: 'plain@example.com', password: 'password-1', device: deviceC })
    expect(login.tenants).toEqual([])
  })

  it('弱密码与重复邮箱被拒绝', async () => {
    await expect(service.register({ email: 'weak@example.com', password: 'short', device: deviceB })).rejects.toMatchObject({
      code: 'weak-password',
    })
    await expect(
      service.register({ email: 'owner@example.com', password: 'password-1', device: deviceB }),
    ).rejects.toMatchObject({ code: 'email-taken' })
  })
})

describe('M2 tenant / invite / members', () => {
  it('建组织即切换过去并成为 Owner（含默认项目）', async () => {
    const created = await service.createTenant(owner1.token, 'T1')
    expect(created.session.activeTenantId).toBe(created.tenants[0]?.id)
    expect(created.tenants[0]?.myRole).toBe('owner')
    const projects = await service.listProjects(created.token, created.session.activeTenantId)
    expect(projects).toHaveLength(1)
    owner1 = created
  })

  it('邀请→注册→成员仅见授权组织', async () => {
    const o2 = await newOrgOwner('owner2@example.com', 'T2')
    const tenantId = o2.session.activeTenantId
    const invite = await service.inviteMember(o2.token, tenantId, 'viewer')

    const member = await service.register({ email: 'member@example.com', password: 'password-1', inviteCode: invite.code, device: deviceC })
    expect(member.tenants[0]?.myRole).toBe('viewer')

    const members = await service.listMembers(member.token, tenantId)
    // T2 另有创建人 owner@example.com（建组织者自动成为 Owner，符合产品语义）
    expect(members.map((m) => m.user.email).sort()).toEqual(['member@example.com', 'owner2@example.com', 'owner@example.com'])

    await expect(service.inviteMember(member.token, tenantId, 'viewer')).rejects.toMatchObject({ code: 'forbidden' })
    await expect(
      service.register({ email: 'reuse@example.com', password: 'password-1', inviteCode: invite.code, device: deviceD }),
    ).rejects.toMatchObject({ code: 'invite-used' })
  })

  it('不能移除最后一个 Owner', async () => {
    const solo = await service.createTenant(owner1.token, 'Solo')
    const soloId = solo.session.activeTenantId
    await expect(service.setRole(solo.token, soloId, solo.user.id, 'viewer')).rejects.toMatchObject({ code: 'last-owner' })
    // 提拔成员后再降级自己则允许
    const invite = await service.inviteMember(solo.token, soloId, 'contributor')
    const member = await service.register({ email: 'solomember@example.com', password: 'password-1', inviteCode: invite.code, device: deviceC })
    await service.setRole(solo.token, soloId, member.user.id, 'owner')
    const demoted = await service.setRole(solo.token, soloId, solo.user.id, 'viewer')
    expect(demoted).toEqual({ success: true })
  })
})

describe('M2 disable / switch / logout', () => {
  it('禁用后立刻失去该组织权限，不影响其他组织', async () => {
    const o4 = await newOrgOwner('owner4@example.com', 'T4', deviceD)
    const t4 = o4.session.activeTenantId
    const invite = await service.inviteMember(o4.token, t4, 'contributor')
    const member = await service.register({ email: 'multi@example.com', password: 'password-1', inviteCode: invite.code, device: deviceC })

    // 同一邮箱进第二个组织
    const o5 = await newOrgOwner('owner5@example.com', 'T5', deviceD)
    const t5 = o5.session.activeTenantId
    const invite5 = await service.inviteMember(o5.token, t5, 'viewer')
    await service.acceptInvite(member.token, invite5.code)

    await service.setMemberStatus(o4.token, t4, member.user.id, 'disabled')
    // 死会话调任何组织接口都是 stale-session（渲染层据此静默重进）
    await expect(service.listMembers(member.token, t4)).rejects.toMatchObject({ code: 'stale-session' })
    await expect(service.me(member.token)).rejects.toMatchObject({ code: 'stale-session' })
    // 有效会话的局外人才是 forbidden
    await expect(service.listMembers(o5.token, t4)).rejects.toMatchObject({ code: 'forbidden' })
    // 另一个组织不受影响：用有效会话切过去仍可访问
    const fresh = await service.login({ email: 'multi@example.com', password: 'password-1', device: deviceC })
    expect(fresh.tenants.map((t) => t.id)).toEqual([t5])
    const inT5 = await service.switchTenant(fresh.token, t5)
    expect(inT5.session.activeTenantId).toBe(t5)
    const membersT5 = await service.listMembers(inT5.token, t5)
    expect(membersT5.some((m) => m.user.email === 'multi@example.com')).toBe(true)
  })

  it('登出后本设备会话立刻失效', async () => {
    const o6 = await newOrgOwner('owner6@example.com', 'T6', deviceD)
    await service.logout(o6.token)
    await expect(service.me(o6.token)).rejects.toMatchObject({ code: 'stale-session' })
  })

  it('refresh 轮换：旧 refresh 失效，新 refresh 可用', async () => {
    const o7 = await newOrgOwner('owner7@example.com', 'T7', deviceD)
    const rotated = await service.refresh(o7.refreshToken)
    expect(rotated.token).not.toBe(o7.token)
    await expect(service.refresh(o7.refreshToken)).rejects.toMatchObject({ code: 'invalid-session' })
    const me = await service.me(rotated.token)
    expect(me.user.email).toBe('owner7@example.com')
  })
})

describe('M2 login rate limit', () => {
  it('错误密码 5 次后限流', async () => {
    for (let i = 0; i < 5; i += 1) {
      await expect(service.login({ email: 'owner@example.com', password: 'wrong', device: deviceA })).rejects.toMatchObject({
        code: 'invalid-credentials',
      })
    }
    await expect(service.login({ email: 'owner@example.com', password: 'password-1', device: deviceA })).rejects.toMatchObject({
      code: 'rate-limited',
    })
  })

  it('TeamError 携带 code 供 IPC 透出', async () => {
    try {
      await service.login({ email: 'nobody@example.com', password: 'x'.repeat(9), device: deviceA })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(TeamError)
    }
  })
})
