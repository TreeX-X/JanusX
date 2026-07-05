import { useEffect, useState } from 'react'
import {
  getNotificationSettings,
  testFeishuNotification,
  updateNotificationSettings,
  type AgentNotificationSettings,
  type FeishuRemoteProviderConfig,
  type RemoteNotificationSettings,
} from '@/services/notification-settings'
import { DEFAULT_AGENT_NOTIFICATION_SETTINGS } from '../../../shared/notifications'
import styles from './NotificationSettingsPanel.module.css'

type StatusState = 'idle' | 'loading' | 'saving' | 'saved' | 'error'
type TestStatusState = 'idle' | 'testing' | 'success' | 'error'

export function NotificationSettingsPanel() {
  const [settings, setSettings] = useState<AgentNotificationSettings>(
    DEFAULT_AGENT_NOTIFICATION_SETTINGS,
  )
  const [draft, setDraft] = useState<AgentNotificationSettings>(
    DEFAULT_AGENT_NOTIFICATION_SETTINGS,
  )
  const [status, setStatus] = useState<StatusState>('loading')
  const [testStatus, setTestStatus] = useState<TestStatusState>('idle')
  const [error, setError] = useState('')
  const [testMessage, setTestMessage] = useState('')

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
    if (testStatus !== 'idle') {
      setTestStatus('idle')
      setTestMessage('')
    }
  }

  const updateRemoteDraft = <K extends keyof RemoteNotificationSettings>(
    key: K,
    value: RemoteNotificationSettings[K],
  ) => {
    updateDraft('remote', { ...draft.remote, [key]: value })
  }

  const updateFeishuDraft = <K extends keyof FeishuRemoteProviderConfig>(
    key: K,
    value: FeishuRemoteProviderConfig[K],
  ) => {
    updateRemoteDraft('providers', {
      ...draft.remote.providers,
      feishu: {
        ...draft.remote.providers.feishu,
        [key]: value,
      },
    })
  }

  const handleNumberChange = (
    key: 'minDurationSeconds' | 'errorMessageMaxLength',
    value: string,
  ) => {
    updateDraft(key, Number(value))
  }

  const handleRemoteNumberChange = (
    key: 'minDurationSeconds' | 'dedupeWindowSeconds' | 'timeoutSeconds',
    value: string,
  ) => {
    updateRemoteDraft(key, Number(value))
  }

  const handleReset = () => {
    setDraft(settings)
    setStatus('idle')
    setError('')
    setTestStatus('idle')
    setTestMessage('')
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

  const handleTestFeishu = async () => {
    setTestStatus('testing')
    setTestMessage('')
    try {
      const result = await testFeishuNotification(draft.remote)
      if (result.ok) {
        setTestStatus('success')
        setTestMessage('飞书测试通知已发送')
      } else {
        setTestStatus('error')
        setTestMessage(result.reason ?? '飞书测试通知发送失败')
      }
    } catch (err) {
      setTestStatus('error')
      setTestMessage(err instanceof Error ? err.message : '飞书测试通知发送失败')
    }
  }

  const isBusy = status === 'loading' || status === 'saving'
  const isTesting = testStatus === 'testing'
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
          label="启用桌面通知"
          hint="Agent 终端任务结束后，使用系统通知中心提醒。"
          checked={draft.desktopEnabled}
          disabled={isBusy}
          onChange={(checked) => updateDraft('desktopEnabled', checked)}
        />
        <SettingSwitch
          label="任务完成时提醒"
          hint="成功完成的 Agent 会话会在超过时长阈值后提醒。"
          checked={draft.notifyOnSuccess}
          disabled={isBusy || !draft.desktopEnabled}
          onChange={(checked) => updateDraft('notifyOnSuccess', checked)}
        />
        <SettingSwitch
          label="任务失败时提醒"
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

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>远程提醒 Remote Notify</h3>
        <SettingSwitch
          label="启用远程提醒"
          hint="Agent 完成、失败或等待处理时，向已启用的远程通道发送提醒。"
          checked={draft.remote.enabled}
          disabled={isBusy}
          onChange={(checked) => updateRemoteDraft('enabled', checked)}
        />
        <SettingSwitch
          label="完成时发送"
          hint="成功完成的 Agent 会话会按远程阈值发送提醒。"
          checked={draft.remote.notifyOnCompleted}
          disabled={isBusy || !draft.remote.enabled}
          onChange={(checked) => updateRemoteDraft('notifyOnCompleted', checked)}
        />
        <SettingSwitch
          label="失败时发送"
          hint="失败事件会立即进入远程提醒，不受完成提醒开关影响。"
          checked={draft.remote.notifyOnFailed}
          disabled={isBusy || !draft.remote.enabled}
          onChange={(checked) => updateRemoteDraft('notifyOnFailed', checked)}
        />
        <SettingSwitch
          label="等待处理时发送"
          hint="等待授权或输入的 attention 事件会发送到远程通道。"
          checked={draft.remote.notifyOnAttention}
          disabled={isBusy || !draft.remote.enabled}
          onChange={(checked) => updateRemoteDraft('notifyOnAttention', checked)}
        />
        <SettingSwitch
          label="等待授权时发送"
          hint="授权请求会作为独立类型发送，便于后续接入审批按钮。"
          checked={draft.remote.notifyOnApproval}
          disabled={isBusy || !draft.remote.enabled}
          onChange={(checked) => updateRemoteDraft('notifyOnApproval', checked)}
        />
        <div className={styles.row}>
          <div className={styles.label}>
            <span className={styles.labelText}>远程完成提醒阈值</span>
            <span className={styles.hint}>仅作用于完成事件；失败和等待处理会立即发送。</span>
          </div>
          <div className={styles.numberControl}>
            <input
              className={styles.input}
              type="number"
              min={0}
              max={86400}
              step={5}
              value={draft.remote.minDurationSeconds}
              disabled={isBusy || !draft.remote.enabled}
              onChange={(event) => handleRemoteNumberChange('minDurationSeconds', event.target.value)}
            />
            <span className={styles.unit}>sec</span>
          </div>
        </div>
        <div className={styles.row}>
          <div className={styles.label}>
            <span className={styles.labelText}>去重窗口</span>
            <span className={styles.hint}>同一事件在窗口期内不会重复发送到同一 provider。</span>
          </div>
          <div className={styles.numberControl}>
            <input
              className={styles.input}
              type="number"
              min={0}
              max={86400}
              step={30}
              value={draft.remote.dedupeWindowSeconds}
              disabled={isBusy || !draft.remote.enabled}
              onChange={(event) => handleRemoteNumberChange('dedupeWindowSeconds', event.target.value)}
            />
            <span className={styles.unit}>sec</span>
          </div>
        </div>
        <div className={styles.row}>
          <div className={styles.label}>
            <span className={styles.labelText}>发送超时</span>
            <span className={styles.hint}>provider 在超时后会失败返回，不阻塞本地通知流程。</span>
          </div>
          <div className={styles.numberControl}>
            <input
              className={styles.input}
              type="number"
              min={1}
              max={120}
              step={1}
              value={draft.remote.timeoutSeconds}
              disabled={isBusy || !draft.remote.enabled}
              onChange={(event) => handleRemoteNumberChange('timeoutSeconds', event.target.value)}
            />
            <span className={styles.unit}>sec</span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>飞书 Feishu</h3>
        <SettingSwitch
          label="启用飞书提醒"
          hint="使用飞书群机器人 webhook，或自建应用 app_id/app_secret 发送卡片消息。"
          checked={draft.remote.providers.feishu.enabled}
          disabled={isBusy || !draft.remote.enabled}
          onChange={(checked) => updateFeishuDraft('enabled', checked)}
        />
        <div className={styles.row}>
          <div className={styles.label}>
            <span className={styles.labelText}>发送模式</span>
            <span className={styles.hint}>Webhook 适合群机器人；App 适合自建应用发送到 chat/open_id。</span>
          </div>
          <select
            className={styles.select}
            value={draft.remote.providers.feishu.mode}
            disabled={isBusy || !draft.remote.enabled || !draft.remote.providers.feishu.enabled}
            onChange={(event) => updateFeishuDraft('mode', event.target.value === 'app' ? 'app' : 'webhook')}
          >
            <option value="webhook">Webhook</option>
            <option value="app">App</option>
          </select>
        </div>
        {draft.remote.providers.feishu.mode === 'webhook' ? (
          <TextInputRow
            label="Webhook URL"
            hint="飞书群机器人 webhook 地址。"
            value={draft.remote.providers.feishu.webhookUrl}
            disabled={isBusy || !draft.remote.enabled || !draft.remote.providers.feishu.enabled}
            onChange={(value) => updateFeishuDraft('webhookUrl', value)}
          />
        ) : (
          <>
            <TextInputRow
              label="App ID"
              hint="飞书开放平台自建应用 app_id。"
              value={draft.remote.providers.feishu.appId}
              disabled={isBusy || !draft.remote.enabled || !draft.remote.providers.feishu.enabled}
              onChange={(value) => updateFeishuDraft('appId', value)}
            />
            <TextInputRow
              label="App Secret"
              hint="当前版本保存在本地配置文件；后续可迁移到系统 keychain。"
              type="password"
              value={draft.remote.providers.feishu.appSecret}
              disabled={isBusy || !draft.remote.enabled || !draft.remote.providers.feishu.enabled}
              onChange={(value) => updateFeishuDraft('appSecret', value)}
            />
            <div className={styles.row}>
              <div className={styles.label}>
                <span className={styles.labelText}>Receive ID Type</span>
                <span className={styles.hint}>目标 ID 类型，和下方 receive_id 保持一致。</span>
              </div>
              <select
                className={styles.select}
                value={draft.remote.providers.feishu.receiveIdType}
                disabled={isBusy || !draft.remote.enabled || !draft.remote.providers.feishu.enabled}
                onChange={(event) =>
                  updateFeishuDraft(
                    'receiveIdType',
                    event.target.value === 'open_id' ? 'open_id' : 'chat_id',
                  )
                }
              >
                <option value="chat_id">chat_id</option>
                <option value="open_id">open_id</option>
              </select>
            </div>
            <TextInputRow
              label="Receive ID"
              hint="飞书 chat_id 或 open_id。"
              value={draft.remote.providers.feishu.receiveId}
              disabled={isBusy || !draft.remote.enabled || !draft.remote.providers.feishu.enabled}
              onChange={(value) => updateFeishuDraft('receiveId', value)}
            />
          </>
        )}
        <div className={styles.testRow}>
          <button
            type="button"
            className={`${styles.button} ${styles.ghostButton}`}
            onClick={handleTestFeishu}
            disabled={isBusy || isTesting || !draft.remote.providers.feishu.enabled}
          >
            {isTesting ? '测试中...' : '测试飞书通知'}
          </button>
          <span
            className={
              testStatus === 'error'
                ? `${styles.status} ${styles.statusError}`
                : testStatus === 'success'
                  ? `${styles.status} ${styles.statusSuccess}`
                  : styles.status
            }
          >
            {testMessage}
          </span>
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

function TextInputRow({
  label,
  hint,
  value,
  type = 'text',
  disabled,
  onChange,
}: {
  label: string
  hint: string
  value: string
  type?: 'text' | 'password'
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className={styles.row}>
      <div className={styles.label}>
        <span className={styles.labelText}>{label}</span>
        <span className={styles.hint}>{hint}</span>
      </div>
      <input
        className={`${styles.input} ${styles.textInput}`}
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
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
