import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import styles from './LlmConfigModal.module.css'
import { ModalCloseButton } from './ModalCloseButton'
import { getProviders, saveProvider, testConnection, removeProvider, setDefaultProvider, getDefaultProvider } from '@/services/llm'
import type { ProviderSettings } from '@janusx/llm-core'

interface LlmConfigModalProps {
  isOpen: boolean
  onClose: () => void
}

const VERTEX_REGIONS = [
  'global',
  'us-central1', 'us-east1', 'us-west1',
  'europe-west1', 'europe-west4',
  'asia-east1', 'asia-northeast1', 'asia-southeast1'
]

type ProviderType = 'openai-compatible' | 'vertex-ai'

export function LlmConfigModal({ isOpen, onClose }: LlmConfigModalProps) {
  const [providerType, setProviderType] = useState<ProviderType>('openai-compatible')
  const [providers, setProviders] = useState<ProviderSettings[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(null)

  const [openaiName, setOpenaiName] = useState('')
  const [openaiBaseURL, setOpenaiBaseURL] = useState('https://api.openai.com/v1')
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [openaiModel, setOpenaiModel] = useState('gpt-4o')

  const [vertexName, setVertexName] = useState('Vertex AI')
  const [vertexProjectId, setVertexProjectId] = useState('')
  const [vertexRegion, setVertexRegion] = useState('us-central1')
  const [vertexAuthMode, setVertexAuthMode] = useState<'service-account' | 'adc' | 'json-paste'>('service-account')
  const [vertexClientEmail, setVertexClientEmail] = useState('')
  const [vertexPrivateKey, setVertexPrivateKey] = useState('')
  const [vertexSaJSON, setVertexSaJSON] = useState('')
  const [vertexModel, setVertexModel] = useState('gemini-2.5-flash')
  const [vertexProxy, setVertexProxy] = useState('')

  const [testStatus, setTestStatus] = useState<{
    state: 'idle' | 'testing' | 'success' | 'error'
    message: string
    latency?: number
  }>({ state: 'idle', message: '' })

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')

  const loadProviders = useCallback(async () => {
    try {
      const [list, defaultProvider] = await Promise.all([
        getProviders(),
        getDefaultProvider()
      ])
      setProviders(list)
      setDefaultProviderId(defaultProvider?.provider.id || null)
    } catch (error) {
      console.error('Failed to load providers:', error)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      loadProviders()
      resetForm()
    }
  }, [isOpen, loadProviders])

  const handleSetDefault = async (providerId: string) => {
    try {
      await setDefaultProvider(providerId)
      setDefaultProviderId(providerId)
    } catch (error) {
      console.error('Failed to set default provider:', error)
    }
  }

  const resetForm = () => {
    setEditingId(null)
    setOpenaiName('')
    setOpenaiBaseURL('https://api.openai.com/v1')
    setOpenaiApiKey('')
    setOpenaiModel('gpt-4o')
    setVertexName('Vertex AI')
    setVertexProjectId('')
    setVertexRegion('us-central1')
    setVertexAuthMode('service-account')
    setVertexClientEmail('')
    setVertexPrivateKey('')
    setVertexSaJSON('')
    setVertexModel('gemini-2.5-flash')
    setVertexProxy('')
    setTestStatus({ state: 'idle', message: '' })
    setSaveStatus('idle')
  }

  const handleEdit = (p: ProviderSettings) => {
    setEditingId(p.id)
    if (p.authType === 'vertex-ai') {
      setProviderType('vertex-ai')
      setVertexName(p.name)
      setVertexProjectId(p.vertexAI?.projectId || '')
      setVertexRegion(p.vertexAI?.region || 'us-central1')
      setVertexAuthMode(p.vertexAI?.useADC ? 'adc' : p.vertexAI?.clientEmail ? 'service-account' : 'json-paste')
      setVertexClientEmail(p.vertexAI?.clientEmail || '')
      setVertexPrivateKey(p.vertexAI?.privateKey || '')
      setVertexSaJSON(p.vertexAI?.serviceAccountJSON || '')
      setVertexModel(p.modelId || 'gemini-2.5-flash')
      setVertexProxy(p.vertexAI?.proxy || '')
    } else {
      setProviderType('openai-compatible')
      setOpenaiName(p.name)
      setOpenaiBaseURL(p.baseURL || 'https://api.openai.com/v1')
      setOpenaiApiKey(p.apiKey || '')
      setOpenaiModel(p.modelId || 'gpt-4o')
    }
  }

  const handleDelete = async (id: string) => {
    await removeProvider(id)
    await loadProviders()
    if (editingId === id) resetForm()
  }

  const buildSettings = (): ProviderSettings => {
    if (providerType === 'vertex-ai') {
      return {
        id: editingId || `vertex-ai-${Date.now()}`,
        name: vertexName || 'Vertex AI',
        authType: 'vertex-ai' as any,
        modelId: vertexModel,
        enabled: true,
        vertexAI: {
          projectId: vertexProjectId,
          region: vertexRegion,
          useADC: vertexAuthMode === 'adc',
          clientEmail: vertexAuthMode === 'service-account' ? vertexClientEmail : undefined,
          privateKey: vertexAuthMode === 'service-account' ? vertexPrivateKey : undefined,
          serviceAccountJSON: vertexAuthMode === 'json-paste' ? vertexSaJSON : undefined,
          proxy: vertexProxy || undefined,
        }
      }
    }
    return {
      id: editingId || `openai-${Date.now()}`,
      name: openaiName || 'OpenAI Compatible',
      authType: 'api-key' as any,
      baseURL: openaiBaseURL,
      apiKey: openaiApiKey,
      modelId: openaiModel,
      enabled: true,
    }
  }

  const handleTest = async () => {
    try {
      setTestStatus({ state: 'testing', message: 'Pinging API node...' })
      const settings = buildSettings()
      const testModel = providerType === 'vertex-ai'
        ? (vertexModel || 'gemini-2.5-flash')
        : (openaiModel || 'gpt-3.5-turbo')

      const result = await testConnection({ ...settings, testModel })

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
    try {
      setSaveStatus('saving')
      const settings = buildSettings()
      const result = await saveProvider(settings)

      if (result.success) {
        setSaveStatus('success')
        await loadProviders()
        setTimeout(() => {
          resetForm()
          setSaveStatus('idle')
        }, 500)
      } else {
        setSaveStatus('error')
        setTestStatus({ state: 'error', message: `Save failed: ${result.error}` })
      }
    } catch (error: any) {
      setSaveStatus('error')
      setTestStatus({ state: 'error', message: `Error: ${error.message}` })
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div className={`${styles.modalBackdrop} ${isOpen ? styles.show : ''}`}>
      <div className={styles.llmConfigPanel}>
        <div className={styles.configHeader}>
          <div className={styles.configTitle}>
            <i className={styles.statusDot}></i>
            LLM Engine Settings
          </div>
          <ModalCloseButton onClose={() => { onClose(); resetForm() }} />
        </div>

        <div className={styles.configBody}>
          {/* 已配置列表 */}
          {providers.length > 0 && (
            <div className={styles.formGroup}>
              <label>已配置 Providers</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {providers.map(p => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      background: editingId === p.id ? 'rgba(255,120,48,0.1)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${editingId === p.id ? 'rgba(255,120,48,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: 6,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, color: '#d4d4d4', fontWeight: 500 }}>
                        {p.name}
                        {defaultProviderId === p.id && (
                          <span style={{ fontSize: 10, color: '#ff7830', marginLeft: 6, padding: '1px 4px', background: 'rgba(255,120,48,0.15)', borderRadius: 3 }}>
                            默认
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: '#71717a', marginTop: 2 }}>
                        {p.authType === 'vertex-ai' ? 'Vertex AI' : 'OpenAI Compatible'}
                        {p.modelId ? ` · ${p.modelId}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {defaultProviderId !== p.id && (
                        <button
                          className={`${styles.btn} ${styles.btnGhost}`}
                          style={{ padding: '4px 8px', fontSize: 10, color: '#ff7830' }}
                          onClick={() => handleSetDefault(p.id)}
                        >
                          设为默认
                        </button>
                      )}
                      <button className={`${styles.btn} ${styles.btnGhost}`} style={{ padding: '4px 8px', fontSize: 10 }} onClick={() => handleEdit(p)}>
                        编辑
                      </button>
                      <button className={`${styles.btn} ${styles.btnGhost}`} style={{ padding: '4px 8px', fontSize: 10, color: '#ff5f57' }} onClick={() => handleDelete(p.id)}>
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Provider 类型选择 */}
          <div className={styles.formGroup}>
            <label>{editingId ? '编辑 Provider' : '添加 Provider'}</label>
            <select
              className={styles.configInput}
              value={providerType}
              onChange={e => { setProviderType(e.target.value as ProviderType); setTestStatus({ state: 'idle', message: '' }) }}
            >
              <option value="openai-compatible">OpenAI Compatible (URL + Key)</option>
              <option value="vertex-ai">Google Vertex AI (GCP 认证)</option>
            </select>
          </div>

          {/* OpenAI Compatible 表单 */}
          {providerType === 'openai-compatible' && (
            <>
              <div className={styles.formGroup}>
                <label>Provider Name</label>
                <input
                  className={styles.configInput}
                  placeholder="My OpenAI Provider"
                  value={openaiName}
                  onChange={e => setOpenaiName(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Base URL</label>
                <input
                  className={styles.configInput}
                  placeholder="https://api.openai.com/v1"
                  value={openaiBaseURL}
                  onChange={e => setOpenaiBaseURL(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label>API Key</label>
                <input
                  type="password"
                  className={styles.configInput}
                  placeholder="sk-..."
                  value={openaiApiKey}
                  onChange={e => setOpenaiApiKey(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Default Model</label>
                <input
                  className={styles.configInput}
                  placeholder="gpt-4o, deepseek-chat..."
                  value={openaiModel}
                  onChange={e => setOpenaiModel(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Vertex AI 表单 */}
          {providerType === 'vertex-ai' && (
            <>
              <div className={styles.formGroup}>
                <label>Provider Name</label>
                <input
                  className={styles.configInput}
                  placeholder="Vertex AI"
                  value={vertexName}
                  onChange={e => setVertexName(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label>GCP Project ID</label>
                <input
                  className={styles.configInput}
                  placeholder="my-gcp-project"
                  value={vertexProjectId}
                  onChange={e => setVertexProjectId(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Region</label>
                <select
                  className={styles.configInput}
                  value={vertexRegion}
                  onChange={e => setVertexRegion(e.target.value)}
                >
                  {VERTEX_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>认证方式</label>
                <select
                  className={styles.configInput}
                  value={vertexAuthMode}
                  onChange={e => setVertexAuthMode(e.target.value as 'service-account' | 'adc' | 'json-paste')}
                >
                  <option value="service-account">Service Account (邮箱 + 密钥)</option>
                  <option value="json-paste">粘贴完整 JSON Key</option>
                  <option value="adc">Application Default Credentials</option>
                </select>
              </div>
              {vertexAuthMode === 'service-account' && (
                <>
                  <div className={styles.formGroup}>
                    <label>Client Email</label>
                    <input
                      className={styles.configInput}
                      placeholder="xxx@my-project.iam.gserviceaccount.com"
                      value={vertexClientEmail}
                      onChange={e => setVertexClientEmail(e.target.value)}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Private Key</label>
                    <textarea
                      className={styles.configInput}
                      style={{ minHeight: 80, fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }}
                      placeholder={`-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----`}
                      value={vertexPrivateKey}
                      onChange={e => setVertexPrivateKey(e.target.value)}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <div style={{ fontSize: 10, color: '#71717a' }}>
                        提示: 从 GCP 控制台复制的 JSON 密钥中，private_key 字段的 \n 会被自动转换为换行符
                      </div>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnGhost}`}
                        style={{ padding: '2px 8px', fontSize: 10 }}
                        onClick={() => {
                          // 格式化私钥：将 \n 转换为实际换行符
                          const formatted = vertexPrivateKey.replace(/\\n/g, '\n')
                          setVertexPrivateKey(formatted)
                        }}
                      >
                        格式化
                      </button>
                    </div>
                  </div>
                </>
              )}
              {vertexAuthMode === 'json-paste' && (
                <div className={styles.formGroup}>
                  <label>Service Account JSON</label>
                  <textarea
                    className={styles.configInput}
                    style={{ minHeight: 80, fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }}
                    placeholder='{"type":"service_account","project_id":"...","client_email":"...","private_key":"..."}'
                    value={vertexSaJSON}
                    onChange={e => setVertexSaJSON(e.target.value)}
                  />
                </div>
              )}
              {vertexAuthMode === 'adc' && (
                <div style={{ fontSize: 11, color: '#888', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, borderLeft: '2px solid #ff7830' }}>
                  需先执行: <code style={{ color: '#ff7830' }}>gcloud auth application-default login</code>
                </div>
              )}
              <div className={styles.formGroup}>
                <label>HTTP Proxy (可选)</label>
                <input
                  className={styles.configInput}
                  placeholder="http://127.0.0.1:7890"
                  value={vertexProxy}
                  onChange={e => setVertexProxy(e.target.value)}
                />
                <div style={{ fontSize: 10, color: '#71717a', marginTop: 4 }}>
                  如果需要代理才能访问 Google 服务，请填写代理地址
                </div>
              </div>
              <div className={styles.formGroup}>
                <label>Default Model</label>
                <select
                  className={styles.configInput}
                  value={vertexModel}
                  onChange={e => setVertexModel(e.target.value)}
                >
                  <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                  <option value="gemini-3-pro-preview">Gemini 3 Pro Preview</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                </select>
              </div>
            </>
          )}
        </div>

        <div className={styles.configFooter}>
          <div className={`${styles.testStatus} ${styles[testStatus.state]}`}>
            {testStatus.message}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className={`${styles.btn} ${styles.btnGhost}`} onClick={handleTest}>
              Ping Network
            </button>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={handleSave}
              disabled={saveStatus === 'saving'}
            >
              {saveStatus === 'saving' ? 'Saving...' : editingId ? 'Update' : 'Save & Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
