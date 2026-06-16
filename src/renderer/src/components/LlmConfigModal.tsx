/**
 * @file LLM 配置模态框组件
 * @description 极简神性风格的 LLM Provider 配置界面
 */

import { useState, useEffect } from 'react'
import styles from './LlmConfigModal.module.css'

interface LlmConfigModalProps {
  isOpen: boolean
  onClose: () => void
}

interface ProviderSettings {
  id: string
  name: string
  authType: string
  baseURL?: string
  apiKey?: string
  organization?: string
}

export function LlmConfigModal({ isOpen, onClose }: LlmConfigModalProps) {
  const [formData, setFormData] = useState<ProviderSettings>({
    id: 'openai-compatible',
    name: 'My OpenAI Provider',
    authType: 'api-key',
    baseURL: 'https://api.openai.com/v1',
    apiKey: '',
    organization: ''
  })

  const [testStatus, setTestStatus] = useState<{
    state: 'idle' | 'testing' | 'success' | 'error'
    message: string
    latency?: number
  }>({ state: 'idle', message: '' })

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')

  // 加载现有配置
  useEffect(() => {
    if (isOpen) {
      loadProviders()
    }
  }, [isOpen])

  const loadProviders = async () => {
    try {
      const providers = (await window.electron.invoke(
        'llm:get-providers'
      )) as ProviderSettings[]

      if (providers.length > 0) {
        setFormData(providers[0]!)
      }
    } catch (error) {
      console.error('Failed to load providers:', error)
    }
  }

  const handleTest = async () => {
    setTestStatus({ state: 'testing', message: 'Pinging API node...' })

    try {
      const result = (await window.electron.invoke('llm:test-connection', formData)) as {
        success: boolean
        latency?: number
        error?: string
      }

      if (result.success) {
        setTestStatus({
          state: 'success',
          message: `Connection Established [${result.latency || 0}ms]`,
          latency: result.latency
        })
      } else {
        setTestStatus({
          state: 'error',
          message: `Failed: ${result.error || 'Unknown error'}`
        })
      }
    } catch (error: any) {
      setTestStatus({
        state: 'error',
        message: `Error: ${error.message || 'Network failed'}`
      })
    }
  }

  const handleSave = async () => {
    setSaveStatus('saving')

    try {
      const result = (await window.electron.invoke('llm:save-provider', formData)) as {
        success: boolean
        error?: string
      }

      if (result.success) {
        setSaveStatus('success')
        setTimeout(() => {
          onClose()
          setSaveStatus('idle')
          setTestStatus({ state: 'idle', message: '' })
        }, 500)
      } else {
        setSaveStatus('error')
        setTestStatus({
          state: 'error',
          message: `Save failed: ${result.error}`
        })
      }
    } catch (error: any) {
      setSaveStatus('error')
      setTestStatus({
        state: 'error',
        message: `Error: ${error.message}`
      })
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
      resetStatus()
    }
  }

  const resetStatus = () => {
    setTestStatus({ state: 'idle', message: '' })
    setSaveStatus('idle')
  }

  if (!isOpen) return null

  return (
    <div className={`${styles.modalBackdrop} ${isOpen ? styles.show : ''}`} onClick={handleBackdropClick}>
      <div className={styles.llmConfigPanel}>
        <div className={styles.configHeader}>
          <div className={styles.configTitle}>
            <i className={styles.statusDot}></i>
            LLM Engine Settings
          </div>
          <div className={styles.closeBtn} onClick={onClose}>
            &times;
          </div>
        </div>

        <div className={styles.configBody}>
          <div className={styles.formGroup}>
            <label>Provider Name</label>
            <input
              type="text"
              className={styles.configInput}
              placeholder="My OpenAI Provider"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Provider Type</label>
            <select
              className={styles.configInput}
              value={formData.id}
              onChange={(e) => setFormData({ ...formData, id: e.target.value })}
            >
              <option value="openai-compatible">OpenAI Compatible</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Base URL</label>
            <input
              type="text"
              className={styles.configInput}
              placeholder="https://api.openai.com/v1"
              value={formData.baseURL || ''}
              onChange={(e) => setFormData({ ...formData, baseURL: e.target.value })}
            />
          </div>

          <div className={styles.formGroup}>
            <label>API Key</label>
            <input
              type="password"
              className={styles.configInput}
              placeholder="sk-..."
              value={formData.apiKey || ''}
              onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Organization (Optional)</label>
            <input
              type="text"
              className={styles.configInput}
              placeholder="org-..."
              value={formData.organization || ''}
              onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
            />
          </div>
        </div>

        <div className={styles.configFooter}>
          <div className={`${styles.testStatus} ${styles[testStatus.state]}`}>
            {testStatus.message}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className={`${styles.btn} ${styles.btnGhost}`} onClick={handleTest}>
              Ping Network
            </button>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={handleSave}
              disabled={saveStatus === 'saving'}
            >
              {saveStatus === 'saving' ? 'Saving...' : 'Save & Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
