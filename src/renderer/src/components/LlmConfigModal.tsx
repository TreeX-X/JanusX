import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { RefreshCw } from 'lucide-react'
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
  getLlmRuntimeStatus,
} from '@/services/llm'
import { useI18n } from '@/i18n/useI18n'
import type { ProviderSettings } from '@janusx/llm-core'
import type { LlmRuntimeStatus } from '../../../shared/ipc/llm'

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

function notifyJanusLlmConfigChanged(preferDefault: boolean, updatedProviderId?: string): void {
  window.dispatchEvent(new CustomEvent('janus:llm-config-changed', {
    detail: { preferDefault, updatedProviderId },
  }))
}

export function LlmConfigModal({ isOpen = false, onClose, embedded = false }: LlmConfigModalProps) {
  const { t } = useI18n('llm')
  const modalRootRef = useRef<HTMLDivElement | null>(null)
  const [providerType, setProviderType] = useState<ProviderType>('openai-compatible')
  const [providers, setProviders] = useState<ProviderSettings[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(null)
  const [runtimeStatus, setRuntimeStatus] = useState<LlmRuntimeStatus | null>(null)
  const [runtimeChecking, setRuntimeChecking] = useState(false)

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
  const [vertexModel, setVertexModel] = useState('gemini-3.6-flash')
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
    setVertexModel('gemini-3.6-flash')
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

  const refreshRuntimeStatus = useCallback(async () => {
    setRuntimeChecking(true)
    try {
      setRuntimeStatus(await getLlmRuntimeStatus())
    } catch (error) {
      console.error('Failed to detect LLM runtime status:', error)
    } finally {
      setRuntimeChecking(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen || embedded) {
      loadProviders()
      void refreshRuntimeStatus()
      resetForm()
    }
  }, [isOpen, embedded, loadProviders, refreshRuntimeStatus])

  const handleSetDefault = async (providerId: string) => {
    try {
      await setDefaultProvider(providerId)
      setDefaultProviderId(providerId)
      notifyJanusLlmConfigChanged(true, providerId)
      void refreshRuntimeStatus()
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
      setVertexModel(provider.modelId || 'gemini-3.6-flash')
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
    notifyJanusLlmConfigChanged(defaultProviderId === id, id)
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
      setTestStatus({ state: 'testing', message: t('llm:test.testing') })
      const settings = buildSettings()
      const testModel =
        providerType === 'vertex-ai'
          ? vertexModel || 'gemini-3.6-flash'
          : openaiModel || 'gpt-3.5-turbo'

      const result = await testConnection({ ...settings, testModel })

      if (result.success) {
        setTestStatus({
          state: 'success',
          message: t('llm:test.connected', { latency: result.latency || 0 }),
          latency: result.latency,
        })
      } else {
        setTestStatus({
          state: 'error',
          message: t('llm:test.connectionFailed', { error: result.error || t('llm:test.unknownError') }),
        })
      }
    } catch (error: any) {
      setTestStatus({
        state: 'error',
        message: t('llm:test.error', { message: error.message || t('llm:test.networkFailed') }),
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
        notifyJanusLlmConfigChanged(defaultProviderId === null || defaultProviderId === settings.id, settings.id)
        void refreshRuntimeStatus()
        setTimeout(() => {
          resetForm()
          setSaveStatus('idle')
        }, 500)
      } else {
        setSaveStatus('error')
        setTestStatus({ state: 'error', message: t('llm:save.saveFailed', { error: result.error }) })
      }
    } catch (error: any) {
      setSaveStatus('error')
      setTestStatus({ state: 'error', message: t('llm:save.error', { message: error.message }) })
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
            {t('llm:title.label')} <span className={styles.titleMeta}>{t('llm:title.meta')}</span>
          </div>
          {onClose && <ModalCloseButton onClose={() => { onClose(); resetForm() }} />}
        </div>
      )}

      <div className={styles.configBody}>
        {runtimeStatus && (
          <div className={styles.runtimeStatus} data-state={runtimeStatus.connection.state}>
            <span className={styles.runtimeIndicator} />
            <div>
              <strong>{runtimeStatus.connection.state === 'available'
                ? t('llm:runtime.available')
                : runtimeStatus.connection.state === 'unavailable'
                  ? t('llm:runtime.unavailable')
                  : runtimeStatus.connection.state === 'unconfigured'
                    ? t('llm:runtime.unconfigured')
                    : t('llm:runtime.detecting')}</strong>
              <span>{runtimeStatus.profileSync.state === 'synchronized'
                ? t('llm:runtime.synced', { count: runtimeStatus.profileSync.importedProviderCount })
                : runtimeStatus.profileSync.state === 'unchanged'
                  ? t('llm:runtime.unchanged')
                  : runtimeStatus.profileSync.state === 'source-missing'
                    ? t('llm:runtime.sourceMissing')
                    : runtimeStatus.profileSync.state === 'failed'
                      ? t('llm:runtime.failed')
                      : t('llm:runtime.formal')}
                {runtimeStatus.connection.latency !== undefined
                  ? t('llm:runtime.latencySuffix', { latency: runtimeStatus.connection.latency })
                  : ''}
              </span>
              {runtimeStatus.connection.error && <small>{runtimeStatus.connection.error}</small>}
            </div>
            <button type="button" onClick={() => void refreshRuntimeStatus()} disabled={runtimeChecking} title={t('llm:runtime.refreshTitle')}>
              <RefreshCw size={13} className={runtimeChecking ? styles.spinning : undefined} />
            </button>
          </div>
        )}
        {providers.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('llm:provider.configuredTitle')}</h3>
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
                        <span className={styles.providerBadge}>{t('llm:provider.defaultBadge')}</span>
                      )}
                    </div>
                    <div className={styles.providerModel}>
                      {provider.authType === 'vertex-ai' ? t('llm:provider.typeVertex') : t('llm:provider.typeOpenai')}
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
                        {t('llm:provider.setAsDefault')}
                      </button>
                    )}
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnGhost} ${styles.btnCompact}`}
                      onClick={() => handleEdit(provider)}
                    >
                      {t('llm:provider.edit')}
                    </button>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnGhost} ${styles.btnCompact} ${styles.btnDanger}`}
                      onClick={() => handleDelete(provider.id)}
                    >
                      {t('common:action.delete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{editingId ? t('llm:provider.editTitle') : t('llm:provider.addTitle')}</h3>
          <div className={styles.formGroup}>
            <label>{t('llm:provider.typeLabel')}</label>
            <Select
              className={`${styles.configInput} ${styles.selectInput}`}
              value={providerType}
              getPortalContainer={getModalPortalContainer}
              onChange={(value) => {
                setProviderType(value as ProviderType)
                setTestStatus({ state: 'idle', message: '' })
              }}
              options={[
                { value: 'openai-compatible', label: t('llm:provider.typeOptionOpenai') },
                { value: 'vertex-ai', label: t('llm:provider.typeOptionVertex') },
              ]}
            />
          </div>
        </section>

        {providerType === 'openai-compatible' && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('llm:openai.sectionTitle')}</h3>
            <div className={styles.formGroup}>
              <label>{t('llm:openai.nameLabel')}</label>
              <input
                className={styles.configInput}
                placeholder={t('llm:openai.namePlaceholder')}
                value={openaiName}
                onChange={(event) => setOpenaiName(event.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label>{t('llm:openai.baseUrlLabel')}</label>
              <input
                className={styles.configInput}
                placeholder={t('llm:openai.baseUrlPlaceholder')}
                value={openaiBaseURL}
                onChange={(event) => setOpenaiBaseURL(event.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label>{t('llm:openai.apiKeyLabel')}</label>
              <input
                type="password"
                className={styles.configInput}
                placeholder={t('llm:openai.apiKeyPlaceholder')}
                value={openaiApiKey}
                onChange={(event) => setOpenaiApiKey(event.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label>{t('llm:openai.modelLabel')}</label>
              <input
                className={styles.configInput}
                placeholder={t('llm:openai.modelPlaceholder')}
                value={openaiModel}
                onChange={(event) => setOpenaiModel(event.target.value)}
              />
            </div>
          </section>
        )}

        {providerType === 'vertex-ai' && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('llm:vertex.sectionTitle')}</h3>
            <div className={styles.formGroup}>
              <label>{t('llm:vertex.nameLabel')}</label>
              <input
                className={styles.configInput}
                placeholder={t('llm:vertex.namePlaceholder')}
                value={vertexName}
                onChange={(event) => setVertexName(event.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label>{t('llm:vertex.projectIdLabel')}</label>
              <input
                className={styles.configInput}
                placeholder={t('llm:vertex.projectIdPlaceholder')}
                value={vertexProjectId}
                onChange={(event) => setVertexProjectId(event.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label>{t('llm:vertex.regionLabel')}</label>
              <Select
                className={`${styles.configInput} ${styles.selectInput}`}
                value={vertexRegion}
                getPortalContainer={getModalPortalContainer}
                onChange={setVertexRegion}
                options={VERTEX_REGIONS.map((region) => ({ value: region, label: region }))}
              />
            </div>
            <div className={styles.formGroup}>
              <label>{t('llm:vertex.authModeLabel')}</label>
              <Select
                className={`${styles.configInput} ${styles.selectInput}`}
                value={vertexAuthMode}
                getPortalContainer={getModalPortalContainer}
                onChange={(value) =>
                  setVertexAuthMode(value as 'service-account' | 'adc' | 'json-paste')
                }
                options={[
                  { value: 'service-account', label: t('llm:vertex.authModeServiceAccount') },
                  { value: 'json-paste', label: t('llm:vertex.authModeJsonPaste') },
                  { value: 'adc', label: t('llm:vertex.authModeAdc') },
                ]}
              />
            </div>

            {vertexAuthMode === 'service-account' && (
              <>
                <div className={styles.formGroup}>
                  <label>{t('llm:vertex.clientEmailLabel')}</label>
                  <input
                    className={styles.configInput}
                    placeholder={t('llm:vertex.clientEmailPlaceholder')}
                    value={vertexClientEmail}
                    onChange={(event) => setVertexClientEmail(event.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('llm:vertex.privateKeyLabel')}</label>
                  <textarea
                    className={`${styles.configInput} ${styles.textareaInput}`}
                    placeholder={t('llm:vertex.privateKeyPlaceholder')}
                    value={vertexPrivateKey}
                    onChange={(event) => setVertexPrivateKey(event.target.value)}
                  />
                  <div className={styles.inlineHintRow}>
                    <div className={styles.inlineHint}>
                      {t('llm:vertex.privateKeyHint')}
                    </div>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnGhost} ${styles.btnCompact}`}
                      onClick={() => setVertexPrivateKey(vertexPrivateKey.replace(/\\n/g, '\n'))}
                    >
                      {t('llm:vertex.formatKey')}
                    </button>
                  </div>
                </div>
              </>
            )}

            {vertexAuthMode === 'json-paste' && (
              <div className={styles.formGroup}>
                <label>{t('llm:vertex.saJsonLabel')}</label>
                <textarea
                  className={`${styles.configInput} ${styles.textareaInput}`}
                  placeholder={t('llm:vertex.saJsonPlaceholder')}
                  value={vertexSaJSON}
                  onChange={(event) => setVertexSaJSON(event.target.value)}
                />
              </div>
            )}

            {vertexAuthMode === 'adc' && (
              <div className={styles.notice}>
                {t('llm:vertex.adcNotice')}
              </div>
            )}

            <div className={styles.formGroup}>
              <label>{t('llm:vertex.proxyLabel')}</label>
              <input
                className={styles.configInput}
                placeholder={t('llm:vertex.proxyPlaceholder')}
                value={vertexProxy}
                onChange={(event) => setVertexProxy(event.target.value)}
              />
              <div className={styles.inlineHint}>{t('llm:vertex.proxyHint')}</div>
            </div>
            <div className={styles.formGroup}>
              <label>{t('llm:vertex.modelLabel')}</label>
              <Select
                className={`${styles.configInput} ${styles.selectInput}`}
                value={vertexModel}
                getPortalContainer={getModalPortalContainer}
                onChange={setVertexModel}
                options={[
                  { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
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
            {t('llm:test.button')}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? t('llm:save.saving') : editingId ? t('llm:save.update') : t('llm:save.save')}
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
