import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { useTeamStore } from '@/stores/team'
import type { TeamRole } from '../../../../shared/team/types'
import styles from '../NotificationSettingsPanel.module.css'

const ROLE_ORDER: TeamRole[] = ['viewer', 'contributor', 'maintainer', 'owner']

/**
 * 设置中心 team 页（ToB M2）：成员列表/角色/禁用 + 邀请码 + 飞书占位。
 * 权限判断在主进程，UI 只做展示与触发。
 *
 * 视觉与通知/知识库/Agent 页同构：panel > section 灰卡 > row（左 label+hint，右控件），
 * 按钮统一透明底 + 发丝边框（ghost / primary），不做橙色填充色块；
 * 邀请码展示复用 controlStatus 发丝线样式，不用橙色底 pill。
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
    <div className={styles.panel}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('team:gate.title')}</h3>
        {status !== 'authed' ? (
          <div className={styles.row}>
            <div className={styles.label}>
              <span className={styles.labelText}>{t('team:footer.login')}</span>
              <span className={styles.hint}>{t('team:gate.subtitle')}</span>
            </div>
            <button
              type="button"
              onClick={() => requestLogin()}
              className={`${styles.button} ${styles.primaryButton}`}
            >
              {t('team:footer.login')}
            </button>
          </div>
        ) : (
          user && (
            <div className={styles.row}>
              <div className={styles.label}>
                <span className={styles.labelText}>{user.name}</span>
                <span className={styles.hint}>{user.email}</span>
              </div>
              <button
                type="button"
                onClick={() => void logout()}
                className={`${styles.button} ${styles.ghostButton}`}
              >
                {t('team:footer.logout')}
              </button>
            </div>
          )
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('team:footer.switchOrg')}</h3>
        {tenants.map((tenant) => {
          const isActive = tenant.id === activeTenantId
          return (
            <div className={styles.row} key={tenant.id}>
              <div className={styles.label}>
                <span className={styles.labelText}>{tenant.name}</span>
                <span className={styles.hint}>{t(`team:panel.${tenant.myRole}`)}</span>
              </div>
              {isActive ? (
                <span className={styles.status}>{t('team:panel.current')}</span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void switchTenant(tenant.id)}
                  className={`${styles.button} ${styles.ghostButton}`}
                >
                  {t('team:panel.switch')}
                </button>
              )}
            </div>
          )
        })}
        <div className={styles.row}>
          <div className={styles.label}>
            <span className={styles.labelText}>{t('team:footer.createOrg')}</span>
            <span className={styles.hint}>{t('team:gate.createOrgDesc')}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder={t('team:footer.createOrgPlaceholder')}
              className={`${styles.input} ${styles.textInput}`}
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
              className={`${styles.button} ${styles.primaryButton}`}
            >
              {t('team:footer.createOrg')}
            </button>
          </div>
        </div>
        <div className={styles.row}>
          <div className={styles.label}>
            <span className={styles.labelText}>{t('team:gate.joinOrgAction')}</span>
            <span className={styles.hint}>{t('team:gate.inviteHint')}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder={t('team:gate.inviteCodePlaceholder')}
              className={`${styles.input} ${styles.textInput}`}
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
              className={`${styles.button} ${styles.ghostButton}`}
            >
              {t('team:gate.joinOrgAction')}
            </button>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t('team:panel.members')} · {active?.name ?? '—'}
        </h3>
        {members.length === 0 && <div className={styles.status}>{t('team:panel.empty')}</div>}
        {members.map((m) => {
          const isMe = m.user.id === user?.id
          const disabled = m.membership.status !== 'active'
          return (
            <div className={styles.row} key={m.user.id} style={disabled ? { opacity: 0.55 } : undefined}>
              <div className={styles.label}>
                <span className={styles.labelText}>
                  {m.user.name}
                  {isMe && <span className={styles.hint}> · {t('team:panel.you')}</span>}
                </span>
                <span className={styles.hint}>
                  {m.user.email} · {disabled ? t('team:panel.disabled') : t(`team:panel.${m.membership.role}`)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {canManage && !isMe && !disabled && (
                  <>
                    <select
                      value={m.membership.role}
                      disabled={busy}
                      onChange={(e) => void setRole(m.user.id, e.target.value as TeamRole)}
                      className={styles.select}
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
                      className={`${styles.button} ${styles.ghostButton}`}
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
                    className={`${styles.button} ${styles.ghostButton}`}
                  >
                    {t('team:panel.enable')}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </section>

      {canManage && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('team:panel.inviteSection')}</h3>
          <div className={styles.row}>
            <div className={styles.label}>
              <span className={styles.labelText}>{t('team:panel.inviteRole')}</span>
              <span className={styles.hint}>{t('team:panel.codeLabel')}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select
                value={inviteRole}
                disabled={busy}
                onChange={(e) => setInviteRole(e.target.value as TeamRole)}
                className={styles.select}
                aria-label={t('team:panel.inviteRole')}
              >
                {(['viewer', 'contributor', 'maintainer'] as const).map((role) => (
                  <option key={role} value={role}>{t(`team:panel.${role}`)}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={() => void doInvite()}
                className={`${styles.button} ${styles.primaryButton}`}
              >
                {busy ? t('team:panel.inviting') : t('team:panel.inviteAction')}
              </button>
            </div>
          </div>
          {inviteCode && (
            <div className={styles.controlStatus}>
              <div className={styles.label}>
                <span className={styles.labelText}>{t('team:panel.codeLabel')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  className="font-mono"
                  style={{ fontSize: 13, fontWeight: 650, letterSpacing: '0.12em' }}
                >
                  {inviteCode}
                </span>
                <button
                  type="button"
                  onClick={() => void copyCode()}
                  className={`${styles.button} ${styles.ghostButton}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                  {copied ? t('team:panel.copied') : t('team:panel.copyCode')}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {error && <div className={`${styles.status} ${styles.statusError}`}>{error}</div>}

      <p className={styles.controlNotice}>{t('team:panel.feishuSoon')}</p>
    </div>
  )
}
