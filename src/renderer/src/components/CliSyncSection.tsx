import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import type { ProviderSettings } from '@janusx/llm-core'
import type { ExternalCliSyncState, TerminalModelState } from '../../../shared/ipc/external-cli'
import { EXTERNAL_CLI_TOOL_META, EXTERNAL_CLI_TOOL_ORDER, type ExternalCliToolId } from '../../../shared/ipc/external-cli'
import { EXTERNAL_CLI_TOOL_ICONS } from '@/lib/cli-tool-icons'
import { externalCliService } from '@/services/external-cli'
import {
  getTerminalDefault,
  getTerminalProviders,
  removeTerminalProvider,
  saveTerminalProvider,
  setTerminalDefault,
  testConnection,
  type LlmTerminalConsumer,
} from '@/services/llm'
import { Select } from './ui/Select'
import styles from './LlmConfigModal.module.css'

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

type ProviderType = 'openai-compatible' | 'anthropic' | 'vertex-ai'

const DEFAULT_TYPE_PER_TERMINAL: Record<ExternalCliToolId, ProviderType> = {
  janus: 'openai-compatible',
  claude: 'anthropic',
  codex: 'openai-compatible',
  opencode: 'openai-compatible',
  pi: 'openai-compatible',
}

/** 精简版各终端拥有的 model 键；janus 为内部直连，claude 走凭证三元组。 */
const TERMINAL_FILE_META: Record<ExternalCliToolId, { format: string; ownedKey: string } | null> = {
  janus: null,
  claude: null,
  codex: { format: 'TOML', ownedKey: 'model' },
  opencode: { format: 'JSON / JSONC', ownedKey: 'model' },
  pi: { format: 'JSON', ownedKey: 'defaultModel' },
}

function formatSyncTime(syncedAt: number): string {
  try {
    return new Date(syncedAt).toLocaleString()
  } catch {
    return String(syncedAt)
  }
}

function notifyJanusLlmConfigChanged(preferDefault: boolean, updatedProviderId?: string): void {
  window.dispatchEvent(new CustomEvent('janus:llm-config-changed', {
    detail: { preferDefault, updatedProviderId },
  }))
}

function defaultModelOf(provider: ProviderSettings): string {
  return provider.defaultModelId || provider.modelId || provider.models?.find(Boolean) || ''
}

export function CliSyncSection() {
  const { t } = useI18n('llm')
  const [activeTab, setActiveTab] = useState<ExternalCliToolId>('janus')
  const [iconFailed, setIconFailed] = useState<Partial<Record<ExternalCliToolId, boolean>>>({})

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t('llm:terminals.sectionTitle')}</h3>
      <div className={styles.terminalTabs} role="tablist">
        {EXTERNAL_CLI_TOOL_ORDER.map((toolId) => {
          const meta = EXTERNAL_CLI_TOOL_META[toolId]
          const active = toolId === activeTab
          return (
            <button
              key={toolId}
              type="button"
              role="tab"
              aria-selected={active}
              className={`${styles.terminalTab} ${active ? styles.terminalTabActive : ''}`}
              onClick={() => setActiveTab(toolId)}
            >
              {iconFailed[toolId]
                ? <span className={styles.terminalTabMonogram}>{meta.monogram}</span>
                : (
                  <img
                    className={styles.terminalTabIcon}
                    src={EXTERNAL_CLI_TOOL_ICONS[toolId]}
                    alt=""
                    aria-hidden
                    onError={() => setIconFailed((current) => ({ ...current, [toolId]: true }))}
                  />
                )}
              {meta.displayName}
              {toolId === 'janus' && <span className={styles.providerBadge}>{t('llm:terminals.janusBadge')}</span>}
            </button>
          )
        })}
      </div>

      <TerminalProviderPanel key={activeTab} terminal={activeTab} />
    </section>
  )
}

