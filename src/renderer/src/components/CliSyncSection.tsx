import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import type { ProviderSettings } from '@janusx/llm-core'
import type { ExternalCliSyncState, TerminalModelState } from '../../../shared/ipc/external-cli'
import { EXTERNAL_CLI_TOOL_META, EXTERNAL_CLI_TOOL_ORDER, type ExternalCliToolId } from '../../../shared/ipc/external-cli'
import { externalCliService } from '@/services/external-cli'
import { getTerminalBindings, setTerminalBinding } from '@/services/llm'
import { Select } from './ui/Select'
import styles from './LlmConfigModal.module.css'

interface CliSyncSectionProps {
  providers: ProviderSettings[]
  defaultProviderId: string | null
}

type BindingMap = Record<string, { providerId: string | null; modelId?: string }>

/** 精简版各终端拥有的 model 键；janus 为内部绑定，claude 走凭证三元组。 */
const TERMINAL_FILE_META: Record<string, { format: string; ownedKey: string } | null> = {
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

export function CliSyncSection({ providers, defaultProviderId }: CliSyncSectionProps) {
  const { t } = useI18n('llm')
  const [activeTab, setActiveTab] = useState<ExternalCliToolId>('janus')
  const [syncState, setSyncState] = useState<ExternalCliSyncState>({ claude: null })
  const [bindings, setBindings] = useState<BindingMap>({})
  const [live, setLive] = useState<Partial<Record<string, TerminalModelState>>>({})
  const [liveLoading, setLiveLoading] = useState<Partial<Record<string, boolean>>>({})
  const [busyTool, setBusyTool] = useState<string | null>(null)
  const [savingTerminal, setSavingTerminal] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    setSyncState(await externalCliService.syncState())
  }, [])

  const refreshBindings = useCallback(async () => {
    try {
      setBindings(await getTerminalBindings())
    } catch (bindingError: unknown) {
      setError(bindingError instanceof Error ? bindingError.message : String(bindingError))
    }
  }, [])

  const ensureLive = useCallback(async (toolId: string) => {
    if (toolId !== 'codex' && toolId !== 'opencode' && toolId !== 'pi') return
    setLiveLoading((current) => ({ ...current, [toolId]: true }))
    try {
      const state = await externalCliService.readTerminalModel(toolId as ExternalCliToolId)
      setLive((current) => ({ ...current, [toolId]: state }))
    } catch (liveError: unknown) {
      setLive((current) => ({
        ...current,
        [toolId]: {
          toolId: toolId as ExternalCliToolId,
          configPath: null,
          exists: false,
          error: liveError instanceof Error ? liveError.message : String(liveError),
        },
      }))
    } finally {
      setLiveLoading((current) => ({ ...current, [toolId]: false }))
    }
  }, [])

  useEffect(() => {
    void refresh().catch((refreshError: unknown) => {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
    })
    void refreshBindings()
  }, [refresh, refreshBindings, providers.length, defaultProviderId])

  useEffect(() => {
    void ensureLive(activeTab)
  }, [activeTab, ensureLive])

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
      // 用 Claude 终端绑定的 Provider（含模型覆盖）；跟随默认时传 null，沿用既有默认口径。
      const bindingProviderId = bindings['claude']?.providerId ?? null
      const result = await externalCliService.applyProvider({ toolId: 'claude', providerId: bindingProviderId })
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

  const handleRollbackClaude = useCallback(async () => {
    setBusyTool('claude')
    setError('')
    setNotice('')
    try {
      const result = await externalCliService.rollbackProfile()
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

  const handleApplyModel = useCallback(async (toolId: ExternalCliToolId) => {
    const effective = resolveEffective(toolId)
    if (!effective.modelId) {
      setError(t('llm:terminals.modelRequired'))
      return
    }
    setBusyTool(toolId)
    setError('')
    setNotice('')
    try {
      const result = await externalCliService.applyTerminalModel({ toolId, model: effective.modelId })
      if (!result.success) {
        setError(result.error ?? '')
        return
      }
      setNotice(t('llm:terminals.modelApplied'))
      await ensureLive(toolId)
    } catch (applyError: unknown) {
      setError(applyError instanceof Error ? applyError.message : String(applyError))
    } finally {
      setBusyTool(null)
    }
  }, [ensureLive, resolveEffective, t])

  const handleRollbackModel = useCallback(async (toolId: ExternalCliToolId) => {
    setBusyTool(toolId)
    setError('')
    setNotice('')
    try {
      const result = await externalCliService.rollbackTerminal(toolId)
      if (!result.success) {
        setError(result.error ?? '')
        return
      }
      setNotice(t('llm:terminals.modelRolledBack'))
      await ensureLive(toolId)
    } catch (rollbackError: unknown) {
      setError(rollbackError instanceof Error ? rollbackError.message : String(rollbackError))
    } finally {
      setBusyTool(null)
    }
  }, [ensureLive, t])

  const claude = syncState.claude
  const sourceAlive = claude ? providers.some((provider) => provider.id === claude.providerId) : false
  const binding = bindings[activeTab] ?? { providerId: null }
  const effective = resolveEffective(activeTab)
  const fileMeta = TERMINAL_FILE_META[activeTab]
  const liveState = live[activeTab]
  const loadingLive = liveLoading[activeTab]
  const outOfSync = Boolean(
    fileMeta && liveState?.exists && !liveState.error && liveState.model !== undefined &&
    effective.modelId && liveState.model !== effective.modelId,
  )

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
              onClick={() => {
                setActiveTab(toolId)
                setError('')
                setNotice('')
              }}
            >
              {meta.displayName}
              {toolId === 'janus' && <span className={styles.providerBadge}>{t('llm:terminals.janusBadge')}</span>}
            </button>
          )
        })}
      </div>

      <div className={styles.providerModel}>
        {effective.provider
          ? `${effective.provider.name}${effective.modelId ? ` / ${effective.modelId}` : ''}${!binding.providerId ? ` · ${t('llm:terminals.followDefault')}` : ''}`
          : t('llm:cli.janus.unconfigured')}
      </div>
      <div className={styles.formGroup}>
        <label>{t('llm:terminals.providerLabel')}</label>
        <Select
          className={`${styles.configInput} ${styles.selectInput}`}
          value={binding.providerId ?? ''}
          onChange={(value) => void handleBindingProviderChange(activeTab, value)}
          options={providerOptions}
        />
      </div>
      <div className={styles.formGroup}>
        <label>{t('llm:terminals.modelLabel')}</label>
        <input
          className={styles.configInput}
          placeholder={t('llm:terminals.modelPlaceholder')}
          defaultValue={binding.modelId ?? ''}
          key={`${activeTab}:${binding.providerId ?? 'default'}:${binding.modelId ?? ''}`}
          disabled={savingTerminal === activeTab}
          onBlur={(event) => void handleBindingModelBlur(activeTab, event.target.value)}
        />
      </div>

      {activeTab === 'janus' && (
        <div className={styles.inlineHint}>{t('llm:terminals.internalNote')}</div>
      )}

      {activeTab === 'claude' && (
        <>
          <div className={styles.providerModel}>
            {claude
              ? t('llm:cli.claude.synced', { name: claude.providerName, time: formatSyncTime(claude.syncedAt) })
              : t('llm:cli.claude.notSynced')}
            {claude && !sourceAlive && ` · ${t('llm:cli.claude.sourceGone')}`}
          </div>
          <div className={styles.footerActions}>
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
              onClick={() => void handleRollbackClaude()}
            >
              {t('llm:cli.claude.rollback')}
            </button>
          </div>
          <div className={styles.inlineHint}>{t('llm:cli.hint')}</div>
        </>
      )}

      {fileMeta && (
        <div className={styles.terminalFile}>
          <div className={styles.providerModel}>
            {t('llm:terminals.fileLabel')}: {liveState?.configPath ?? '…'}
          </div>
          <div className={styles.providerModel}>
            {t('llm:terminals.formatLabel')}: {fileMeta.format} · {t('llm:terminals.ownedKeyLabel')}: {fileMeta.ownedKey}
          </div>
          <div className={styles.providerModel}>
            {loadingLive
              ? t('llm:test.testing')
              : liveState?.error
                ? liveState.error
                : liveState?.exists
                  ? liveState.model
                    ? t('llm:terminals.liveModel', { model: liveState.model })
                    : t('llm:terminals.liveMissing')
                  : t('llm:terminals.liveMissing')}
          </div>
          {outOfSync && <div className={styles.inlineHint}>{t('llm:terminals.outOfSync')}</div>}
          <div className={styles.footerActions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost} ${styles.btnCompact} ${styles.btnAccent}`}
              disabled={busyTool === activeTab || !effective.modelId}
              onClick={() => void handleApplyModel(activeTab)}
            >
              {t('llm:terminals.applyModel')}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost} ${styles.btnCompact}`}
              disabled={busyTool === activeTab}
              onClick={() => void ensureLive(activeTab)}
            >
              {t('llm:terminals.refreshFile')}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost} ${styles.btnCompact}`}
              disabled={busyTool === activeTab}
              onClick={() => void handleRollbackModel(activeTab)}
            >
              {t('llm:cli.claude.rollback')}
            </button>
          </div>
        </div>
      )}

      {notice && <div className={styles.inlineHint}>{notice}</div>}
      {error && <div className={styles.notice}>{error}</div>}
      <div className={styles.inlineHint}>{t('llm:terminals.liveHint')}</div>
    </section>
  )
}
