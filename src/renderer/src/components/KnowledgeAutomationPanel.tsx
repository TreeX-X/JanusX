// Note: extraction, entry review, handbook generation and review have independent providers — see .agents/notes/2026-10-03-knowledge-accumulate-review-wiki-rereview--3944b368.md
import { useEffect, useState } from 'react'
import { Cpu, KeyRound, Workflow } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { defaultKnowledgeAutomation, KNOWLEDGE_STAGES, type KnowledgeAutomationSettings, type KnowledgeProvider, type KnowledgeStage } from '../../../shared/knowledge-automation'
import { Select } from './ui/Select'
import { AutomationStatus } from './knowledge/AutomationStatus'
import styles from './KnowledgeSettingsPanel.module.css'
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
    <h3 className={styles.sectionTitle}><Workflow size={14} aria-hidden />{t('knowledge:automation.title')}</h3>
    <p className={styles.hint}>{t('knowledge:automation.description')}</p>
    <div className={styles.row}>
      <span className={styles.labelText}>{t('knowledge:automation.enable')}</span>
      <label className={styles.switch}>
        <input type="checkbox" checked={config.enabled} disabled={disabled || !knowledgeEnabled}
          aria-label={t('knowledge:automation.enable')}
          onChange={event => onChange({ ...config, enabled: event.target.checked })} />
        <span className={styles.switchTrack} />
      </label>
    </div>
    <div className={automationStyles.stages}>{KNOWLEDGE_STAGES.map((stage, index) => {
      const selected = config.stages[stage]
      const choices: KnowledgeProvider[] = stage === 'extraction' || stage === 'wikiGeneration' ? ['off', 'local', 'external'] : ['off', 'local', 'external', 'jev']
      return <fieldset className={automationStyles.stage} key={stage} disabled={disabled}>
        <legend><span className={automationStyles.step} aria-hidden>{String(index + 1).padStart(2, '0')}</span>{t(`knowledge:automation.stage.${stage}`)}</legend>
        <div className={automationStyles.stageFields}>
          <Select className={automationStyles.provider} disabled={disabled} value={selected.provider} ariaLabel={t(`knowledge:automation.stage.${stage}`)} options={choices.map(provider => ({ value: provider, label: t(`knowledge:automation.provider.${provider}`) }))}
            onChange={provider => updateStage(stage, { provider: provider as KnowledgeProvider, thinking: provider === 'local' && stage === 'wikiGeneration',
              model: provider === 'jev' ? config.jev.model : provider === 'local' && selected.provider !== 'local' ? 'Qwen3.5-4B'
                : provider === 'external' && selected.provider !== 'external' ? '' : selected.model })} />
          {selected.provider === 'external' && <Select className={automationStyles.externalProvider} disabled={disabled} value={selected.providerId} ariaLabel={t('knowledge:automation.externalProvider')}
            options={[{ value: '', label: t('knowledge:automation.selectProvider') }, ...providers.map(provider => ({ value: provider.id, label: provider.name }))]}
            onChange={providerId => updateStage(stage, { providerId, model: providers.find(provider => provider.id === providerId)?.models[0] ?? '' })} />}
          {selected.provider !== 'off' && <input className={automationStyles.model} value={selected.model} placeholder={t('knowledge:automation.model')}
            aria-label={`${t(`knowledge:automation.stage.${stage}`)} ${t('knowledge:automation.model')}`}
            onChange={event => updateStage(stage, { model: event.target.value })} />}
          {selected.provider === 'local' && <label className={automationStyles.thinking}>
            <span className={styles.switch}><input type="checkbox" checked={selected.thinking}
              onChange={event => updateStage(stage, { thinking: event.target.checked })} /><span className={styles.switchTrack} /></span>
            <span>{t('knowledge:automation.thinking')}</span>
          </label>}
        </div>
        {selected.provider === 'external' && <p className={styles.hint}>{t('knowledge:automation.externalHint')}</p>}
      </fieldset>
    })}</div>
    {KNOWLEDGE_STAGES.some(stage => config.stages[stage].provider === 'local') && <details className={automationStyles.connection}>
      <summary><Cpu size={14} aria-hidden /><span>{t('knowledge:automation.localTitle')}</span><small>{config.local.endpoint}</small></summary>
      <fieldset disabled={disabled} aria-label={t('knowledge:automation.localTitle')}>
      <p className={styles.hint}>{t('knowledge:automation.localHint')}</p>
      {(['endpoint', 'serverPath', 'modelPath'] as const).map(field => <label className={automationStyles.connectionField} key={field}>
        <span>{t(`knowledge:automation.local.${field}`)}</span><input value={config.local[field]}
          onChange={event => onChange({ ...config, local: { ...config.local, [field]: event.target.value } })} />
      </label>)}
      <button type="button" className={styles.button} onClick={() => void window.electron.knowledge.stopLocalModel().catch(() => setError(t('knowledge:automation.actionFailed')))}>{t('knowledge:automation.release')}</button>
    </fieldset></details>}
    {KNOWLEDGE_STAGES.some(stage => config.stages[stage].provider === 'jev') && <fieldset className={automationStyles.credential} disabled={disabled || busy}>
      <legend><KeyRound size={14} aria-hidden />Jev</legend>
      <label className={automationStyles.connectionField}><span>{t('knowledge:automation.jevEndpoint')}</span><input value={config.jev.endpoint}
        onChange={event => onChange({ ...config, jev: { ...config.jev, endpoint: event.target.value } })} /></label>
      <p className={styles.hint}>{t(configured ? 'knowledge:automation.keyConfigured' : 'knowledge:automation.keyMissing')}</p>
      <label className={automationStyles.connectionField}><span>{t('knowledge:automation.key')}</span><input type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} /></label>
      <div className={styles.actions}>
      <button type="button" className={styles.button} disabled={!key.trim()} onClick={() => void credential()}>{t('knowledge:automation.saveKey')}</button>
      <button type="button" className={styles.button} disabled={!configured} onClick={() => void credential(true)}>{t('knowledge:automation.clearKey')}</button>
      </div>
    </fieldset>}
    {error && <p className={`${styles.status} ${styles.statusError}`} role="alert">{error}</p>}
    <AutomationStatus active beforeRun={onSave} disabled={disabled || !knowledgeEnabled || !config.enabled} />
  </section>
}
