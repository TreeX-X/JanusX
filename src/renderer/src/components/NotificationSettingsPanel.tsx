import { useEffect, useState } from 'react'
import {
  getNotificationSettings,
  updateNotificationSettings,
  type AgentNotificationSettings,
} from '@/services/notification-settings'
import { DEFAULT_AGENT_NOTIFICATION_SETTINGS } from '../../../shared/notifications'
import styles from './NotificationSettingsPanel.module.css'

type StatusState = 'idle' | 'loading' | 'saving' | 'saved' | 'error'

export function NotificationSettingsPanel() {
  const [settings, setSettings] = useState<AgentNotificationSettings>(
    DEFAULT_AGENT_NOTIFICATION_SETTINGS,
  )
  const [draft, setDraft] = useState<AgentNotificationSettings>(
    DEFAULT_AGENT_NOTIFICATION_SETTINGS,
  )
  const [status, setStatus] = useState<StatusState>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    setStatus('loading')
    getNotificationSettings()
      .then((next) => {
        if (cancelled) return
        setSettings(next)
        setDraft(next)
        setStatus('idle')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load notification settings')
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const updateDraft = <K extends keyof AgentNotificationSettings>(
    key: K,
    value: AgentNotificationSettings[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }))
    if (status === 'saved' || status === 'error') {
      setStatus('idle')
      setError('')
    }
  }

  const handleNumberChange = (
    key: 'minDurationSeconds' | 'errorMessageMaxLength',
    value: string,
  ) => {
    updateDraft(key, Number(value))
  }

  const handleReset = () => {
    setDraft(settings)
    setStatus('idle')
    setError('')
  }

  const handleSave = async () => {
    setStatus('saving')
    setError('')
    try {
      const next = await updateNotificationSettings(draft)
      setSettings(next)
      setDraft(next)
      setStatus('saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save notification settings')
      setStatus('error')
    }
  }

  const isBusy = status === 'loading' || status === 'saving'
  const statusClass =
    status === 'error'
      ? `${styles.status} ${styles.statusError}`
      : status === 'saved'
        ? `${styles.status} ${styles.statusSuccess}`
        : styles.status

  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>桌面通知 Desktop Notifications</h3>
        <SettingSwitch
          label="启用桌面通知 Desktop"
          hint="Agent 终端任务结束后，可使用系统通知中心提醒。"
          checked={draft.desktopEnabled}
          disabled={isBusy}
          onChange={(checked) => updateDraft('desktopEnabled', checked)}
        />
        <SettingSwitch
          label="任务完成时提醒 Success"
          hint="成功完成的 Agent 会话会在超过时长阈值后提醒。"
          checked={draft.notifyOnSuccess}
          disabled={isBusy || !draft.desktopEnabled}
          onChange={(checked) => updateDraft('notifyOnSuccess', checked)}
        />
        <SettingSwitch
          label="任务失败时提醒 Failure"
          hint="失败提醒独立控制，适合保留更高优先级的异常提醒。"
          checked={draft.notifyOnFailure}
          disabled={isBusy || !draft.desktopEnabled}
          onChange={(checked) => updateDraft('notifyOnFailure', checked)}
        />
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>运行时长阈值 Runtime</h3>
        <div className={styles.row}>
          <div className={styles.label}>
            <span className={styles.labelText}>终端工作超过多久后提醒</span>
            <span className={styles.hint}>设为 0 秒时，每个完成的 Agent 任务都会提醒。</span>
          </div>
          <div className={styles.numberControl}>
            <input
              className={styles.input}
              type="number"
              min={0}
              max={86400}
              step={5}
              value={draft.minDurationSeconds}
              disabled={isBusy || !draft.desktopEnabled}
              onChange={(event) => handleNumberChange('minDurationSeconds', event.target.value)}
            />
            <span className={styles.unit}>sec</span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>失败详情 Failure Details</h3>
        <SettingSwitch
          label="包含简短错误信息"
          hint="过长或嘈杂的 Agent 输出会在进入系统通知前截断。"
          checked={draft.includeErrorMessage}
          disabled={isBusy || !draft.desktopEnabled || !draft.notifyOnFailure}
          onChange={(checked) => updateDraft('includeErrorMessage', checked)}
        />
        <div className={styles.row}>
          <div className={styles.label}>
            <span className={styles.labelText}>错误信息长度</span>
            <span className={styles.hint}>允许范围为 40 到 500 个字符。</span>
          </div>
          <div className={styles.numberControl}>
            <input
              className={styles.input}
              type="number"
              min={40}
              max={500}
              step={10}
              value={draft.errorMessageMaxLength}
              disabled={
                isBusy ||
                !draft.desktopEnabled ||
                !draft.notifyOnFailure ||
                !draft.includeErrorMessage
              }
              onChange={(event) => handleNumberChange('errorMessageMaxLength', event.target.value)}
            />
            <span className={styles.unit}>chars</span>
          </div>
        </div>
      </section>

      <div className={styles.footer}>
        <div className={statusClass}>
          {status === 'loading' && '加载中...'}
          {status === 'saving' && '保存中...'}
          {status === 'saved' && '已保存'}
          {status === 'error' && error}
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.ghostButton}`}
            onClick={handleReset}
            disabled={isBusy}
          >
            重置 Reset
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.primaryButton}`}
            onClick={handleSave}
            disabled={isBusy}
          >
            保存 Save
          </button>
        </div>
      </div>
    </div>
  )
}

function SettingSwitch({
  label,
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
