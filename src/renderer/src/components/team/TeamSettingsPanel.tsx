import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { useTeamStore } from '@/stores/team'
import type { TeamRole } from '../../../../shared/team/types'

const ROLE_ORDER: TeamRole[] = ['viewer', 'contributor', 'maintainer', 'owner']

/**
 * 设置中心 team 页（ToB M2）：成员列表/角色/禁用 + 邀请码 + 飞书占位。
 * 权限判断在主进程，UI 只做展示与触发。
 */
export function TeamSettingsPanel() {
  const { t } = useI18n('team')
  const status = useTeamStore((s) => s.status)
  const user = useTeamStore((s) => s.user)
  const tenants = useTeamStore((s) => s.tenants)
  const activeTenantId = useTeamStore((s) => s.activeTenantId)
  const members = useTeamStore((s) => s.members)
  const busy = useTeamStore((s) => s.busy)
  const error = useTeamStore((s) => s.error)
  const inviteMember = useTeamStore((s) => s.inviteMember)
  const setRole = useTeamStore((s) => s.setRole)
  const setMemberStatus = useTeamStore((s) => s.setMemberStatus)
  const switchTenant = useTeamStore((s) => s.switchTenant)
  const createTenant = useTeamStore((s) => s.createTenant)
  const acceptInvite = useTeamStore((s) => s.acceptInvite)
  const logout = useTeamStore((s) => s.logout)
  const clearError = useTeamStore((s) => s.clearError)
  const requestLogin = useTeamStore((s) => s.requestLogin)

  const [inviteRole, setInviteRole] = useState<TeamRole>('viewer')
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [joinCode, setJoinCode] = useState('')

  const active = tenants.find((tenant) => tenant.id === activeTenantId) ?? null
  const myRole = active?.myRole ?? 'viewer'
  const canManage = myRole === 'owner' || myRole === 'maintainer'

  const doInvite = async () => {
    clearError()
    setCopied(false)
    const result = await inviteMember(inviteRole)
    if (result) setInviteCode(result.code)
  }

  const copyCode = async () => {
    if (!inviteCode) return
    try {
      await navigator.clipboard.writeText(inviteCode)
    } catch {
      /* 剪贴板不可用时仍显示邀请码 */
    }
    setCopied(true)
  }

  return (
    <div className="space-y-5 text-[12px]" style={{ color: '#c4c4c4' }}>
      {status !== 'authed' && (
        <button
          type="button"
          onClick={() => requestLogin()}
          className="w-full rounded px-3 py-2 text-[12px] transition-colors"
          style={{ background: 'rgba(255,120,48,0.14)', border: '1px solid rgba(255,120,48,0.4)', color: '#ff7830' }}
        >
          {t('team:footer.login')}
        </button>
      )}
      <section>
        <h3 className="mb-2 text-[13px] font-semibold text-white">
          {t('team:footer.switchOrg')}
        </h3>
        <div className="space-y-1">
          {tenants.map((tenant) => (
            <button
              key={tenant.id}
              type="button"
              disabled={busy || tenant.id === activeTenantId}
              onClick={() => void switchTenant(tenant.id)}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-white/[0.06] disabled:opacity-60"
              style={{ color: tenant.id === activeTenantId ? '#ff7830' : '#c4c4c4' }}
            >
              <span className="truncate">{tenant.name}</span>
              <span className="shrink-0 text-[10px] text-[#777]">{tenant.myRole}</span>
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            placeholder={t('team:footer.createOrgPlaceholder')}
            className="min-w-0 flex-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[12px] text-[#eee] outline-none placeholder:text-[#666]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newOrgName.trim()) {
                void createTenant(newOrgName.trim())
                setNewOrgName('')
              }
            }}
          />
          <button
            type="button"
            disabled={busy || !newOrgName.trim()}
            onClick={() => {
              void createTenant(newOrgName.trim())
              setNewOrgName('')
            }}
            className="shrink-0 rounded px-3 py-1 text-[12px] transition-colors disabled:opacity-40"
            style={{ background: 'rgba(255,120,48,0.14)', border: '1px solid rgba(255,120,48,0.4)', color: '#ff7830' }}
          >
            {t('team:footer.createOrg')}
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder={t('team:gate.inviteCodePlaceholder')}
            className="min-w-0 flex-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[12px] uppercase text-[#eee] outline-none placeholder:normal-case placeholder:text-[#666]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && joinCode.trim()) {
                void acceptInvite(joinCode)
                setJoinCode('')
              }
            }}
          />
          <button
            type="button"
            disabled={busy || !joinCode.trim()}
            onClick={() => {
              void acceptInvite(joinCode)
              setJoinCode('')
            }}
            className="shrink-0 rounded px-3 py-1 text-[12px] text-[#c4c4c4] transition-colors hover:bg-white/[0.06] disabled:opacity-40"
          >
            {t('team:gate.joinOrgAction')}
          </button>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-[13px] font-semibold text-white">
          {t('team:panel.members')} · {active?.name ?? '—'}
        </h3>
        {members.length === 0 && <div className="text-[#666]">{t('team:panel.empty')}</div>}
        <div className="space-y-1">
          {members.map((m) => {
            const isMe = m.user.id === user?.id
            const disabled = m.membership.status !== 'active'
            return (
              <div
                key={m.user.id}
                className="flex items-center justify-between gap-2 rounded px-2 py-1.5"
                style={{ background: 'rgba(255,255,255,0.03)', opacity: disabled ? 0.55 : 1 }}
              >
                <div className="min-w-0">
                  <div className="truncate text-[12px] text-[#eee]">
                    {m.user.name}
                    {isMe && <span className="ml-1 text-[10px] text-[#ff7830]">({t('team:panel.you')})</span>}
                  </div>
                  <div className="truncate text-[10px] text-[#777]">{m.user.email}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="text-[10px] text-[#777]">
                    {disabled ? t('team:panel.disabled') : t(`team:panel.${m.membership.role}`)}
                  </span>
                  {canManage && !isMe && !disabled && (
                    <>
                      <select
                        value={m.membership.role}
                        disabled={busy}
                        onChange={(e) => void setRole(m.user.id, e.target.value as TeamRole)}
                        className="rounded border border-white/10 bg-[#222] px-1 py-0.5 text-[11px] text-[#ccc] outline-none disabled:opacity-40"
                        aria-label={t('team:panel.role')}
                      >
                        {ROLE_ORDER.map((role) => (
                          <option key={role} value={role}>{t(`team:panel.${role}`)}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void setMemberStatus(m.user.id, 'disabled')}
                        className="rounded border border-red-500/30 px-2 py-0.5 text-[11px] text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-40"
                      >
                        {t('team:panel.disable')}
                      </button>
                    </>
                  )}
                  {canManage && !isMe && disabled && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setMemberStatus(m.user.id, 'active')}
                      className="rounded border border-white/10 px-2 py-0.5 text-[11px] text-[#ccc] transition-colors hover:bg-white/[0.06] disabled:opacity-40"
                    >
                      {t('team:panel.enable')}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {canManage && (
        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-white">{t('team:panel.inviteSection')}</h3>
          <div className="flex items-center gap-2">
            <span className="text-[#888]">{t('team:panel.inviteRole')}</span>
            <select
              value={inviteRole}
              disabled={busy}
              onChange={(e) => setInviteRole(e.target.value as TeamRole)}
              className="rounded border border-white/10 bg-[#222] px-2 py-1 text-[12px] text-[#ccc] outline-none disabled:opacity-40"
            >
              {(['viewer', 'contributor', 'maintainer'] as const).map((role) => (
                <option key={role} value={role}>{t(`team:panel.${role}`)}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => void doInvite()}
              className="rounded px-3 py-1 text-[12px] transition-colors disabled:opacity-40"
              style={{ background: 'rgba(255,120,48,0.14)', border: '1px solid rgba(255,120,48,0.4)', color: '#ff7830' }}
            >
              {busy ? t('team:panel.inviting') : t('team:panel.inviteAction')}
            </button>
          </div>
          {inviteCode && (
            <div className="mt-2 flex items-center gap-2 rounded px-2 py-1.5" style={{ background: 'rgba(255,120,48,0.08)' }}>
              <span className="text-[11px] text-[#999]">{t('team:panel.codeLabel')}</span>
              <span className="font-mono text-[14px] font-semibold tracking-widest" style={{ color: '#ff7830' }}>{inviteCode}</span>
              <button
                type="button"
                onClick={() => void copyCode()}
                className="flex items-center gap-1 text-[11px] text-[#999] transition-colors hover:text-white"
              >
                {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                {copied ? t('team:panel.copied') : t('team:panel.copyCode')}
              </button>
            </div>
          )}
        </section>
      )}

      {error && <div className="text-[12px] text-[#ff5858]">{error}</div>}

      {status === 'authed' && user && (
        <section style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
          <div className="mb-2 min-w-0">
            <div className="truncate text-[12px] text-[#eee]">{user.name}</div>
            <div className="truncate text-[10px] text-[#777]">{user.email}</div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded border border-white/10 px-3 py-1.5 text-[12px] text-[#c4c4c4] transition-colors hover:bg-white/[0.06]"
          >
            {t('team:footer.logout')}
          </button>
        </section>
      )}

      <section style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
        <button
          type="button"
          disabled
          title="upcoming"
          className="rounded border border-white/10 px-3 py-1.5 text-[12px] text-[#666] opacity-50"
        >
          {t('team:panel.feishuSoon')}
        </button>
      </section>
    </div>
  )
}
