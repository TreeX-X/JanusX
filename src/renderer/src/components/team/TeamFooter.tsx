import { Settings2 } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { useTeamStore } from '@/stores/team'
import styles from './TeamFooter.module.css'

function initials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  if (/[\u4e00-\u9fa5]/.test(trimmed)) return trimmed.slice(-1)
  return trimmed.slice(0, 1).toUpperCase()
}

/**
 * 侧栏底部团队区（ToB M2）：精简卡片，只留组织身份 + 设置入口。
 * 组织切换/新建、成员管理、邀请、退出登录都在设置 team 页。
 */
export function TeamFooter() {
  const { t } = useI18n('team')
  const status = useTeamStore((s) => s.status)
  const tenants = useTeamStore((s) => s.tenants)
  const activeTenantId = useTeamStore((s) => s.activeTenantId)
  const members = useTeamStore((s) => s.members)
  const openTeamSettings = useTeamStore((s) => s.openTeamSettings)
  const requestLogin = useTeamStore((s) => s.requestLogin)

  if (status === 'guest') return null
  // 本地模式：只留一个登录入口，不打扰本地使用。
  if (status === 'local') {
    return (
      <div className="p-2">
        <button
          type="button"
          onClick={() => requestLogin()}
          className={styles.loginButton}
        >
          {t('team:footer.login')}
        </button>
      </div>
    )
  }
  const active = tenants.find((tenant) => tenant.id === activeTenantId) ?? null

  return (
    <div className="p-2">
      <button
        type="button"
        onClick={() => openTeamSettings()}
        title={t('team:footer.teamSettings')}
        className={`${styles.card} flex w-full items-center gap-2 px-2 py-2 text-left`}
      >
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 text-[10px] font-semibold"
          style={{ color: '#ff8a2e' }}
        >
          {(active?.name ?? '?').trim().slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-[12px] font-semibold" style={{ color: 'var(--shell-text, #ddd)' }}>
          {active?.name ?? t('team:footer.noOrg')}
        </span>
        <span className="shrink-0 text-[10px] text-[#666]">
          {t('team:panel.members')} {members.length}
        </span>
        <Settings2 size={13} className="ml-auto shrink-0" style={{ color: 'var(--shell-dim)' }} aria-hidden="true" />
      </button>
    </div>
  )
}

/** 收起态：组织首字母 + 本人头像；本地模式显示登录入口。 */
export function TeamFooterCollapsed() {
  const { t } = useI18n('team')
  const status = useTeamStore((s) => s.status)
  const user = useTeamStore((s) => s.user)
  const tenants = useTeamStore((s) => s.tenants)
  const activeTenantId = useTeamStore((s) => s.activeTenantId)
  const openTeamSettings = useTeamStore((s) => s.openTeamSettings)
  const requestLogin = useTeamStore((s) => s.requestLogin)

  if (status === 'guest') return null
  if (status === 'local') {
    return (
      <div className="flex flex-col items-center gap-1 py-1">
        <button
          type="button"
          onClick={() => requestLogin()}
          title={t('team:footer.login')}
          className="flex h-9 w-9 items-center justify-center rounded-[4px] text-[13px] font-semibold transition-colors hover:bg-white/[0.06]"
          style={{ color: 'var(--shell-muted)' }}
        >
          ?
        </button>
      </div>
    )
  }
  const active = tenants.find((tenant) => tenant.id === activeTenantId) ?? null

  return (
    <div className="flex flex-col items-center gap-1 py-1">
      <button
        type="button"
        onClick={() => openTeamSettings()}
        title={active?.name ?? '?'}
        className="flex h-9 w-9 items-center justify-center rounded-[4px] font-mono text-[13px] font-semibold transition-colors hover:bg-white/[0.06]"
        style={{ color: 'var(--shell-accent-strong)' }}
      >
        {(active?.name ?? '?').trim().slice(0, 1).toUpperCase()}
      </button>
      <span
        title={user?.email ?? ''}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-[10px] font-semibold"
        style={{ color: '#ff8a2e' }}
      >
        {initials(user?.name ?? '?')}
      </span>
    </div>
  )
}
