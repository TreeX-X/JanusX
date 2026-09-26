import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { updateExperimentalFeatures } from '@/services/experimental-features'
import { useExperimentalStore } from '@/stores/experimental'
import type { ExperimentalFeatures } from '../../../shared/ipc/experimental'
import styles from './NotificationSettingsPanel.module.css'

type FeatureKey = keyof ExperimentalFeatures

const FEATURE_KEYS: FeatureKey[] = ['knowledge', 'roundtable', 'persona', 'remoteControl', 'teamCollab']

/**
 * 创新实验功能五路开关（知识库 / 圆桌 / 个人画像 / 远程协作控制 / 团队协作）。
 * 默认全部关闭；开启即时保存并即时生效。实验功能可能存在 bug 或不可用，
 * 横幅常驻提示，不随开关消失。关闭远程协作控制会隐藏入口并断开连接、
 * 停止被控服务，避免后台持续监听。关闭团队协作仅隐藏入口（侧栏团队行、
 * 登录挡板自动弹出、设置 team 页），登录态与组织数据保留，重开即恢复；
 * 远控面板里主动点的登录仍会弹挡板，避免死按钮。
 */
export function ExperimentalSettingsPanel() {
  const { t } = useI18n('settings')
  const loaded = useExperimentalStore((s) => s.loaded)
  const load = useExperimentalStore((s) => s.load)
  const apply = useExperimentalStore((s) => s.apply)
  const knowledge = useExperimentalStore((s) => s.knowledge)
  const roundtable = useExperimentalStore((s) => s.roundtable)
  const persona = useExperimentalStore((s) => s.persona)
  const remoteControl = useExperimentalStore((s) => s.remoteControl)
  const teamCollab = useExperimentalStore((s) => s.teamCollab)
  const [savingKey, setSavingKey] = useState<FeatureKey | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void load()
  }, [load])

  const checked: Record<FeatureKey, boolean> = { knowledge, roundtable, persona, remoteControl, teamCollab }
  const apiMissing = typeof window.electron?.experimental === 'undefined'
  const busy = !loaded || savingKey !== null

  const toggle = async (key: FeatureKey, value: boolean) => {
    if (savingKey !== null) return
    setSavingKey(key)
    setError('')
    try {
      const next = await updateExperimentalFeatures({ [key]: value })
      apply(next)
    } catch {
      setError(t('settings:experimental.error.save'))
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <div className={`${styles.status} ${styles.statusError}`} role="note">
          {t('settings:experimental.warning')}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('settings:experimental.section.features')}</h3>
        {apiMissing && (
          <div className={styles.status}>{t('settings:experimental.unavailable')}</div>
        )}
        {FEATURE_KEYS.map((key) => (
          <SettingSwitch
            key={key}
            label={t(`settings:experimental.toggle.${key}.label`)}
            hint={t(`settings:experimental.toggle.${key}.hint`)}
            checked={checked[key]}
            disabled={busy || apiMissing}
            onChange={(value) => void toggle(key, value)}
          />
        ))}
        {savingKey && <div className={styles.status}>{t('settings:footer.saving')}</div>}
        {error && <div className={`${styles.status} ${styles.statusError}`}>{error}</div>}
      </section>
    </div>
  )
}

function SettingSwitch({ label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className={styles.row}>
      <div className={styles.label}>
        <span className={styles.labelText}>{label}</span>
        <span className={styles.hint}>{hint}</span>
      </div>
      <label className={styles.switch}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className={styles.switchTrack} />
      </label>
    </div>
  )
}
