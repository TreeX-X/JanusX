import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import type { ProviderSettings } from '@janusx/llm-core'
import { useI18n } from '@/i18n/useI18n'
import { EXTERNAL_CLI_TOOL_META } from '../../../shared/ipc/external-cli'
import { LLM_CONSUMERS, authTypeForProtocol, channelModel, channelModels, channelProtocol, supportsChannel, type AgentModelBinding, type ChannelProtocol, type LlmConfiguration, type LlmConsumer } from '../../../shared/llm-configuration'
import { EXTERNAL_CLI_TOOL_ICONS } from '@/lib/cli-tool-icons'
import { Select } from './ui/Select'
import styles from './LlmConfiguration.module.css'

const PRESETS: Array<{ id: string; name: string; url: string; protocol: ChannelProtocol; official?: boolean }> = [
  { id: 'custom', name: 'Custom API', url: '', protocol: 'openai' },
  { id: 'openai', name: 'OpenAI', url: 'https://api.openai.com/v1', protocol: 'responses', official: true },
  { id: 'openai-chat', name: 'OpenAI · Chat Completions', url: 'https://api.openai.com/v1', protocol: 'openai', official: true },
  { id: 'anthropic', name: 'Anthropic', url: 'https://api.anthropic.com', protocol: 'anthropic', official: true },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://api.deepseek.com/v1', protocol: 'openai', official: true },
  { id: 'qwen', name: 'Qwen', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', protocol: 'openai', official: true },
  { id: 'moonshot', name: 'Moonshot', url: 'https://api.moonshot.cn/v1', protocol: 'openai', official: true },
  { id: 'cpa', name: 'CPA', url: 'http://127.0.0.1:8317/v1', protocol: 'openai' },
  { id: 'vertex', name: 'Vertex AI', url: '', protocol: 'vertex', official: true },
]
const PROTOCOL_NAMES: Record<ChannelProtocol, string> = { openai: 'OpenAI Chat Completions', responses: 'OpenAI Responses', anthropic: 'Anthropic Messages', vertex: 'Vertex AI' }
function official(provider: ProviderSettings): boolean {
  const preset = PRESETS.find(item => item.id === provider.extra?.presetId)
  return !!preset?.official && preset.url === (provider.baseURL || '') && preset.protocol === channelProtocol(provider)
}
function notify(providerId?: string, preferDefault = false) {
  window.dispatchEvent(new CustomEvent('janus:llm-config-changed', { detail: { updatedProviderId: providerId, preferDefault } }))
}

export function CliSyncSection() {
  const { t } = useI18n('llm')
  const c = (key: string, values?: Record<string, unknown>) => t('llm:configuration.' + key, values)
  const [config, setConfig] = useState<LlmConfiguration | null>(null)
  const [view, setView] = useState<'agents' | 'channels'>('agents')
  const [active, setActive] = useState<LlmConsumer>('janus')
  const [drafts, setDrafts] = useState<Partial<Record<LlmConsumer, AgentModelBinding>>>({})
  const [editing, setEditing] = useState<ProviderSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const load = useCallback(async () => { setConfig(await window.electron.llm.getConfiguration()) }, [])
  useEffect(() => { void load().catch(err => setError(String(err))) }, [load])
  const act = async (operation: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('')
    try { await operation() } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
  }
  if (!config) return <section className={styles.root} aria-busy={!error}>
    {error ? <><p role="alert">{error}</p><button className={styles.button} onClick={() => void act(load)}>{c('retry')}</button></> : <p>{c('loading')}</p>}
  </section>
  const providers = Object.values(config.providers)
  const selected = drafts[active] || config.bindings[active]
  const selectedProvider = selected.providerId ? config.providers[selected.providerId] : undefined
  const usersOf = (id: string) => LLM_CONSUMERS.filter(consumer => config.bindings[consumer].providerId === id)
  const changeBinding = (binding: AgentModelBinding) => setDrafts(previous => ({ ...previous, [active]: binding }))
  const summary = (binding: AgentModelBinding) => {
    const provider = binding.providerId ? config.providers[binding.providerId] : undefined
    return binding.mode === 'provider' && provider
      ? (binding.modelId || channelModel(provider) || c('chooseModel')) + ' · ' + provider.name
      : binding.mode === 'native' ? c('native') : c('notConfigured')
  }
  return <section className={styles.root}>
    <div className={styles.intro}><h3>{c('title')}</h3><p>{c('description')}</p></div>
    <div className={styles.navigation} role="tablist" aria-label={c('title')}>
      {(['agents', 'channels'] as const).map(tab => <button key={tab} type="button" role="tab" aria-selected={view === tab} disabled={busy} onClick={() => { setView(tab); setError(''); setNotice('') }}>{c(tab)}<span>{tab === 'agents' ? 5 : providers.length}</span></button>)}
    </div>
    {error && <div className={styles.error} role="alert">{error}</div>}
    {notice && <div className={styles.notice} role="status"><Check size={14} />{notice}</div>}
    <div className={styles.agentPage} role="tabpanel" hidden={view !== 'agents'} aria-label={c('agents')}>
      <div className={styles.agentList}>
        {LLM_CONSUMERS.map(consumer => <button type="button" key={consumer} disabled={busy} className={styles.agentRow} aria-pressed={consumer === active} onClick={() => { setActive(consumer); setError(''); setNotice('') }}>
          <img src={EXTERNAL_CLI_TOOL_ICONS[consumer]} alt="" />
          <span className={styles.agentName}>{EXTERNAL_CLI_TOOL_META[consumer].displayName}</span>
          <span className={styles.summary} title={summary(config.bindings[consumer])}>{summary(config.bindings[consumer])}</span>
          {config.bindings[consumer].needsApply && <span className={styles.pending}>{c('pending')}</span>}
          <ChevronRight size={14} />
        </button>)}
      </div>
      <div className={styles.bindingPanel}>
        <div className={styles.panelHeading}><h4>{EXTERNAL_CLI_TOOL_META[active].displayName}</h4><span>{c(active === 'janus' ? 'internal' : 'external')}</span></div>
        <div className={styles.fields}>
          <label className={styles.field}><span>{c('source')}</span>
            <Select ariaLabel={c('source')} value={selected.mode === 'provider' ? selected.providerId || '' : selected.mode} disabled={busy}
              options={[
                { value: active === 'janus' ? 'unconfigured' : 'native', label: c(active === 'janus' ? 'notConfigured' : 'native') },
                ...providers.map(provider => ({ value: provider.id, disabled: !supportsChannel(active, provider),
                  label: provider.name + (supportsChannel(active, provider) ? '' : ' · ' + c('incompatible')) })),
              ]}
              onChange={value => {
                const provider = config.providers[value]
                changeBinding(provider ? { mode: 'provider', providerId: value, modelId: channelModel(provider) } : { mode: active === 'janus' ? 'unconfigured' : 'native' })
              }} />
          </label>
          {selected.mode === 'provider' && <label className={styles.field}><span>{c('model')}</span>
            <input aria-label={c('model')} list={'llm-models-' + active} value={selected.modelId || ''} disabled={busy}
              placeholder={c('modelPlaceholder')} onChange={event => changeBinding({ ...selected, modelId: event.target.value })} />
            <datalist id={'llm-models-' + active}>{selectedProvider && channelModels(selectedProvider).map(model => <option key={model} value={model}>{model + ' · ' + selectedProvider.name}</option>)}</datalist>
          </label>}
        </div>
        <p className={styles.hint}>{selected.mode === 'native' ? c('nativeHint') : c('compatibility', { protocol: active === 'codex' ? 'Responses API' : active === 'claude' ? 'Anthropic Messages' : active === 'janus' ? 'Chat Completions / Responses / Anthropic / Vertex AI' : 'Chat Completions / Responses / Anthropic' })}</p>
        {!providers.length && <button type="button" className={styles.link} onClick={() => setView('channels')}>{c('addFirst')}<ChevronRight size={13} /></button>}
        <div className={styles.footer}><span>{active === 'janus' ? c('internalHint') : c('restartHint')}</span>
          <button type="button" className={styles.primary} disabled={busy || (selected.mode === 'provider' && (!selected.modelId?.trim() || !selectedProvider || !supportsChannel(active, selectedProvider)))} onClick={() => void act(async () => {
            const result = await window.electron.llm.applyBinding(active, selected)
            if (!result.success) throw new Error(result.error || c('applyFailed'))
            await load()
            setDrafts(previous => { const next = { ...previous }; delete next[active]; return next })
            notify(selected.providerId, active === 'janus')
            setNotice(c(active === 'janus' ? 'appliedInternal' : 'applied'))
          })}>{busy ? c('working') : c('apply')}</button>
        </div>
      </div>
      <p className={styles.footnote}>{c('scope')}</p>
    </div><div role="tabpanel" hidden={view !== 'channels'} aria-label={c('channels')}>
      {editing ? <ChannelEditor key={editing.id} initial={editing} busy={busy} setBusy={setBusy}
        onCancel={() => { setEditing(null); setError('') }}
        onSaved={async provider => { await load(); setEditing(null); notify(provider.id); setNotice(c('saved')) }} />
        : <>
          <div className={styles.toolbar}><input aria-label={c('search')} placeholder={c('search')} value={query} onChange={event => setQuery(event.target.value)} />
            <button type="button" className={styles.primary} disabled={busy} onClick={() => { setNotice(''); setError(''); setEditing({ id: crypto.randomUUID(), name: '', authType: authTypeForProtocol('openai'), baseURL: '', models: [], extra: { presetId: 'custom', protocol: 'openai' } }) }}><Plus size={14} />{c('addChannel')}</button>
          </div>
          {!providers.length && <div className={styles.empty}><h4>{c('emptyTitle')}</h4><p>{c('emptyDescription')}</p></div>}
          <div className={styles.channelList}>
            {providers.filter(provider => (provider.name + ' ' + channelModels(provider).join(' ')).toLowerCase().includes(query.toLowerCase())).map(provider => {
              const users = usersOf(provider.id)
              return <div key={provider.id} className={styles.channelRow}>
                <div className={styles.channelInfo}><div className={styles.channelTitle}><strong>{provider.name}</strong>{official(provider) && <span className={styles.badge}>{c('official')}</span>}{provider.enabled === false && <span className={styles.pending}>{c('disabled')}</span>}</div>
                  <span>{PROTOCOL_NAMES[channelProtocol(provider)]} · {c('modelCount', { count: channelModels(provider).length })}</span>
                  <small title={provider.baseURL}>{provider.baseURL || provider.vertexAI?.projectId}</small>
                  {users.length > 0 && <small>{c('usedBy', { agents: users.map(consumer => EXTERNAL_CLI_TOOL_META[consumer].displayName).join(' · ') })}</small>}
                </div>
                <div className={styles.rowActions}><button type="button" className={styles.button} disabled={busy} onClick={() => { setEditing(provider); setNotice(''); setError('') }}>{c('edit')}</button>
                  <button type="button" className={styles.iconButton} aria-label={c('deleteChannel', { name: provider.name })} disabled={busy || users.length > 0} title={users.length ? c('inUseHint') : c('delete')} onClick={() => setDeleting(provider.id)}><Trash2 size={14} /></button>
                </div>
                {deleting === provider.id && <div className={styles.deleteConfirm}><span>{c('confirmDelete', { name: provider.name })}</span><button className={styles.button} disabled={busy} onClick={() => setDeleting(null)}>{c('cancel')}</button><button className={styles.button} disabled={busy} onClick={() => void act(async () => {
                  const result = await window.electron.llm.removeTerminalProvider('janus', provider.id)
                  if (!result.success) throw new Error(result.error || c('deleteFailed'))
                  await load(); setDeleting(null); notify(provider.id)
                })}>{c('delete')}</button></div>}
              </div>
            })}
          </div>
          <p className={styles.footnote}>{c('channelHint')}</p>
        </>}
    </div>
  </section>
}

function ChannelEditor({ initial, busy, setBusy, onCancel, onSaved }: {
  initial: ProviderSettings; busy: boolean; setBusy: (value: boolean) => void
  onCancel: () => void; onSaved: (provider: ProviderSettings) => Promise<void>
}) {
  const { t } = useI18n('llm')
  const c = (key: string) => t('llm:configuration.' + key)
  const [draft, setDraft] = useState<ProviderSettings>(structuredClone(initial))
  const [models, setModels] = useState(channelModels(initial).join('\n'))
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const protocol = channelProtocol(draft)
  const modelIds = [...new Set(models.split(/[\n,]/).map(model => model.trim()).filter(Boolean))]
  const update = (patch: Partial<ProviderSettings>) => { setDraft(previous => ({ ...previous, ...patch })); setError(''); setResult('') }
  const vertex = (patch: Record<string, unknown>) => update({ vertexAI: { ...draft.vertexAI, ...patch } as ProviderSettings['vertexAI'] })
  const saveOrTest = async (test: boolean) => {
    setBusy(true); setError(''); setResult('')
    const defaultModel = modelIds.includes(draft.defaultModelId || '') ? draft.defaultModelId! : modelIds[0] || ''
    const provider = { ...draft, name: draft.name.trim(), baseURL: draft.baseURL?.trim(), apiKey: draft.authType === 'none' ? undefined : draft.apiKey, models: modelIds, modelId: defaultModel, defaultModelId: defaultModel }
    try {
      if (!provider.name || !modelIds.length) throw new Error(c('required'))
      if (protocol !== 'vertex' && (!provider.baseURL || !/^https?:\/\//i.test(provider.baseURL))) throw new Error(c('endpointRequired'))
      if (protocol !== 'vertex' && provider.authType !== 'none' && !provider.apiKey?.trim()) throw new Error(c('keyRequired'))
      if (test) {
        const response = await window.electron.llm.testConnection({ ...provider, testModel: defaultModel })
        if (!response.success) throw new Error(response.error || c('testFailed'))
        setResult(t('llm:configuration.testSuccess', { latency: response.latency || 0 }))
      } else {
        const response = await window.electron.llm.saveProvider(provider)
        if (!response.success) throw new Error(response.error || c('saveFailed'))
        await onSaved(provider)
      }
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
  }
  return <form className={styles.editor} onSubmit={event => { event.preventDefault(); void saveOrTest(false) }}>
    <button type="button" className={styles.link} disabled={busy} onClick={onCancel}><ArrowLeft size={14} />{c('back')}</button>
    <div className={styles.panelHeading}><h4>{initial.name ? c('editChannel') : c('addChannel')}</h4></div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {result && <p className={styles.notice} role="status">{result}</p>}
    <div className={styles.fields}>
      <label className={styles.field}><span>{c('preset')}</span><Select ariaLabel={c('preset')} value={String(draft.extra?.presetId || 'custom')} disabled={busy}
        options={PRESETS.map(item => ({ value: item.id, label: item.id === 'custom' ? c('custom') : item.name + (item.official ? ' · ' + c('official') : '') }))}
        onChange={value => {
          const preset = PRESETS.find(item => item.id === value)!
          setDraft(previous => ({ ...previous, name: previous.name || (preset.id === 'custom' ? '' : preset.name), baseURL: preset.url,
            authType: preset.protocol === 'anthropic' ? authTypeForProtocol('anthropic') : preset.protocol === 'vertex' ? authTypeForProtocol('vertex') : authTypeForProtocol('openai'),
            extra: { ...previous.extra, presetId: value, protocol: preset.protocol } }))
          setError(''); setResult('')
        }} /></label>
      <label className={styles.field}><span>{c('name')}</span><input aria-label={c('name')} required maxLength={80} value={draft.name} disabled={busy} placeholder={c('namePlaceholder')} onChange={event => update({ name: event.target.value })} /></label>
      <label className={styles.field + ' ' + styles.full}><span>{c('protocol')}</span><Select ariaLabel={c('protocol')} disabled={busy} value={protocol} options={Object.entries(PROTOCOL_NAMES).map(([value, label]) => ({ value, label }))} onChange={value => update({
        authType: value === 'anthropic' ? authTypeForProtocol('anthropic') : value === 'vertex' ? authTypeForProtocol('vertex') : authTypeForProtocol('openai'),
        extra: { ...draft.extra, protocol: value },
      })} /></label>
      {protocol !== 'vertex' ? <>
        <label className={styles.field + ' ' + styles.full}><span>{c('endpoint')}</span><input aria-label={c('endpoint')} type="url" required disabled={busy} value={draft.baseURL || ''} placeholder="https://api.example.com/v1" onChange={event => update({ baseURL: event.target.value })} /></label>
        <label className={styles.field + ' ' + styles.full}><span>{c('apiKey')}</span><div className={styles.secret}><input aria-label={c('apiKey')} type={visible ? 'text' : 'password'} autoComplete="new-password" disabled={busy || draft.authType === 'none'} value={draft.apiKey || ''} placeholder="sk-…" onChange={event => update({ apiKey: event.target.value })} />
          <button type="button" className={styles.iconButton} aria-label={c(visible ? 'hideKey' : 'showKey')} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={14} /> : <Eye size={14} />}</button></div></label>
        {(protocol === 'openai' || protocol === 'responses') && <label className={styles.checkbox}><input type="checkbox" checked={draft.authType === 'none'} disabled={busy} onChange={event => update({ authType: authTypeForProtocol(protocol, event.target.checked) })} />{c('noAuth')}</label>}
      </> : <>
        <label className={styles.field}><span>{c('project')}</span><input aria-label={c('project')} disabled={busy} value={draft.vertexAI?.projectId || ''} onChange={event => vertex({ projectId: event.target.value })} /></label>
        <label className={styles.field}><span>{c('region')}</span><input aria-label={c('region')} disabled={busy} value={draft.vertexAI?.region || ''} placeholder="us-central1" onChange={event => vertex({ region: event.target.value })} /></label>
        <label className={styles.checkbox}><input type="checkbox" disabled={busy} checked={!!draft.vertexAI?.useADC} onChange={event => vertex({ useADC: event.target.checked })} />{c('adc')}</label>
        {!draft.vertexAI?.useADC && <label className={styles.field + ' ' + styles.full}><span>Service Account JSON</span><textarea aria-label="Service Account JSON" disabled={busy} rows={3} value={draft.vertexAI?.serviceAccountJSON || ''} onChange={event => vertex({ serviceAccountJSON: event.target.value })} /></label>}
        <details className={styles.full}><summary>{c('advanced')}</summary><div className={styles.fields}>
          {(['clientEmail', 'privateKey', 'serviceAccountPath', 'proxy'] as const).map(key => <label key={key} className={styles.field + ' ' + styles.full}><span>{key}</span><input aria-label={key} type={key === 'privateKey' ? 'password' : 'text'} disabled={busy} value={draft.vertexAI?.[key] || ''} onChange={event => vertex({ [key]: event.target.value })} /></label>)}
        </div></details>
      </>}
      <label className={styles.field + ' ' + styles.full}><span>{c('models')}</span><textarea aria-label={c('models')} required rows={3} disabled={busy} value={models} placeholder={c('modelsPlaceholder')} onChange={event => { setModels(event.target.value); setResult(''); setError('') }} /><small>{c('modelsHint')}</small></label>
      <label className={styles.field + ' ' + styles.full}><span>{c('defaultModel')}</span><Select ariaLabel={c('defaultModel')} disabled={busy || !modelIds.length} value={modelIds.includes(draft.defaultModelId || '') ? draft.defaultModelId! : modelIds[0] || ''} options={modelIds.map(id => ({ value: id, label: id }))} onChange={value => update({ defaultModelId: value })} /></label>
      <label className={styles.checkbox}><input type="checkbox" checked={draft.enabled !== false} disabled={busy} onChange={event => update({ enabled: event.target.checked })} />{c('enabled')}</label>
    </div>
    <div className={styles.footer}><button type="button" className={styles.button} disabled={busy} onClick={() => void saveOrTest(true)}>{busy ? c('working') : c('test')}</button><div className={styles.rowActions}><button type="button" className={styles.button} disabled={busy} onClick={onCancel}>{c('cancel')}</button><button className={styles.primary} type="submit" disabled={busy}>{busy ? c('working') : c('save')}</button></div></div>
  </form>
}
