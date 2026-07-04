import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import styles from './LlmConfigModal.module.css'
import { ModalCloseButton } from './ModalCloseButton'
import { Select } from './ui/Select'
import {
  getProviders,
  saveProvider,
  testConnection,
  removeProvider,
  setDefaultProvider,
  getDefaultProvider,
} from '@/services/llm'
import type { ProviderSettings } from '@janusx/llm-core'

interface LlmConfigModalProps {
  isOpen?: boolean
  onClose?: () => void
  embedded?: boolean
}

const VERTEX_REGIONS = [
  'global',
  'us-central1',
  'us-east1',
  'us-west1',
  'europe-west1',
  'europe-west4',
  'asia-east1',
  'asia-northeast1',
  'asia-southeast1',
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
  const [vertexAuthMode, setVertexAuthMode] = useState<'service-account' | 'adc' | 'json-paste'>(
    'service-account',
  )
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

  const loadProviders = useCallback(async () => {
    try {
      const [list, defaultProvider] = await Promise.all([getProviders(), getDefaultProvider()])
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

  const handleEdit = (provider: ProviderSettings) => {
    setEditingId(provider.id)
    if (provider.authType === 'vertex-ai') {
      setProviderType('vertex-ai')
      setVertexName(provider.name)
      setVertexProjectId(provider.vertexAI?.projectId || '')
      setVertexRegion(provider.vertexAI?.region || 'us-central1')
      setVertexAuthMode(
        provider.vertexAI?.useADC
          ? 'adc'
          : provider.vertexAI?.clientEmail
            ? 'service-account'
            : 'json-paste',
      )
      setVertexClientEmail(provider.vertexAI?.clientEmail || '')
      setVertexPrivateKey(provider.vertexAI?.privateKey || '')
      setVertexSaJSON(provider.vertexAI?.serviceAccountJSON || '')
      setVertexModel(provider.modelId || 'gemini-2.5-flash')
      setVertexProxy(provider.vertexAI?.proxy || '')
    } else {
      setProviderType('openai-compatible')
      setOpenaiName(provider.name)
      setOpenaiBaseURL(provider.baseURL || 'https://api.openai.com/v1')
      setOpenaiApiKey(provider.apiKey || '')
      setOpenaiModel(provider.modelId || 'gpt-4o')
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
        },
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
      setTestStatus({ state: 'testing', message: 'Testing connection...' })
      const settings = buildSettings()
      const testModel =
        providerType === 'vertex-ai'
          ? vertexModel || 'gemini-2.5-flash'
          : openaiModel || 'gpt-3.5-turbo'

      const result = await testConnection({ ...settings, testModel })

      if (result.success) {
        setTestStatus({
          state: 'success',
          message: `Connected [${result.latency || 0}ms]`,
          latency: result.latency,
        })
      } else {
        setTestStatus({
          state: 'error',
          message: `Connection failed: ${result.error || 'Unknown error'}`,
        })
      }
    } catch (error: any) {
      setTestStatus({
        state: 'error',
        message: `Error: ${error.message || 'Network failed'}`,
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

  const getModalPortalContainer = useCallback(() => modalRootRef.current, [])

  if (!isOpen && !embedded) return null

  const panel = (
    <div className={`${styles.llmConfigPanel} ${embedded ? styles.embeddedPanel : ''}`}>
      {!embedded && (
        <div className={styles.configHeader}>
          <div className={styles.configTitle}>
            <i className={styles.statusDot}></i>
            LLM 引擎 <span className={styles.titleMeta}>Providers</span>
          </div>
          {onClose && <ModalCloseButton onClose={() => { onClose(); resetForm() }} />}
        </div>
      )}

      <div className={styles.configBody}>
        {providers.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>已配置服务 Providers</h3>
            <div className={styles.providerList}>
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className={`${styles.providerItem} ${
                    editingId === provider.id ? styles.providerItemActive : ''
                  }`}
                >
                  <div className={styles.providerMeta}>
                    <div className={styles.providerName}>
                      {provider.name}
                      {defaultProviderId === provider.id && (
                        <span className={styles.providerBadge}>默认</span>
                      )}
                    </div>
                    <div className={styles.providerModel}>
                      {provider.authType === 'vertex-ai' ? 'Vertex AI' : 'OpenAI Compatible'}
                      {provider.modelId ? ` / ${provider.modelId}` : ''}
                    </div>
                  </div>
                  <div className={styles.providerActions}>
                    {defaultProviderId !== provider.id && (
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnGhost} ${styles.btnCompact} ${styles.btnAccent}`}
                        onClick={() => handleSetDefault(provider.id)}
                      >
                        设为默认
                      </button>
                    )}
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnGhost} ${styles.btnCompact}`}
                      onClick={() => handleEdit(provider)}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnGhost} ${styles.btnCompact} ${styles.btnDanger}`}
                      onClick={() => handleDelete(provider.id)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{editingId ? '编辑服务' : '添加服务'}</h3>
          <div className={styles.formGroup}>
            <label>服务类型 Provider Type</label>
            <Select
              className={`${styles.configInput} ${styles.selectInput}`}
              value={providerType}
              getPortalContainer={getModalPortalContainer}
              onChange={(value) => {
                setProviderType(value as ProviderType)
                setTestStatus({ state: 'idle', message: '' })
              }}
              options={[
                { value: 'openai-compatible', label: 'OpenAI 兼容接口 (URL + Key)' },
                { value: 'vertex-ai', label: 'Google Vertex AI (GCP 认证)' },
              ]}
            />
          </div>
        </section>

        {providerType === 'openai-compatible' && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>OpenAI 兼容接口</h3>
            <div className={styles.formGroup}>
              <label>服务名称 Provider Name</label>
              <input
                className={styles.configInput}
                placeholder="My OpenAI Provider"
                value={openaiName}
                onChange={(event) => setOpenaiName(event.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label>接口地址 Base URL</label>
              <input
                className={styles.configInput}
                placeholder="https://api.openai.com/v1"
                value={openaiBaseURL}
                onChange={(event) => setOpenaiBaseURL(event.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label>访问密钥 API Key</label>
              <input
                type="password"
                className={styles.configInput}
                placeholder="sk-..."
                value={openaiApiKey}
                onChange={(event) => setOpenaiApiKey(event.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label>默认模型 Default Model</label>
              <input
                className={styles.configInput}
                placeholder="gpt-4o, deepseek-chat..."
                value={openaiModel}
                onChange={(event) => setOpenaiModel(event.target.value)}
              />
            </div>
          </section>
        )}

        {providerType === 'vertex-ai' && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Google Vertex AI</h3>
            <div className={styles.formGroup}>
              <label>服务名称 Provider Name</label>
              <input
                className={styles.configInput}
                placeholder="Vertex AI"
                value={vertexName}
                onChange={(event) => setVertexName(event.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label>GCP 项目 ID</label>
              <input
                className={styles.configInput}
                placeholder="my-gcp-project"
                value={vertexProjectId}
                onChange={(event) => setVertexProjectId(event.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label>区域 Region</label>
              <Select
                className={`${styles.configInput} ${styles.selectInput}`}
                value={vertexRegion}
                getPortalContainer={getModalPortalContainer}
                onChange={setVertexRegion}
                options={VERTEX_REGIONS.map((region) => ({ value: region, label: region }))}
              />
            </div>
            <div className={styles.formGroup}>
              <label>认证方式 Auth Mode</label>
              <Select
                className={`${styles.configInput} ${styles.selectInput}`}
                value={vertexAuthMode}
                getPortalContainer={getModalPortalContainer}
                onChange={(value) =>
                  setVertexAuthMode(value as 'service-account' | 'adc' | 'json-paste')
                }
                options={[
                  { value: 'service-account', label: '服务账号 Service Account (邮箱 + 私钥)' },
                  { value: 'json-paste', label: '粘贴完整 JSON Key' },
                  { value: 'adc', label: '应用默认凭证 ADC' },
                ]}
              />
            </div>

            {vertexAuthMode === 'service-account' && (
              <>
                <div className={styles.formGroup}>
                  <label>客户端邮箱 Client Email</label>
                  <input
                    className={styles.configInput}
                    placeholder="xxx@my-project.iam.gserviceaccount.com"
                    value={vertexClientEmail}
                    onChange={(event) => setVertexClientEmail(event.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>私钥 Private Key</label>
                  <textarea
                    className={`${styles.configInput} ${styles.textareaInput}`}
                    placeholder={`-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----`}
                    value={vertexPrivateKey}
                    onChange={(event) => setVertexPrivateKey(event.target.value)}
                  />
                  <div className={styles.inlineHintRow}>
                    <div className={styles.inlineHint}>
                      将 GCP JSON 密钥里的转义换行转换为实际换行。
                    </div>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnGhost} ${styles.btnCompact}`}
                      onClick={() => setVertexPrivateKey(vertexPrivateKey.replace(/\\n/g, '\n'))}
                    >
                      格式化
                    </button>
                  </div>
                </div>
              </>
            )}

            {vertexAuthMode === 'json-paste' && (
              <div className={styles.formGroup}>
                <label>服务账号 JSON</label>
                <textarea
                  className={`${styles.configInput} ${styles.textareaInput}`}
                  placeholder='{"type":"service_account","project_id":"..."}'
                  value={vertexSaJSON}
                  onChange={(event) => setVertexSaJSON(event.target.value)}
                />
              </div>
            )}

            {vertexAuthMode === 'adc' && (
              <div className={styles.notice}>
                测试前需先执行 <code>gcloud auth application-default login</code>。
              </div>
            )}

            <div className={styles.formGroup}>
              <label>HTTP 代理 Proxy</label>
              <input
                className={styles.configInput}
                placeholder="http://127.0.0.1:7890"
                value={vertexProxy}
                onChange={(event) => setVertexProxy(event.target.value)}
              />
              <div className={styles.inlineHint}>访问 Google 服务需要代理时填写。</div>
            </div>
            <div className={styles.formGroup}>
              <label>默认模型 Default Model</label>
              <Select
                className={`${styles.configInput} ${styles.selectInput}`}
                value={vertexModel}
                getPortalContainer={getModalPortalContainer}
                onChange={setVertexModel}
                options={[
                  { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
                  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
                  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
                  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
                ]}
              />
            </div>
          </section>
        )}
      </div>

      <div className={styles.configFooter}>
        <div className={`${styles.testStatus} ${styles[testStatus.state]}`}>
          {testStatus.message}
        </div>
        <div className={styles.footerActions}>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={handleTest}>
            测试连接
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? '保存中...' : editingId ? '更新 Update' : '保存 Save'}
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
    document.body,
  )
}
