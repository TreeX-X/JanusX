import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { updateExperimentalFeatures } from '@/services/experimental-features'
import { useExperimentalStore } from '@/stores/experimental'
import { PromptDialog } from './blueprint/PromptDialog'
import type { ExperimentalFeatures } from '../../../shared/ipc/experimental'
import styles from './NotificationSettingsPanel.module.css'

type FeatureKey = keyof ExperimentalFeatures

const PREVIEW_FEATURES: FeatureKey[] = ['blueprint', 'knowledge']
const DEV_FEATURES: FeatureKey[] = ['roundtable', 'persona', 'remoteControl', 'teamCollab']

export function ExperimentalSettingsPanel() {
  const { t } = useI18n('settings')
  const loaded = useExperimentalStore((s) => s.loaded)
  const load = useExperimentalStore((s) => s.load)
  const apply = useExperimentalStore((s) => s.apply)
  const blueprint = useExperimentalStore((s) => s.blueprint)
  const knowledge = useExperimentalStore((s) => s.knowledge)
  const roundtable = useExperimentalStore((s) => s.roundtable)
  const persona = useExperimentalStore((s) => s.persona)
  const remoteControl = useExperimentalStore((s) => s.remoteControl)
  const teamCollab = useExperimentalStore((s) => s.teamCollab)
  const [savingKey, setSavingKey] = useState<FeatureKey | null>(null)
  const [error, setError] = useState('')
  const [showBlueprintConfirm, setShowBlueprintConfirm] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  const checked: Record<FeatureKey, boolean> = { blueprint, knowledge, roundtable, persona, remoteControl, teamCollab }
  const apiMissing = typeof window.electron?.experimental === 'undefined'
  const busy = !loaded || savingKey !== null

  const toggle = async (key: FeatureKey, value: boolean) => {
    if (savingKey !== null) return
    if (key === 'blueprint' && value && !blueprint) {
      setShowBlueprintConfirm(true)
      return
    }
    await doToggle(key, value)
  }

  const doToggle = async (key: FeatureKey, value: boolean) => {
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

  const handleBlueprintConfirm = () => {
    setShowBlueprintConfirm(false)
    void doToggle('blueprint', true)
  }

  const handleBlueprintCancel = () => {
    setShowBlueprintConfirm(false)
  }

  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <div className={`${styles.status} ${styles.statusError}`} role="note">
          {t('settings:experimental.warning')}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('settings:experimental.section.preview')}</h3>
        {apiMissing && (
          <div className={styles.status}>{t('settings:experimental.unavailable')}</div>
        )}
        {PREVIEW_FEATURES.map((key) => (
          <SettingSwitch
            key={key}
            label={t(`settings:experimental.toggle.${key}.label`)}
            hint={t(`settings:experimental.toggle.${key}.hint`)}
            note={t(`settings:experimental.toggle.${key}.note`)}
            checked={checked[key]}
            disabled={busy || apiMissing}
            onChange={(value) => void toggle(key, value)}
          />
        ))}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('settings:experimental.section.dev')}</h3>
        {DEV_FEATURES.map((key) => (
          <SettingSwitch
            key={key}
            label={t(`settings:experimental.toggle.${key}.label`)}
            hint={t(`settings:experimental.toggle.${key}.hint`)}
            note={t(`settings:experimental.toggle.${key}.note`)}
            checked={checked[key]}
            disabled={busy || apiMissing}
            onChange={(value) => void toggle(key, value)}
          />
        ))}
        {savingKey && <div className={styles.status}>{t('settings:footer.saving')}</div>}
        {error && <div className={`${styles.status} ${styles.statusError}`}>{error}</div>}
      </section>

      <PromptDialog
        open={showBlueprintConfirm}
        title={t('settings:experimental.blueprintConfirm.title')}
        description={t('settings:experimental.blueprintConfirm.description')}
        confirmOnly
        confirmText={t('settings:experimental.blueprintConfirm.confirm')}
        cancelText={t('settings:experimental.blueprintConfirm.cancel')}
        onConfirm={handleBlueprintConfirm}
        onCancel={handleBlueprintCancel}
      />
    </div>
  )
}

function SettingSwitch({ label,
  hint,
  note,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint: string
  note: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className={styles.row}>
      <div className={styles.label}>
        <span className={styles.labelText}>{label}</span>
        <span className={styles.hint}>{hint}</span>
        <span className={styles.note}>{note}</span>
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
