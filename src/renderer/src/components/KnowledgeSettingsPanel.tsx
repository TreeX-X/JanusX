import { useEffect, useState } from 'react'
import {
  getKnowledgeSettings,
  updateKnowledgeSettings,
  type KnowledgeSettings,
} from '@/services/knowledge-settings'
import { DEFAULT_KNOWLEDGE_SETTINGS } from '../../../shared/knowledge-settings'
import styles from './NotificationSettingsPanel.module.css'

type StatusState = 'idle' | 'loading' | 'saving' | 'saved' | 'error'

export function KnowledgeSettingsPanel() {
  const [settings, setSettings] = useState<KnowledgeSettings>(DEFAULT_KNOWLEDGE_SETTINGS)
  const [draft, setDraft] = useState<KnowledgeSettings>(DEFAULT_KNOWLEDGE_SETTINGS)
  const [status, setStatus] = useState<StatusState>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    setStatus('loading')
    getKnowledgeSettings()
      .then((next) => {
        if (cancelled) return
        setSettings(next)
        setDraft(next)
        setStatus('idle')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '知识库设置加载失败')
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const updateDraft = (enabled: boolean) => {
    setDraft((current) => ({ ...current, enabled }))
    if (status === 'saved' || status === 'error') {
      setStatus('idle')
      setError('')
    }
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
      const next = await updateKnowledgeSettings(draft)
      setSettings(next)
      setDraft(next)
      setStatus('saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : '知识库设置保存失败')
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
        <h3 className={styles.sectionTitle}>知识采集</h3>
        <SettingSwitch
          label="启用知识库记录"
          hint="开启后，JanusX 会把 hook 驱动的 Agent 对话与任务事件写入当前工作区知识库。"
          checked={draft.enabled}
          disabled={isBusy}
          onChange={updateDraft}
        />
        <div className={styles.row}>
          <div className={styles.label}>
            <span className={styles.labelText}>采集边界</span>
            <span className={styles.hint}>
              AI 终端记录只依赖 hook 生命周期事件，不解析原始终端输入。关闭通知提醒不会关闭后台 hook 处理。
            </span>
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
            重置
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.primaryButton}`}
            onClick={handleSave}
            disabled={isBusy}
          >
            保存
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
