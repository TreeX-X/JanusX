import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import type { ProviderSettings } from '@janusx/llm-core'
import type { CcSwitchSyncState } from '../../../shared/ipc/cc-switch'
import { CC_SWITCH_TOOL_META, CC_SWITCH_TOOL_ORDER, type CcSwitchToolId } from '../../../shared/ipc/cc-switch'
import { ccSwitchService } from '@/services/cc-switch'
import { getTerminalBindings, setTerminalBinding } from '@/services/llm'
import { Select } from './ui/Select'
import styles from './LlmConfigModal.module.css'

interface CliSyncSectionProps {
  providers: ProviderSettings[]
  defaultProviderId: string | null
}

type BindingMap = Record<string, { providerId: string | null; modelId?: string }>

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

export function CliSyncSection({ providers, defaultProviderId }: CliSyncSectionProps) {
  const { t } = useI18n('llm')
  const [syncState, setSyncState] = useState<CcSwitchSyncState>({ claude: null })
  const [bindings, setBindings] = useState<BindingMap>({})
  const [busyTool, setBusyTool] = useState<CcSwitchToolId | null>(null)
  const [savingTerminal, setSavingTerminal] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    setSyncState(await ccSwitchService.syncState())
  }, [])

  const refreshBindings = useCallback(async () => {
    try {
      setBindings(await getTerminalBindings())
    } catch (bindingError: unknown) {
      setError(bindingError instanceof Error ? bindingError.message : String(bindingError))
    }
  }, [])

  useEffect(() => {
    void refresh().catch((refreshError: unknown) => {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
    })
    void refreshBindings()
  }, [refresh, refreshBindings, providers.length, defaultProviderId])

  const defaultProvider = providers.find((provider) => provider.id === defaultProviderId) ?? null

  const providerOptions = useMemo(
    () => [
      { value: '', label: t('llm:terminals.followDefault') },
      ...providers.map((provider) => ({ value: provider.id, label: provider.name })),
    ],
    [providers, t],
  )

  const resolveEffective = useCallback((toolId: string): { provider: ProviderSettings | null; modelId: string } => {
    const binding = bindings[toolId]
    const bound = binding?.providerId ? providers.find((p) => p.id === binding.providerId) ?? null : null
    const provider = bound ?? defaultProvider
    if (!provider) return { provider: null, modelId: '' }
    const modelId = binding?.modelId?.trim() || provider.defaultModelId || provider.modelId || provider.models?.find(Boolean) || ''
    return { provider, modelId }
  }, [bindings, providers, defaultProvider])

  const handleBindingProviderChange = useCallback(async (toolId: string, providerId: string) => {
    setSavingTerminal(toolId)
    setError('')
    setNotice('')
    const nextModel = bindings[toolId]?.modelId
    try {
      const result = await setTerminalBinding(toolId, {
        providerId: providerId || null,
        ...(nextModel?.trim() ? { modelId: nextModel.trim() } : {}),
      })
      if (!result.success) {
        setError(result.error ?? t('llm:terminals.saveFailed', { error: '' }))
        return
      }
      setBindings((current) => ({ ...current, [toolId]: { providerId: providerId || null, ...(nextModel?.trim() ? { modelId: nextModel.trim() } : {}) } }))
      setNotice(t('llm:terminals.saved'))
      if (toolId === 'janus') notifyJanusLlmConfigChanged(!providerId, providerId || undefined)
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSavingTerminal(null)
    }
  }, [bindings, t])

  const handleBindingModelBlur = useCallback(async (toolId: string, modelId: string) => {
    const current = bindings[toolId]
    if ((current?.modelId ?? '') === modelId.trim()) return
    setSavingTerminal(toolId)
    setError('')
    try {
      const result = await setTerminalBinding(toolId, {
        providerId: current?.providerId ?? null,
        ...(modelId.trim() ? { modelId: modelId.trim() } : {}),
      })
      if (!result.success) {
        setError(result.error ?? t('llm:terminals.saveFailed', { error: '' }))
        return
      }
      setBindings((prev) => ({ ...prev, [toolId]: { providerId: current?.providerId ?? null, ...(modelId.trim() ? { modelId: modelId.trim() } : {}) } }))
      setNotice(t('llm:terminals.saved'))
      if (toolId === 'janus') notifyJanusLlmConfigChanged(!current?.providerId, current?.providerId ?? undefined)
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSavingTerminal(null)
    }
  }, [bindings, t])

  const handleApplyClaude = useCallback(async () => {
    setBusyTool('claude')
    setError('')
    setNotice('')
    try {
      // 用 Claude 终端绑定的 Provider；跟随默认时传 null，沿用既有默认口径。
      const bindingProviderId = bindings['claude']?.providerId ?? null
      const result = await ccSwitchService.applyProvider({ toolId: 'claude', providerId: bindingProviderId })
      if (!result.success) {
        setError(result.error === 'NO_LLM_PROVIDER' ? t('llm:cli.error.noProvider') : (result.error ?? ''))
        return
      }
      setNotice(t('llm:cli.notice.synced', { name: result.providerName ?? '' }))
      await refresh()
    } catch (applyError: unknown) {
      setError(applyError instanceof Error ? applyError.message : String(applyError))
    } finally {
      setBusyTool(null)
    }
  }, [bindings, refresh, t])

  const handleRollback = useCallback(async () => {
    setBusyTool('claude')
    setError('')
    setNotice('')
    try {
      const result = await ccSwitchService.rollbackProfile()
      if (!result.success) {
        setError(result.error ?? '')
        return
      }
      setNotice(t('llm:cli.notice.rolledBack'))
      await refresh()
    } catch (rollbackError: unknown) {
      setError(rollbackError instanceof Error ? rollbackError.message : String(rollbackError))
    } finally {
      setBusyTool(null)
    }
  }, [refresh, t])

  const claude = syncState.claude
  const sourceAlive = claude ? providers.some((provider) => provider.id === claude.providerId) : false

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t('llm:terminals.sectionTitle')}</h3>
      <div className={styles.providerList}>
        {CC_SWITCH_TOOL_ORDER.map((toolId) => {
          const meta = CC_SWITCH_TOOL_META[toolId]
          const binding = bindings[toolId] ?? { providerId: null }
          const effective = resolveEffective(toolId)
          const isJanus = toolId === 'janus'
          const isClaude = toolId === 'claude'
          return (
            <div key={toolId} className={styles.providerItem}>
              <div className={styles.providerMeta}>
                <div className={styles.providerName}>
                  {meta.displayName}
                  <span className={styles.providerBadge}>
                    {isJanus ? t('llm:terminals.janusBadge') : t('llm:terminals.externalBadge')}
                  </span>
                </div>
                <div className={styles.providerModel}>
                  {effective.provider
                    ? `${effective.provider.name}${effective.modelId ? ` / ${effective.modelId}` : ''}${!binding.providerId ? ` · ${t('llm:terminals.followDefault')}` : ''}`
                    : t('llm:cli.janus.unconfigured')}
                </div>
                <div className={styles.formGroup} style={{ marginTop: 8 }}>
                  <label>{t('llm:terminals.providerLabel')}</label>
                  <Select
                    className={`${styles.configInput} ${styles.selectInput}`}
                    value={binding.providerId ?? ''}
                    onChange={(value) => void handleBindingProviderChange(toolId, value)}
                    options={providerOptions}
                  />
                </div>
                <div className={styles.formGroup} style={{ marginTop: 8 }}>
                  <label>{t('llm:terminals.modelLabel')}</label>
                  <input
                    className={styles.configInput}
                    placeholder={t('llm:terminals.modelPlaceholder')}
                    defaultValue={binding.modelId ?? ''}
                    key={`${toolId}:${binding.providerId ?? 'default'}:${binding.modelId ?? ''}`}
                    disabled={savingTerminal === toolId}
                    onBlur={(event) => void handleBindingModelBlur(toolId, event.target.value)}
                  />
                </div>
                {isClaude && (
                  <div className={styles.providerModel} style={{ marginTop: 8 }}>
                    {claude
                      ? t('llm:cli.claude.synced', { name: claude.providerName, time: formatSyncTime(claude.syncedAt) })
                      : t('llm:cli.claude.notSynced')}
                    {claude && !sourceAlive && ` · ${t('llm:cli.claude.sourceGone')}`}
                  </div>
                )}
              </div>
              <div className={styles.providerActions}>
                {isClaude && (
                  <>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnGhost} ${styles.btnCompact} ${styles.btnAccent}`}
                      disabled={busyTool === 'claude'}
                      onClick={() => void handleApplyClaude()}
                    >
                      {t('llm:cli.claude.applyDefault')}
                    </button>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnGhost} ${styles.btnCompact}`}
                      disabled={busyTool === 'claude' || !claude}
                      onClick={() => void handleRollback()}
                    >
                      {t('llm:cli.claude.rollback')}
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {notice && <div className={styles.inlineHint}>{notice}</div>}
      {error && <div className={styles.notice}>{error}</div>}
      <div className={styles.inlineHint}>{t('llm:terminals.liveHint')}</div>
      <div className={styles.inlineHint}>{t('llm:cli.hint')}</div>
    </section>
  )
}
