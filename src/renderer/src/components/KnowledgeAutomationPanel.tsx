// Note: extraction, entry review, handbook generation and review have independent providers — see .agents/notes/2026-10-03-knowledge-accumulate-review-wiki-rereview--3944b368.md
import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { defaultKnowledgeAutomation, KNOWLEDGE_STAGES, type KnowledgeAutomationSettings, type KnowledgeProvider, type KnowledgeStage } from '../../../shared/knowledge-automation'
import { Select } from './ui/Select'
import { AutomationStatus } from './knowledge/AutomationStatus'
import styles from './NotificationSettingsPanel.module.css'
import automationStyles from './KnowledgeAutomationPanel.module.css'

export function KnowledgeAutomationPanel({ value, disabled, knowledgeEnabled, onChange, onSave }: {
  value?: KnowledgeAutomationSettings; disabled: boolean; knowledgeEnabled: boolean
  onChange(value: KnowledgeAutomationSettings): void; onSave(): Promise<boolean>
}) {
  const { t } = useI18n('knowledge')
  const config = value ?? defaultKnowledgeAutomation()
  const [providers, setProviders] = useState<Array<{ id: string; name: string; models: string[] }>>([])
  const [configured, setConfigured] = useState(false)
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let alive = true
    void Promise.resolve().then(() => Promise.all([window.electron.llm.getTerminalProviders('janus'), window.electron.knowledge.jevCredentialStatus()]))
      .then(([items, credential]) => { if (alive) { setProviders(items.filter(item => item.enabled !== false).map(item => ({ id: item.id, name: item.name, models: item.models ?? (item.modelId ? [item.modelId] : []) }))); setConfigured(credential.configured) } })
      .catch(() => { if (alive) setError(t('knowledge:automation.loadFailed')) })
    return () => { alive = false }
  }, [t])
  const updateStage = (stage: KnowledgeStage, changes: Partial<KnowledgeAutomationSettings['stages'][KnowledgeStage]>) =>
    onChange({ ...config, stages: { ...config.stages, [stage]: { ...config.stages[stage], ...changes } } })
  const credential = async (clear = false) => {
    setBusy(true); setError('')
    try { await window.electron.knowledge.setJevCredential(clear ? '' : key); setKey(''); setConfigured(!clear) }
    catch { setError(t('knowledge:automation.credentialFailed')) }
    finally { setBusy(false) }
  }
  return <section className={`${styles.section} ${automationStyles.panel}`} aria-label={t('knowledge:automation.title')}>
    <h3 className={styles.sectionTitle}>{t('knowledge:automation.title')}</h3>
    <p className={styles.hint}>{t('knowledge:automation.description')}</p>
    <label className={styles.row}>
      <span>{t('knowledge:automation.enable')}</span>
      <input type="checkbox" checked={config.enabled} disabled={disabled || !knowledgeEnabled}
        onChange={event => onChange({ ...config, enabled: event.target.checked })} />
    </label>
    {KNOWLEDGE_STAGES.map(stage => {
      const selected = config.stages[stage]
      const choices: KnowledgeProvider[] = stage === 'extraction' || stage === 'wikiGeneration' ? ['off', 'local', 'external'] : ['off', 'local', 'external', 'jev']
      return <fieldset key={stage} disabled={disabled}>
        <legend>{t(`knowledge:automation.stage.${stage}`)}</legend>
        <div className={styles.row}>
          <Select value={selected.provider} ariaLabel={t(`knowledge:automation.stage.${stage}`)} options={choices.map(provider => ({ value: provider, label: t(`knowledge:automation.provider.${provider}`) }))}
            onChange={provider => updateStage(stage, { provider: provider as KnowledgeProvider, thinking: provider === 'local' && stage === 'wikiGeneration',
              model: provider === 'jev' ? config.jev.model : provider === 'local' && selected.provider !== 'local' ? 'Qwen3.5-4B'
                : provider === 'external' && selected.provider !== 'external' ? '' : selected.model })} />
          {selected.provider === 'external' && <Select value={selected.providerId} ariaLabel={t('knowledge:automation.externalProvider')}
            options={[{ value: '', label: t('knowledge:automation.selectProvider') }, ...providers.map(provider => ({ value: provider.id, label: provider.name }))]}
            onChange={providerId => updateStage(stage, { providerId, model: providers.find(provider => provider.id === providerId)?.models[0] ?? '' })} />}
        </div>
        {selected.provider !== 'off' && <label className={styles.row}><span>{t('knowledge:automation.model')}</span>
          <input value={selected.model} aria-label={`${t(`knowledge:automation.stage.${stage}`)} ${t('knowledge:automation.model')}`}
            onChange={event => updateStage(stage, { model: event.target.value })} /></label>}
        {selected.provider === 'local' && <label className={styles.row}><span>{t('knowledge:automation.thinking')}</span><input type="checkbox" checked={selected.thinking}
          onChange={event => updateStage(stage, { thinking: event.target.checked })} /></label>}
        {selected.provider === 'external' && <p className={styles.hint}>{t('knowledge:automation.externalHint')}</p>}
      </fieldset>
    })}
    {KNOWLEDGE_STAGES.some(stage => config.stages[stage].provider === 'local') && <fieldset disabled={disabled}>
      <legend>{t('knowledge:automation.localTitle')}</legend>
      <p className={styles.hint}>{t('knowledge:automation.localHint')}</p>
      {(['endpoint', 'serverPath', 'modelPath'] as const).map(field => <label className={styles.row} key={field}>
        <span>{t(`knowledge:automation.local.${field}`)}</span><input value={config.local[field]}
          onChange={event => onChange({ ...config, local: { ...config.local, [field]: event.target.value } })} />
      </label>)}
      <button type="button" className={styles.button} onClick={() => void window.electron.knowledge.stopLocalModel().catch(() => setError(t('knowledge:automation.actionFailed')))}>{t('knowledge:automation.release')}</button>
    </fieldset>}
    {KNOWLEDGE_STAGES.some(stage => config.stages[stage].provider === 'jev') && <fieldset disabled={disabled || busy}>
      <legend>Jev</legend>
      <label className={styles.row}><span>{t('knowledge:automation.jevEndpoint')}</span><input value={config.jev.endpoint}
        onChange={event => onChange({ ...config, jev: { ...config.jev, endpoint: event.target.value } })} /></label>
      <p>{t(configured ? 'knowledge:automation.keyConfigured' : 'knowledge:automation.keyMissing')}</p>
      <label className={styles.row}><span>{t('knowledge:automation.key')}</span><input type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} /></label>
      <button type="button" className={styles.button} disabled={!key.trim()} onClick={() => void credential()}>{t('knowledge:automation.saveKey')}</button>
      <button type="button" className={styles.button} disabled={!configured} onClick={() => void credential(true)}>{t('knowledge:automation.clearKey')}</button>
    </fieldset>}
    {error && <p role="alert">{error}</p>}
    <AutomationStatus active beforeRun={onSave} disabled={disabled || !knowledgeEnabled || !config.enabled} />
  </section>
}
