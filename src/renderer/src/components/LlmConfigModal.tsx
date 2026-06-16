/**
 * @file LLM 配置模态框组件
 * @description 极简神性风格的 LLM Provider 配置界面
 */

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
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
  modelId?: string
  testModelId?: string
}

export function LlmConfigModal({ isOpen, onClose }: LlmConfigModalProps) {
  const [formData, setFormData] = useState<ProviderSettings>({
    id: 'openai-compatible',
    name: 'My OpenAI Provider',
    authType: 'api-key',
    baseURL: 'https://api.openai.com/v1',
    apiKey: '',
    modelId: 'gpt-4o',
    testModelId: 'gpt-3.5-turbo'
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
    try {
      setTestStatus({ state: 'testing', message: 'Pinging API node...' })

      const testModel = formData.testModelId || formData.modelId || 'gpt-3.5-turbo'

      const result = (await window.electron.invoke('llm:test-connection', {
        ...formData,
        testModel
      })) as {
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
      console.error('Test connection error:', error)
      setTestStatus({
        state: 'error',
        message: `Error: ${error.message || 'Network failed'}`
      })
    }
  }

  const handleSave = async () => {
    try {
      setSaveStatus('saving')

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
      console.error('Save provider error:', error)
      setSaveStatus('error')
      setTestStatus({
        state: 'error',
        message: `Error: ${error.message}`
      })
    }
  }

  // 安全的输入处理函数
  const handleInputChange = (field: keyof ProviderSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setFormData(prev => ({ ...prev, [field]: e.target.value }))
    } catch (error) {
      console.error('Input change error:', error)
    }
  }

  const handleSelectChange = (field: keyof ProviderSettings) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    try {
      setFormData(prev => ({ ...prev, [field]: e.target.value }))
    } catch (error) {
      console.error('Select change error:', error)
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    // 防止事件冒泡导致的问题
    if (e.target === e.currentTarget) {
      e.stopPropagation()
      onClose()
      resetStatus()
    }
  }

  const handlePanelClick = (e: React.MouseEvent) => {
    // 阻止事件冒泡到 backdrop
    e.stopPropagation()
  }

  const resetStatus = () => {
    setTestStatus({ state: 'idle', message: '' })
    setSaveStatus('idle')
  }

  if (!isOpen) return null

  return createPortal(
    <div className={`${styles.modalBackdrop} ${isOpen ? styles.show : ''}`} onClick={handleBackdropClick}>
      <div className={styles.llmConfigPanel} onClick={handlePanelClick}>
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
              onChange={handleInputChange('name')}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Provider Type</label>
            <select
              className={styles.configInput}
              value={formData.id}
              onChange={handleSelectChange('id')}
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
              onChange={handleInputChange('baseURL')}
            />
          </div>

          <div className={styles.formGroup}>
            <label>API Key</label>
            <input
              type="password"
              className={styles.configInput}
              placeholder="sk-..."
              value={formData.apiKey || ''}
              onChange={handleInputChange('apiKey')}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Default Model (实际使用)</label>
            <input
              type="text"
              className={styles.configInput}
              placeholder="gpt-4o, deepseek-chat..."
              value={formData.modelId || ''}
              onChange={handleInputChange('modelId')}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Test Model (连接测试)</label>
            <input
              type="text"
              className={styles.configInput}
              placeholder="gpt-3.5-turbo (推荐便宜模型)"
              value={formData.testModelId || ''}
              onChange={handleInputChange('testModelId')}
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
    </div>,
    document.body
  )
}
