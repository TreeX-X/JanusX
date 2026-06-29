import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import styles from './LlmConfigModal.module.css'
import { ModalCloseButton } from './ModalCloseButton'
import { Select } from './ui/Select'
import { getProviders, saveProvider, testConnection, removeProvider, setDefaultProvider, getDefaultProvider } from '@/services/llm'
import type { ProviderSettings } from '@janusx/llm-core'

interface LlmConfigModalProps {
  isOpen?: boolean
  onClose?: () => void
  embedded?: boolean
}

const VERTEX_REGIONS = [
  'global',
  'us-central1', 'us-east1', 'us-west1',
  'europe-west1', 'europe-west4',
  'asia-east1', 'asia-northeast1', 'asia-southeast1'
]

type ProviderType = 'openai-compatible' | 'vertex-ai'

export function LlmConfigModal({ isOpen = false, onClose, embedded = false }: LlmConfigModalProps) {
  const modalRootRef = useRef<HTMLDivElement | null>(null)
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
    if (isOpen || embedded) {
      loadProviders()
      resetForm()
    }
  }, [isOpen, embedded, loadProviders])

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
      setTestStatus({ state: 'testing', message: '正在测试连接 Ping...' })
      const settings = buildSettings()
      const testModel = providerType === 'vertex-ai'
        ? (vertexModel || 'gemini-2.5-flash')
        : (openaiModel || 'gpt-3.5-turbo')

      const result = await testConnection({ ...settings, testModel })

      if (result.success) {
        setTestStatus({
          state: 'success',
          message: `连接成功 Connected [${result.latency || 0}ms]`,
          latency: result.latency
        })
      } else {
        setTestStatus({
          state: 'error',
          message: `连接失败 Failed: ${result.error || 'Unknown error'}`
        })
      }
    } catch (error: any) {
      setTestStatus({
        state: 'error',
        message: `错误 Error: ${error.message || 'Network failed'}`
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
        setTestStatus({ state: 'error', message: `保存失败 Save failed: ${result.error}` })
      }
    } catch (error: any) {
      setSaveStatus('error')
      setTestStatus({ state: 'error', message: `错误 Error: ${error.message}` })
    }
  }

  const getModalPortalContainer = useCallback(() => modalRootRef.current, [])

  if (!isOpen && !embedded) return null

  const panel = (
      <div className={`${styles.llmConfigPanel} ${embedded ? styles.embeddedPanel : ''}`}>
        <div className={styles.configHeader}>
          <div className={styles.configTitle}>
            <i className={styles.statusDot}></i>
            LLM 引擎设置 <span className={styles.titleMeta}>LLM Engine</span>
          </div>
          {!embedded && onClose && (
            <ModalCloseButton onClose={() => { onClose(); resetForm() }} />
          )}
        </div>

        <div className={styles.configBody}>
          {/* 已配置列表 */}
          {providers.length > 0 && (
            <div className={styles.formGroup}>
              <label>已配置服务 <span>Providers</span></label>
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
            <label>{editingId ? '编辑服务 Provider' : '添加服务 Provider'}</label>
            <Select
              className={`${styles.configInput} ${styles.selectInput}`}
              value={providerType}
              getPortalContainer={getModalPortalContainer}
              onChange={(v) => {
                setProviderType(v as ProviderType)
                setTestStatus({ state: 'idle', message: '' })
              }}
              options={[
                { value: 'openai-compatible', label: 'OpenAI 兼容接口 (URL + Key)' },
                { value: 'vertex-ai', label: 'Google Vertex AI (GCP 认证)' }
              ]}
            />
          </div>

          {/* OpenAI Compatible 表单 */}
          {providerType === 'openai-compatible' && (
            <>
              <div className={styles.formGroup}>
                <label>服务名称 <span>Provider Name</span></label>
                <input
                  className={styles.configInput}
                  placeholder="My OpenAI Provider"
                  value={openaiName}
                  onChange={e => setOpenaiName(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label>接口地址 <span>Base URL</span></label>
                <input
                  className={styles.configInput}
                  placeholder="https://api.openai.com/v1"
                  value={openaiBaseURL}
                  onChange={e => setOpenaiBaseURL(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label>访问密钥 <span>API Key</span></label>
                <input
                  type="password"
                  className={styles.configInput}
                  placeholder="sk-..."
                  value={openaiApiKey}
                  onChange={e => setOpenaiApiKey(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label>默认模型 <span>Default Model</span></label>
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
                <label>服务名称 <span>Provider Name</span></label>
                <input
                  className={styles.configInput}
                  placeholder="Vertex AI"
                  value={vertexName}
                  onChange={e => setVertexName(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label>GCP 项目 ID <span>Project ID</span></label>
                <input
                  className={styles.configInput}
                  placeholder="my-gcp-project"
                  value={vertexProjectId}
                  onChange={e => setVertexProjectId(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label>区域 <span>Region</span></label>
                <Select
                  className={`${styles.configInput} ${styles.selectInput}`}
                  value={vertexRegion}
                  getPortalContainer={getModalPortalContainer}
                  onChange={setVertexRegion}
                  options={VERTEX_REGIONS.map((r) => ({ value: r, label: r }))}
                />
              </div>
              <div className={styles.formGroup}>
                <label>认证方式</label>
                <Select
                  className={`${styles.configInput} ${styles.selectInput}`}
                  value={vertexAuthMode}
                  getPortalContainer={getModalPortalContainer}
                  onChange={(v) =>
                    setVertexAuthMode(v as 'service-account' | 'adc' | 'json-paste')
                  }
                  options={[
                    { value: 'service-account', label: '服务账号 Service Account (邮箱 + 密钥)' },
                    { value: 'json-paste', label: '粘贴完整 JSON Key' },
                    { value: 'adc', label: '应用默认凭证 ADC' }
                  ]}
                />
              </div>
              {vertexAuthMode === 'service-account' && (
                <>
                  <div className={styles.formGroup}>
                    <label>客户端邮箱 <span>Client Email</span></label>
                    <input
                      className={styles.configInput}
                      placeholder="xxx@my-project.iam.gserviceaccount.com"
                      value={vertexClientEmail}
                      onChange={e => setVertexClientEmail(e.target.value)}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>私钥 <span>Private Key</span></label>
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
                  <label>服务账号 JSON <span>Service Account JSON</span></label>
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
                <label>HTTP 代理 <span>Proxy，可选</span></label>
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
                <label>默认模型 <span>Default Model</span></label>
                <Select
                  className={`${styles.configInput} ${styles.selectInput}`}
                  value={vertexModel}
                  getPortalContainer={getModalPortalContainer}
                  onChange={setVertexModel}
                  options={[
                    { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
                    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
                    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
                    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }
                  ]}
                />
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
              测试连接 Ping
            </button>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={handleSave}
              disabled={saveStatus === 'saving'}
            >
              {saveStatus === 'saving' ? '保存中...' : editingId ? '更新 Update' : '保存并应用 Save'}
            </button>
          </div>
        </div>
      </div>
  )

  if (embedded) {
    return (
      <div ref={modalRootRef} className={styles.embeddedRoot}>
        {panel}
      </div>
    )
  }

  return createPortal(
    <div ref={modalRootRef} className={`${styles.modalBackdrop} ${isOpen ? styles.show : ''}`}>
      {panel}
    </div>,
    document.body
  )
}
