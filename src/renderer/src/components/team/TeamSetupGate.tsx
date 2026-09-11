import { useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { useTeamStore } from '@/stores/team'
import styles from './TeamSetupGate.module.css'

/**
 * 团队登录挡板（ToB M2）：未登录时出现，但可跳过——不登录也能用软件本地功能。
 * 注册只建账号；登录后无组织则引导建组织（也可跳过）。
 */
export function TeamSetupGate() {
  const { t } = useI18n('team')
  const status = useTeamStore((s) => s.status)
  const gateForced = useTeamStore((s) => s.gateForced)
  const busy = useTeamStore((s) => s.busy)
  const error = useTeamStore((s) => s.error)
  const tenants = useTeamStore((s) => s.tenants)
  const login = useTeamStore((s) => s.login)
  const register = useTeamStore((s) => s.register)
  const createTenant = useTeamStore((s) => s.createTenant)
  const acceptInvite = useTeamStore((s) => s.acceptInvite)
  const skipLogin = useTeamStore((s) => s.skipLogin)
  const closeGate = useTeamStore((s) => s.closeGate)
  const clearError = useTeamStore((s) => s.clearError)

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [name, setName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [newOrgName, setNewOrgName] = useState('')
  const [joinCode, setJoinCode] = useState('')

  const needsOrg = status === 'authed' && tenants.length === 0
  const showGate = status === 'guest' || gateForced || needsOrg
  if (!showGate) return null
  // 本地模式被强制唤起时允许关闭；首屏 guest 与建组织分支只能跳过进本地模式。
  const closable = status === 'local' && gateForced

  const submit = async () => {
    clearError()
    if (mode === 'login') {
      await login(email, password)
    } else {
      await register({
        email,
        password,
        name: name.trim() || undefined,
        inviteCode: inviteCode.trim() || undefined,
      })
    }
  }

  if (needsOrg) {
    return (
      <GateShell title={t('team:gate.createOrgTitle')} subtitle={t('team:gate.createOrgDesc')}>
        {error && <div role="alert" className={styles.error}>{error}</div>}
        <div className={styles.orgRow}>
          <input value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} placeholder={t('team:gate.tenantNamePlaceholder')} className={styles.input} />
          <button
            type="button"
            onClick={() => void createTenant(newOrgName)}
            disabled={busy || !newOrgName.trim()}
            className={`${styles.primary} ${styles.orgButton}`}
          >
            {t('team:gate.createOrgAction')}
          </button>
        </div>
        <div className={styles.orgRow}>
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder={t('team:gate.inviteCodePlaceholder')} className={`${styles.input} ${styles.inputUpper}`} />
          <button
            type="button"
            onClick={() => void acceptInvite(joinCode)}
            disabled={busy || !joinCode.trim()}
            className={`${styles.primary} ${styles.orgButton}`}
          >
            {t('team:gate.joinOrgAction')}
          </button>
        </div>
        <SkipButton onSkip={skipLogin} />
      </GateShell>
    )
  }

  return (
    <GateShell
      title={t('team:gate.title')}
      subtitle={t('team:gate.subtitle')}
      onClose={closable ? closeGate : undefined}
    >
      <div className={styles.tabs}>
        {(['login', 'register'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); clearError() }}
            aria-pressed={mode === m}
            className={mode === m ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          >
            {t(`team:gate.tab${m === 'login' ? 'Login' : 'Register'}`)}
          </button>
        ))}
      </div>

      <label className={styles.field}>
        {t('team:gate.email')}
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('team:gate.emailPlaceholder')} className={styles.input} autoComplete="email" />
      </label>
      <label className={styles.field}>
        {t('team:gate.password')}
        <div className={styles.passwordWrap}>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('team:gate.passwordPlaceholder')}
            type={showPassword ? 'text' : 'password'}
            className={`${styles.input} ${styles.passwordInput}`}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className={styles.eyeButton}
            tabIndex={-1}
          >
            {showPassword ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </label>
      {mode === 'register' && (
        <>
          <label className={styles.field}>
            {t('team:gate.name')}
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('team:gate.namePlaceholder')} className={styles.input} />
          </label>
          <label className={styles.field}>
            {t('team:gate.inviteCode')}
            <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder={t('team:gate.inviteCodePlaceholder')} className={`${styles.input} ${styles.inputUpper}`} />
          </label>
          <div className={styles.hint}>{t('team:gate.inviteHint')}</div>
        </>
      )}

      {error && <div role="alert" className={styles.error}>{error}</div>}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || !email.trim() || !password}
        className={styles.primary}
      >
        {busy ? t('team:gate.working') : t(mode === 'login' ? 'team:gate.loginAction' : 'team:gate.registerAction')}
      </button>

      <SkipButton onSkip={skipLogin} />
    </GateShell>
  )
}

function SkipButton({ onSkip }: { onSkip: () => void }) {
  const { t } = useI18n('team')
  return (
    <button
      type="button"
      onClick={onSkip}
      className={styles.skip}
    >
      {t('team:gate.skip')}
    </button>
  )
}

function GateShell({ title, subtitle, onClose, children }: {
  title: string
  subtitle: string
  onClose?: () => void
  children: React.ReactNode
}) {
  return (
    <div className={styles.backdrop}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.headerRow}>
            <div className={styles.title}>{title}</div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="close"
                className={styles.close}
              >
                ×
              </button>
            )}
          </div>
          <div className={styles.subtitle}>{subtitle}</div>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}