function TerminalProviderPanel({ terminal }: { terminal: ExternalCliToolId }) {
  const { t } = useI18n('llm')
  const consumer = terminal as LlmTerminalConsumer
  const [providerType, setProviderType] = useState<ProviderType>(DEFAULT_TYPE_PER_TERMINAL[terminal])
  const [providers, setProviders] = useState<ProviderSettings[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(null)

  const [openaiName, setOpenaiName] = useState('')
  const [openaiBaseURL, setOpenaiBaseURL] = useState('https://api.openai.com/v1')
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [openaiModel, setOpenaiModel] = useState('gpt-4o')

  const [anthropicName, setAnthropicName] = useState('')
  const [anthropicBaseURL, setAnthropicBaseURL] = useState('https://api.anthropic.com')
  const [anthropicApiKey, setAnthropicApiKey] = useState('')
  const [anthropicModel, setAnthropicModel] = useState('claude-sonnet-4-20250514')

  const [vertexName, setVertexName] = useState('Vertex AI')
  const [vertexProjectId, setVertexProjectId] = useState('')
  const [vertexRegion, setVertexRegion] = useState('us-central1')
  const [vertexAuthMode, setVertexAuthMode] = useState<'service-account' | 'adc' | 'json-paste'>(
    'service-account',
  )
  const [vertexClientEmail, setVertexClientEmail] = useState('')
  const [vertexPrivateKey, setVertexPrivateKey] = useState('')
  const [vertexSaJSON, setVertexSaJSON] = useState('')
  const [vertexModels, setVertexModels] = useState<string[]>([''])
  const [vertexDefaultModel, setVertexDefaultModel] = useState('')
  const [vertexProxy, setVertexProxy] = useState('')

  const [testStatus, setTestStatus] = useState<{
    state: 'idle' | 'testing' | 'success' | 'error'
    message: string
    latency?: number
  }>({ state: 'idle', message: '' })

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [syncState, setSyncState] = useState<ExternalCliSyncState>({ claude: null })
  const [live, setLive] = useState<TerminalModelState | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [usingId, setUsingId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const isJanus = terminal === 'janus'
  const isClaude = terminal === 'claude'
  const fileMeta = TERMINAL_FILE_META[terminal]

  const resetForm = useCallback(() => {
    setEditingId(null)
    setProviderType(DEFAULT_TYPE_PER_TERMINAL[terminal])
    setOpenaiName('')
    setOpenaiBaseURL('https://api.openai.com/v1')
    setOpenaiApiKey('')
    setOpenaiModel('gpt-4o')
    setAnthropicName('')
    setAnthropicBaseURL('https://api.anthropic.com')
    setAnthropicApiKey('')
    setAnthropicModel('claude-sonnet-4-20250514')
    setVertexName('Vertex AI')
    setVertexProjectId('')
    setVertexRegion('us-central1')
    setVertexAuthMode('service-account')
    setVertexClientEmail('')
    setVertexPrivateKey('')
    setVertexSaJSON('')
    setVertexModels([''])
    setVertexDefaultModel('')
    setVertexProxy('')
    setTestStatus({ state: 'idle', message: '' })
    setSaveStatus('idle')
  }, [terminal])

  const loadProviders = useCallback(async () => {
    try {
      const [list, defaultEntry] = await Promise.all([
        getTerminalProviders(consumer),
        getTerminalDefault(consumer),
      ])
      setProviders(list)
      setDefaultProviderId(defaultEntry?.provider.id || null)
    } catch (loadError) {
      console.error('Failed to load terminal providers:', loadError)
    }
  }, [consumer])

  const refreshSyncState = useCallback(async () => {
    if (!isClaude) return
    try {
      setSyncState(await externalCliService.syncState())
    } catch (syncError: unknown) {
      setError(syncError instanceof Error ? syncError.message : String(syncError))
    }
  }, [isClaude])

  const refreshLive = useCallback(async () => {
    if (!fileMeta) return
    setLiveLoading(true)
    try {
      setLive(await externalCliService.readTerminalModel(terminal))
    } catch (liveError: unknown) {
      setLive({
        toolId: terminal,
        configPath: null,
        exists: false,
        error: liveError instanceof Error ? liveError.message : String(liveError),
      })
    } finally {
      setLiveLoading(false)
    }
  }, [fileMeta, terminal])

  useEffect(() => {
    void loadProviders()
    void refreshSyncState()
    void refreshLive()
  }, [loadProviders, refreshSyncState, refreshLive])

  const notifyIfJanus = useCallback((preferDefault: boolean, updatedProviderId?: string) => {
    if (isJanus) notifyJanusLlmConfigChanged(preferDefault, updatedProviderId)
  }, [isJanus])

  /** ccswitch 式一键“使用”：设为默认 + 写 live 配置文件（备份+重读校验），一行搞定。 */
  const handleUseProvider = useCallback(async (provider: ProviderSettings) => {
    const model = defaultModelOf(provider)
    if (!isJanus && !isClaude && !model) {
      setError(t('llm:terminals.modelRequired'))
      return
    }
    setUsingId(provider.id)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await setTerminalDefault(consumer, provider.id)
      setDefaultProviderId(provider.id)
      notifyIfJanus(true, provider.id)
      if (isJanus) {
        setNotice(t('llm:terminals.switched', { name: provider.name }))
        return
      }
      if (isClaude) {
        const result = await externalCliService.applyProvider({ toolId: 'claude', providerId: provider.id })
        if (!result.success) {
          setError(result.error === 'NO_LLM_PROVIDER' ? t('llm:cli.error.noProvider') : (result.error ?? ''))
          return
        }
        setNotice(t('llm:cli.notice.synced', { name: result.providerName ?? provider.name }))
        await refreshSyncState()
        return
      }
      const result = await externalCliService.applyTerminalModel({ toolId: terminal, model })
      if (!result.success) {
        setError(result.error ?? '')
        return
      }
      setNotice(t('llm:terminals.switched', { name: provider.name }))
      await refreshLive()
    } catch (useError: unknown) {
      setError(useError instanceof Error ? useError.message : String(useError))
    } finally {
      setUsingId(null)
      setBusy(false)
    }
  }, [consumer, isJanus, isClaude, notifyIfJanus, refreshLive, refreshSyncState, terminal, t])

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
      const models = provider.models?.length ? provider.models : provider.modelId ? [provider.modelId] : ['']
      setVertexModels(models)
      setVertexDefaultModel(provider.defaultModelId || provider.modelId || models.find(Boolean) || '')
      setVertexProxy(provider.vertexAI?.proxy || '')
    } else if (provider.authType === 'anthropic') {
      setProviderType('anthropic')
      setAnthropicName(provider.name)
      setAnthropicBaseURL(provider.baseURL || 'https://api.anthropic.com')
      setAnthropicApiKey(provider.apiKey || '')
      setAnthropicModel(provider.modelId || 'claude-sonnet-4-20250514')
    } else {
      setProviderType('openai-compatible')
      setOpenaiName(provider.name)
      setOpenaiBaseURL(provider.baseURL || 'https://api.openai.com/v1')
      setOpenaiApiKey(provider.apiKey || '')
      setOpenaiModel(provider.modelId || 'gpt-4o')
    }
  }

  const handleDelete = async (id: string) => {
    await removeTerminalProvider(consumer, id)
    notifyIfJanus(defaultProviderId === id, id)
    await loadProviders()
    if (editingId === id) resetForm()
  }

  const buildSettings = (): ProviderSettings => {
    if (providerType === 'anthropic') {
      return {
        id: editingId || `anthropic-${Date.now()}`,
        name: anthropicName || 'Anthropic',
        authType: 'anthropic' as any,
        baseURL: anthropicBaseURL,
        apiKey: anthropicApiKey,
        modelId: anthropicModel,
        enabled: true,
      }
    }
    if (providerType === 'vertex-ai') {
      const models = vertexModels.map((model) => model.trim()).filter(Boolean)
      const defaultModelId = models.includes(vertexDefaultModel.trim())
        ? vertexDefaultModel.trim()
        : models[0] || ''
      return {
        id: editingId || `vertex-ai-${Date.now()}`,
        name: vertexName || 'Vertex AI',
        authType: 'vertex-ai' as any,
        modelId: defaultModelId,
        models,
        defaultModelId,
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
          ? vertexDefaultModel || vertexModels.find(Boolean) || ''
          : providerType === 'anthropic'
            ? anthropicModel || 'claude-sonnet-4-20250514'
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
      if (providerType === 'vertex-ai' && !vertexModels.some((model) => model.trim())) {
        setSaveStatus('error')
        setTestStatus({ state: 'error', message: t('llm:vertex.modelRequired') })
        return
      }
      const result = await saveTerminalProvider(consumer, settings)

      if (result.success) {
        setSaveStatus('success')
        await loadProviders()
        notifyIfJanus(defaultProviderId === null || defaultProviderId === settings.id, settings.id)
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

  const handleRollbackClaude = useCallback(async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await externalCliService.rollbackProfile()
      if (!result.success) {
        setError(result.error ?? '')
        return
      }
      setNotice(t('llm:cli.notice.rolledBack'))
      await refreshSyncState()
    } catch (rollbackError: unknown) {
      setError(rollbackError instanceof Error ? rollbackError.message : String(rollbackError))
    } finally {
      setBusy(false)
    }
  }, [refreshSyncState, t])

  const handleRollbackModel = useCallback(async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await externalCliService.rollbackTerminal(terminal)
      if (!result.success) {
        setError(result.error ?? '')
        return
      }
      setNotice(t('llm:terminals.modelRolledBack'))
      await refreshLive()
    } catch (rollbackError: unknown) {
      setError(rollbackError instanceof Error ? rollbackError.message : String(rollbackError))
    } finally {
      setBusy(false)
    }
  }, [refreshLive, terminal, t])

  const claude = syncState.claude
  const sourceAlive = claude ? providers.some((provider) => provider.id === claude.providerId) : false

  return (
    <>
      {providers.length > 0 ? (
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
                  {provider.authType === 'vertex-ai'
                    ? t('llm:provider.typeVertex')
                    : provider.authType === 'anthropic'
                      ? t('llm:provider.typeAnthropic')
                      : t('llm:provider.typeOpenai')}
                  {provider.authType === 'vertex-ai'
                    ? ` / ${(provider.models?.length ? provider.models : [provider.modelId]).filter(Boolean).join(', ')}`
                    : provider.modelId ? ` / ${provider.modelId}` : ''}
                </div>
              </div>
              <div className={styles.providerActions}>
                {defaultProviderId === provider.id ? (
                  <span className={styles.providerBadge}>{t('llm:provider.inUse')}</span>
                ) : (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGhost} ${styles.btnCompact} ${styles.btnAccent}`}
                    disabled={busy && usingId === provider.id}
                    onClick={() => void handleUseProvider(provider)}
                  >
                    {usingId === provider.id ? t('llm:provider.using') : t('llm:provider.use')}
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
      ) : (
        <div className={styles.inlineHint}>{t('llm:terminals.emptyHint')}</div>
      )}

      <div className={styles.formGroup}>
        <label>{t('llm:provider.typeLabel')}</label>
        <Select
          className={`${styles.configInput} ${styles.selectInput}`}
          value={providerType}
          onChange={(value) => {
            setProviderType(value as ProviderType)
            setTestStatus({ state: 'idle', message: '' })
          }}
          options={[
            { value: 'openai-compatible', label: t('llm:provider.typeOptionOpenai') },
            { value: 'anthropic', label: t('llm:provider.typeOptionAnthropic') },
            { value: 'vertex-ai', label: t('llm:provider.typeOptionVertex') },
          ]}
        />
      </div>

      {providerType === 'openai-compatible' && (
        <>
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
        </>
      )}

      {providerType === 'anthropic' && (
        <>
          <div className={styles.formGroup}>
            <label>{t('llm:anthropic.nameLabel')}</label>
            <input
              className={styles.configInput}
              placeholder={t('llm:anthropic.namePlaceholder')}
              value={anthropicName}
              onChange={(event) => setAnthropicName(event.target.value)}
            />
          </div>
          <div className={styles.formGroup}>
            <label>{t('llm:anthropic.baseUrlLabel')}</label>
            <input
              className={styles.configInput}
              placeholder={t('llm:anthropic.baseUrlPlaceholder')}
              value={anthropicBaseURL}
              onChange={(event) => setAnthropicBaseURL(event.target.value)}
            />
          </div>
          <div className={styles.formGroup}>
            <label>{t('llm:anthropic.apiKeyLabel')}</label>
            <input
              type="password"
              className={styles.configInput}
              placeholder={t('llm:anthropic.apiKeyPlaceholder')}
              value={anthropicApiKey}
              onChange={(event) => setAnthropicApiKey(event.target.value)}
            />
          </div>
          <div className={styles.formGroup}>
            <label>{t('llm:anthropic.modelLabel')}</label>
            <input
              className={styles.configInput}
              placeholder={t('llm:anthropic.modelPlaceholder')}
              value={anthropicModel}
              onChange={(event) => setAnthropicModel(event.target.value)}
            />
          </div>
        </>
      )}

      {providerType === 'vertex-ai' && (
        <>
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
              onChange={setVertexRegion}
              options={VERTEX_REGIONS.map((region) => ({ value: region, label: region }))}
            />
          </div>
          <div className={styles.formGroup}>
            <label>{t('llm:vertex.authModeLabel')}</label>
            <Select
              className={`${styles.configInput} ${styles.selectInput}`}
              value={vertexAuthMode}
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
            {vertexModels.map((model, index) => (
              <div className={styles.inlineHintRow} key={`vertex-model-${index}`}>
                <input
                  className={styles.configInput}
                  value={model}
                  onChange={(event) => setVertexModels((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                  placeholder="vertex-model-id"
                />
                <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnCompact}`} onClick={() => {
                  setVertexModels((current) => {
                    const next = current.length === 1 ? [''] : current.filter((_, itemIndex) => itemIndex !== index)
                    if (!next.some((item) => item.trim() === vertexDefaultModel.trim())) {
                      setVertexDefaultModel(next.find((item) => item.trim())?.trim() || '')
                    }
                    return next
                  })
                }} title={t('llm:vertex.removeModel')}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnCompact}`} onClick={() => setVertexModels((current) => [...current, ''])}>
              <Plus size={14} /> {t('llm:vertex.addModel')}
            </button>
            <label>{t('llm:vertex.defaultModelLabel')}</label>
            <Select
              className={`${styles.configInput} ${styles.selectInput}`}
              value={vertexDefaultModel}
              onChange={setVertexDefaultModel}
              options={vertexModels.filter((model) => model.trim()).map((model) => ({ value: model.trim(), label: model.trim() }))}
            />
            <div className={styles.inlineHint}>{t('llm:vertex.modelHint')}</div>
          </div>
        </>
      )}

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

      {isJanus && (
        <div className={styles.inlineHint}>{t('llm:terminals.internalNote')}</div>
      )}

      {isClaude && (
        <>
          <div className={styles.providerModel}>
            {claude
              ? t('llm:cli.claude.synced', { name: claude.providerName, time: formatSyncTime(claude.syncedAt) })
              : t('llm:cli.claude.notSynced')}
            {claude && !sourceAlive && ` · ${t('llm:cli.claude.sourceGone')}`}
          </div>
          {claude && (
            <div className={styles.footerActions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost} ${styles.btnCompact}`}
                disabled={busy || !claude}
                onClick={() => void handleRollbackClaude()}
              >
                {t('llm:cli.claude.rollback')}
              </button>
            </div>
          )}
          <div className={styles.inlineHint}>{t('llm:cli.hint')}</div>
        </>
      )}

      {fileMeta && (
        <div className={styles.terminalFile}>
          <div className={styles.providerModel}>
            {liveLoading
              ? t('llm:test.testing')
              : live?.error
                ? live.error
                : live?.model
                  ? t('llm:terminals.activeModel', { model: live.model })
                  : t('llm:terminals.activeMissing')}
          </div>
          <div className={styles.footerActions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost} ${styles.btnCompact}`}
              disabled={busy}
              onClick={() => void handleRollbackModel()}
            >
              {t('llm:cli.claude.rollback')}
            </button>
          </div>
        </div>
      )}

      {notice && <div className={styles.inlineHint}>{notice}</div>}
      {error && <div className={styles.notice}>{error}</div>}
      <div className={styles.inlineHint}>{t('llm:terminals.liveHint')}</div>
    </>
  )
}
