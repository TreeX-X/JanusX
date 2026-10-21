import { ipcMain } from 'electron'
import {
  TEAM_CHANNELS,
  type LoginInput,
  type RegisterInput,
  type TeamResult,
} from '../../shared/ipc/team'
import type { Membership, TeamRole, User } from '../../shared/team/types'
import { TeamError, teamService } from '../team/service'

function toPublic(user: User) {
  return { id: user.id, email: user.email, name: user.name, status: user.status, createdAt: user.createdAt }
}

function envelope<T>(operation: () => Promise<T>): Promise<TeamResult<T>> {
  return operation().then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({
      ok: false as const,
      error: {
        code: error instanceof TeamError ? error.code : 'internal',
        message: error instanceof Error ? error.message : '未知错误',
      },
    }),
  )
}

export function registerTeamHandlers(): void {
  ipcMain.handle(TEAM_CHANNELS.register, (_event, input: RegisterInput) =>
    envelope(() => teamService.register(input).then((bundle) => ({ ...bundle, user: toPublic(bundle.user) }))),
  )
  ipcMain.handle(TEAM_CHANNELS.login, (_event, input: LoginInput) =>
    envelope(() => teamService.login(input).then((bundle) => ({ ...bundle, user: toPublic(bundle.user) }))),
  )
  ipcMain.handle(TEAM_CHANNELS.logout, (_event, token: string) =>
    envelope(async () => {
      const result = await teamService.logout(token)
      return result
    }),
  )
  ipcMain.handle(TEAM_CHANNELS.refresh, (_event, refreshToken: string) =>
    envelope(() => teamService.refresh(refreshToken).then((bundle) => ({ ...bundle, user: toPublic(bundle.user) }))),
  )
  ipcMain.handle(TEAM_CHANNELS.me, (_event, token: string) =>
    envelope(() => teamService.me(token).then((result) => ({ ...result, user: toPublic(result.user) }))),
  )
  ipcMain.handle(TEAM_CHANNELS.listTenants, (_event, token: string) => envelope(() => teamService.listTenants(token)))
  ipcMain.handle(TEAM_CHANNELS.createTenant, (_event, token: string, name: string) =>
    envelope(() => teamService.createTenant(token, name).then((bundle) => ({ ...bundle, user: toPublic(bundle.user) }))),
  )
  ipcMain.handle(TEAM_CHANNELS.switchTenant, (_event, token: string, tenantId: string) =>
    envelope(() => teamService.switchTenant(token, tenantId).then((bundle) => ({ ...bundle, user: toPublic(bundle.user) }))),
  )
  ipcMain.handle(TEAM_CHANNELS.inviteMember, (_event, token: string, tenantId: string, role?: TeamRole) =>
    envelope(() => teamService.inviteMember(token, tenantId, role)),
  )
  ipcMain.handle(TEAM_CHANNELS.acceptInvite, (_event, token: string, code: string) =>
    envelope(() => teamService.acceptInvite(token, code)),
  )
  ipcMain.handle(TEAM_CHANNELS.listMembers, (_event, token: string, tenantId: string) =>
    envelope(() =>
      teamService
        .listMembers(token, tenantId)
        .then((members) => members.map((m) => ({ user: toPublic(m.user), membership: m.membership }))),
    ),
  )
  ipcMain.handle(TEAM_CHANNELS.listProjects, (_event, token: string, tenantId: string) =>
    envelope(() => teamService.listProjects(token, tenantId)),
  )
  ipcMain.handle(TEAM_CHANNELS.setRole, (_event, token: string, tenantId: string, userId: string, role: TeamRole) =>
    envelope(() => teamService.setRole(token, tenantId, userId, role)),
  )
  ipcMain.handle(
    TEAM_CHANNELS.setMemberStatus,
    (_event, token: string, tenantId: string, userId: string, status: Membership['status']) =>
      envelope(async () => {
        const result = await teamService.setMemberStatus(token, tenantId, userId, status)
        return result
      }),
  )
}
