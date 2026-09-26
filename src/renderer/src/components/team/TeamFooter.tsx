import { useEffect, useState } from 'react'
import { Check, LogIn, Settings2, UserRound } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { useExperimentalStore } from '@/stores/experimental'
import { useTeamStore } from '@/stores/team'
import styles from './TeamFooter.module.css'

function initials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  if (/[\u4e00-\u9fa5]/.test(trimmed)) return trimmed.slice(-1)
  return trimmed.slice(0, 1).toUpperCase()
}

/** 显示名：昵称优先，无昵称时用邮箱前缀，保证一定能认出“我是谁”。 */
function displayNameOf(user: { name?: string; email?: string } | null): string {
  const name = user?.name?.trim()
  if (name) return name
  const email = user?.email?.trim() ?? ''
  if (email) return email.split('@')[0] || email
  return '?'
}

/**
 * 侧栏底部团队行（ToB M2）：用户优先的双行 + hover 快切组织。
 * 第 1 行用户名（我是谁），第 2 行当前组织 · 成员数；
 * 多组织时右上角挂 `×N` 角标，hover 整块向上弹出组织列表直接 switchTenant，
 * 不用再绕进设置页。组织管理、邀请、退出登录仍在设置 team 页。
 */
export function TeamFooter() {
  const { t } = useI18n('team')
  const status = useTeamStore((s) => s.status)
  const user = useTeamStore((s) => s.user)
  const tenants = useTeamStore((s) => s.tenants)
  const activeTenantId = useTeamStore((s) => s.activeTenantId)
  const members = useTeamStore((s) => s.members)
  const busy = useTeamStore((s) => s.busy)
  const openTeamSettings = useTeamStore((s) => s.openTeamSettings)
  const switchTenant = useTeamStore((s) => s.switchTenant)
  const requestLogin = useTeamStore((s) => s.requestLogin)
  const [open, setOpen] = useState(false)
  // 创新开关门控：teamCollab 关闭时整行隐藏（登录态与组织数据保留在 store，重开即恢复）。
  const teamCollabEnabled = useExperimentalStore((s) => s.teamCollab)
  const loadExperimental = useExperimentalStore((s) => s.load)

  useEffect(() => {
    void loadExperimental()
  }, [loadExperimental])

  if (!teamCollabEnabled) return null
  if (status === 'guest') return null
  // 本地模式：与已登录同行高/同双行节奏，但前导用幽灵图标——
  // 透明底 + 1px 边框 + dim 文字，不用 accent 填充大色块抢视觉（见 globals.css：accent 只做 1px 边框与文字）。
  if (status === 'local') {
    return (
      <div className={styles.footer}>
        <button
          type="button"
          onClick={() => requestLogin()}
          title={t('team:footer.login')}
          className={styles.row}
        >
          <span aria-hidden="true" className={styles.avatarGhost}>
            <UserRound size={14} strokeWidth={1.7} />
          </span>
          <span className={styles.textCol}>
            <span className={styles.name}>{t('team:footer.login')}</span>
            <span className={styles.sub}>{t('team:footer.localHint')}</span>
          </span>
          <span className={styles.icon} aria-hidden="true">
            <LogIn size={13} strokeWidth={1.7} />
          </span>
        </button>
      </div>
    )
  }
  const active = tenants.find((tenant) => tenant.id === activeTenantId) ?? null
  const name = displayNameOf(user)
  const sub = active
    ? `${active.name} · ${t('team:panel.members')} ${members.length}`
    : t('team:footer.noOrg')

  return (
    <div
      className={styles.footer}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false)
      }}
    >
      {open && tenants.length > 0 && (
        <div className={styles.popover} role="menu" aria-label={t('team:footer.switchOrg')}>
          <div className={styles.popLabel}>
            {t('team:footer.switchOrgLabel', { count: tenants.length })}
          </div>
          <div className={styles.popList}>
            {tenants.map((item) => {
              const isActive = item.id === activeTenantId
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isActive}
                  disabled={busy}
                  data-active={isActive}
                  onClick={() => {
                    if (!isActive) void switchTenant(item.id)
                    setOpen(false)
                  }}
                  className={styles.popItem}
                  title={item.name}
                >
                  <span aria-hidden="true" className={styles.popAvatar}>
                    {item.name.trim().slice(0, 1).toUpperCase()}
                  </span>
                  <span className={styles.popName}>{item.name}</span>
                  <span className={styles.popRole}>{t(`team:panel.${item.myRole}`)}</span>
                  {isActive && (
                    <span className={styles.popCheck} aria-hidden="true">
                      <Check size={12} strokeWidth={2.2} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <div className={styles.popDivider} aria-hidden="true" />
          <button
            type="button"
            className={styles.popSettings}
            onClick={() => {
              setOpen(false)
              openTeamSettings()
            }}
          >
            <Settings2 size={12} strokeWidth={1.8} aria-hidden="true" />
            {t('team:footer.teamSettings')}
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => openTeamSettings()}
        title={`${name} · ${active?.name ?? t('team:footer.noOrg')}`}
        className={styles.row}
      >
        <span aria-hidden="true" className={styles.avatar}>
          {initials(name)}
        </span>
        <span className={styles.textCol}>
          <span className={styles.name}>{name}</span>
          <span className={styles.sub}>{sub}</span>
        </span>
        {tenants.length > 1 && (
          <span
            className={styles.orgBadge}
            title={t('team:footer.switchOrgLabel', { count: tenants.length })}
            aria-hidden="true"
          >
            ×{tenants.length}
          </span>
        )}
        <span className={styles.icon} aria-hidden="true">
          <Settings2 size={13} strokeWidth={1.7} />
        </span>
      </button>
    </div>
  )
}

/** 收起态：用户优先——本人首字母为主，组织首字母叠角标；键盘/鼠标都靠设置页切换。 */
export function TeamFooterCollapsed() {
  const { t } = useI18n('team')
  const status = useTeamStore((s) => s.status)
  const user = useTeamStore((s) => s.user)
  const tenants = useTeamStore((s) => s.tenants)
  const activeTenantId = useTeamStore((s) => s.activeTenantId)
  const openTeamSettings = useTeamStore((s) => s.openTeamSettings)
  const requestLogin = useTeamStore((s) => s.requestLogin)
  const teamCollabEnabled = useExperimentalStore((s) => s.teamCollab)

  if (!teamCollabEnabled) return null
  if (status === 'guest') return null
  // 收起态本地模式：与工作区收起首字母同语言——透明底无边框 dim 图标，hover 只抬底色不染 accent。
  if (status === 'local') {
    return (
      <div className={styles.collapsedWrap}>
        <button
          type="button"
          onClick={() => requestLogin()}
          title={t('team:footer.login')}
          className={styles.collapsedButton}
          data-ghost="true"
        >
          <UserRound size={15} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
    )
  }
  const active = tenants.find((tenant) => tenant.id === activeTenantId) ?? null
  const name = displayNameOf(user)

  return (
    <div className={styles.collapsedWrap}>
      <button
        type="button"
        onClick={() => openTeamSettings()}
        title={`${name} · ${active?.name ?? t('team:footer.noOrg')}`}
        className={styles.collapsedButton}
      >
        {initials(name)}
        <span title={active?.name ?? ''} aria-hidden="true" className={styles.collapsedBadge}>
          {(active?.name ?? '?').trim().slice(0, 1).toUpperCase()}
        </span>
      </button>
    </div>
  )
}
