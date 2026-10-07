// Note: extraction, entry review, handbook generation and review have independent providers — see .agents/notes/2026-10-03-knowledge-accumulate-review-wiki-rereview--3944b368.md
import { useCallback, useEffect, useId, useState, type CSSProperties } from 'react'
import { KeyRound, Workflow } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { jevThreshold, defaultKnowledgeAutomation, KNOWLEDGE_STAGES, type KnowledgeAutomationSettings, type KnowledgeProvider, type KnowledgeStage } from '../../../shared/knowledge-automation'
import { KnowledgeLocalModelPanel } from './KnowledgeLocalModelPanel'
import { Select } from './ui/Select'
import { JevCredentialFields } from './knowledge/JevCredentialFields'
import { KnowledgeConfigurationTest } from './knowledge/KnowledgeConfigurationTest'
import { AutomationSettingsStatus } from './knowledge/AutomationStatus'
import styles from './KnowledgeSettingsPanel.module.css'
import automationStyles from './KnowledgeAutomationPanel.module.css'

export function KnowledgeAutomationPanel({ value, disabled, knowledgeEnabled, onChange, onSave, onLocalPersist }: {
  value?: KnowledgeAutomationSettings; disabled: boolean; knowledgeEnabled: boolean
  onLocalPersist(value: KnowledgeAutomationSettings['local']): void
  onChange(value: KnowledgeAutomationSettings): void; onSave(): Promise<boolean>
}) {
  const { t } = useI18n('knowledge')
  const config = value ?? defaultKnowledgeAutomation()
  const thresholdId = useId()
  const thresholdValue = jevThreshold(config.jev.threshold)
  const [thresholdText, setThresholdText] = useState(thresholdValue.toFixed(2))
  useEffect(() => { setThresholdText(thresholdValue.toFixed(2)) }, [thresholdValue])
  const [providers, setProviders] = useState<Array<{ id: string; name: string; models: string[] }>>([])
  const [error, setError] = useState('')
  const [credential, setCredential] = useState<{ key?: string; revision: number }>({ revision: 0 })
  const credentialChanged = useCallback((key?: string) => setCredential(current => ({ key, revision: current.revision + 1 })), [])
  useEffect(() => {
    let alive = true
    void Promise.resolve().then(() => window.electron.llm.getTerminalProviders('janus'))
      .then(items => { if (alive) { setProviders(items.filter(item => item.enabled !== false).map(item => ({ id: item.id, name: item.name, models: item.models ?? (item.modelId ? [item.modelId] : []) }))) } })
      .catch(() => { if (alive) setError(t('knowledge:automation.loadFailed')) })
    return () => { alive = false }
  }, [t])
  const updateStage = (stage: KnowledgeStage, changes: Partial<KnowledgeAutomationSettings['stages'][KnowledgeStage]>) =>
    onChange({ ...config, stages: { ...config.stages, [stage]: { ...config.stages[stage], ...changes } } })
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
          <Select className={automationStyles.provider} disabled={disabled} value={selected.provider} ariaLabel={t(`knowledge:automation.stage.${stage}`)} options={choices.filter(provider => provider !== 'local' || config.local.enabled).map(provider => ({ value: provider,
            label: stage === 'extraction' && provider === 'off' ? t('knowledge:automation.rulesOnly') : t(`knowledge:automation.provider.${provider}`) }))}
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
        {stage === 'extraction' && <p className={styles.hint}>{t('knowledge:automation.extractionHint')}</p>}
        {selected.provider === 'external' && <p className={styles.hint}>{t('knowledge:automation.externalHint')}</p>}
      </fieldset>
    })}</div>
    <KnowledgeLocalModelPanel value={config.local} disabled={disabled} onPersist={onLocalPersist} />
    {KNOWLEDGE_STAGES.some(stage => config.stages[stage].provider === 'jev') && <fieldset className={automationStyles.credential} disabled={disabled}>
      <legend><KeyRound size={14} aria-hidden />Jev</legend>
      <label className={automationStyles.connectionField}><span>{t('knowledge:automation.jevEndpoint')}</span><input value={config.jev.endpoint}
        onChange={event => onChange({ ...config, jev: { ...config.jev, endpoint: event.target.value } })} /></label>
      {/* Note: threshold controls follow settings tokens and retain explicit save semantics; see .agents/notes/2026-10-06-knowledge-review-status-audit-plan--76ef32d1.md */}
      <div className={automationStyles.thresholdField}>
        <label id={`${thresholdId}-label`} htmlFor={thresholdId}>{t('knowledge:automationExplain.threshold')}</label>
        <div className={automationStyles.thresholdControls}>
          <div className={automationStyles.thresholdScale}>
            <input className={automationStyles.thresholdSlider} type="range" min="0.5" max="1" step="0.01"
              aria-labelledby={`${thresholdId}-label`} aria-describedby={`${thresholdId}-hint`} value={thresholdValue}
              style={{ '--threshold-fill': `${(thresholdValue - 0.5) * 200}%` } as CSSProperties}
              onChange={event => onChange({ ...config, jev: { ...config.jev, threshold: Number(event.target.value) } })} />
            <div className={automationStyles.thresholdLimits} aria-hidden="true"><span>0.50</span><span>1.00</span></div>
          </div>
          <input id={thresholdId} className={automationStyles.thresholdNumber} aria-describedby={`${thresholdId}-hint`}
            type="number" min="0.5" max="1" step="0.01" value={thresholdText} onBlur={() => setThresholdText(thresholdValue.toFixed(2))} onChange={event => {
              setThresholdText(event.target.value)
              const threshold = Number(event.target.value)
              if (threshold >= 0.5 && threshold <= 1) onChange({ ...config, jev: { ...config.jev, threshold } })
            }} />
        </div>
        <p id={`${thresholdId}-hint`} className={styles.hint}>{t('knowledge:automationExplain.thresholdHint')}</p>
      </div>
      <JevCredentialFields disabled={disabled} onCredentialChange={credentialChanged} />
    </fieldset>}
    <KnowledgeConfigurationTest config={config} credential={credential} disabled={disabled} />
    {error && <p className={`${styles.status} ${styles.statusError}`} role="alert">{error}</p>}
    <AutomationSettingsStatus beforeRun={onSave} disabled={disabled || !knowledgeEnabled || !config.enabled} />
  </section>
}
