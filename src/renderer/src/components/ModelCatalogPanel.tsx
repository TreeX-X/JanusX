import { useEffect, useMemo, useState } from 'react'
import type { AiModelRegistryEntry, ModelCatalogSnapshot } from '@janusx/llm-core'
import { getModelCatalog, refreshModelCatalog } from '../services/llm'
import { buildCapabilityList, catalogEmptyState, formatList, groupModels, UNKNOWN_VENDOR } from './modelCatalogPanelLogic'
import { useI18n } from '@/i18n/useI18n'
import styles from './ModelCatalogPanel.module.css'

export function ModelCatalogPanel() {
  const { t } = useI18n('model')
  const [catalog, setCatalog] = useState<ModelCatalogSnapshot | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let active = true
    getModelCatalog()
      .then((snapshot) => {
        if (!active) return
        setCatalog(snapshot)
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (!active) return
        setLoadError(error instanceof Error ? error.message : t('model:error.loadFailed'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const groups = useMemo(() => groupModels(catalog?.models ?? [], query), [catalog, query])
  const resultCount = groups.reduce((count, group) => count + group.models.length, 0)
  const hasSearch = Boolean(query.trim())
  const emptyState = catalogEmptyState(loading, catalog, loadError, resultCount, hasSearch)

  async function handleRefresh(): Promise<void> {
    setRefreshing(true)
    setMessage(null)
    try {
      const result = await refreshModelCatalog()
      setCatalog(result.catalog)
      setLoadError(null)
      setMessage(result.success
        ? { kind: 'success', text: t('model:message.updated', { count: result.catalog.models.length }) }
        : { kind: 'error', text: result.error ?? t('model:message.updateFailed') })
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : t('model:message.updateFailed'),
      })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <section className={styles.root} aria-busy={loading || refreshing}>
      <div className={styles.toolbar}>
        <label className={styles.searchField}>
          <span className={styles.srOnly}>{t('model:search.label')}</span>
          <span className={styles.searchIcon} aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('model:search.placeholder')}
            className={styles.searchInput}
          />
        </label>
        <button
          type="button"
          className={styles.refreshButton}
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <span className={refreshing ? styles.spinning : ''} aria-hidden="true">↻</span>
          {refreshing ? t('model:refresh.updating') : loadError ? t('model:refresh.retry') : t('model:refresh.updateCatalog')}
        </button>
      </div>

      <div className={styles.summary} aria-live="polite">
        <span>{loading ? t('model:summary.loading') : t('model:summary.count', { modelCount: resultCount, vendorCount: groups.length })}</span>
        {catalog && (
          <span>
            {catalog.source === 'cache' ? t('model:summary.sourceOnline') : t('model:summary.sourceBundled')} / {formatDate(catalog.updatedAt, t)}
            {catalog.isStale ? t('model:summary.stale') : ''}
          </span>
        )}
      </div>

      {message && (
        <div className={`${styles.message} ${message.kind === 'error' ? styles.messageError : styles.messageSuccess}`} role="status">
          {message.text}
        </div>
      )}

      {emptyState === 'load-error' && (
        <div className={styles.empty} role="alert">
          <strong>{t('model:error.loadFailedTitle')}</strong>
          <span>{loadError}</span>
          <button type="button" className={styles.inlineButton} onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? t('model:refresh.updating') : t('model:refresh.retryUpdate')}
          </button>
        </div>
      )}

      {(emptyState === 'empty-catalog' || emptyState === 'no-results') && (
        <div className={styles.empty}>
          <strong>{emptyState === 'no-results' ? t('model:empty.noResultsTitle') : t('model:empty.emptyTitle')}</strong>
          <span>{emptyState === 'no-results' ? t('model:empty.noResultsHint') : t('model:empty.emptyHint')}</span>
        </div>
      )}

      <div className={styles.groups}>
        {groups.map((group, index) => (
          <details className={styles.vendorGroup} key={group.vendor} open={hasSearch || index === 0}>
            <summary className={styles.vendorHeader}>
              <span>{group.vendor === UNKNOWN_VENDOR ? t('model:vendor.unknown') : group.vendor}</span>
              <span className={styles.count}>{group.models.length}</span>
            </summary>
            <div className={styles.modelList}>
              {group.models.map((model) => <ModelItem key={model.id} model={model} />)}
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

function ModelItem({ model }: { model: AiModelRegistryEntry }) {
  const { t } = useI18n('model')
  const capabilities = buildCapabilityList(model)

  return (
    <details className={styles.modelItem}>
      <summary className={styles.modelSummary}>
        <span className={styles.modelIdentity}>
          <strong>{model.name}</strong>
          <code>{model.id}</code>
        </span>
        <span className={styles.modelQuickMeta}>
          {model.effectiveContextWindow ? formatTokens(model.effectiveContextWindow) : t('model:model.contextUnknown')}
        </span>
      </summary>
      <div className={styles.details}>
        <Metadata label={t('model:meta.context')} value={formatOptionalTokens(model.effectiveContextWindow, t)} />
        <Metadata label={t('model:meta.maxOutput')} value={formatOptionalTokens(model.maxOutputTokens, t)} />
        <Metadata label={t('model:meta.input')} value={formatList(model.inputModalities)} />
        <Metadata label={t('model:meta.output')} value={formatList(model.outputModalities)} />
        <Metadata label={t('model:meta.capabilities')} value={formatList(capabilities)} />
        <Metadata label={t('model:meta.inputPrice')} value={formatPrice(model.promptPricePerToken, t)} />
        <Metadata label={t('model:meta.outputPrice')} value={formatPrice(model.completionPricePerToken, t)} />
        {model.description && <p className={styles.description}>{model.description}</p>}
      </div>
    </details>
  )
}

function Metadata({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return <div className={styles.metadata}><span>{label}</span><strong>{value}</strong></div>
}

type TFunc = (key: string, opts?: Record<string, unknown>) => string

function formatTokens(value: number): string {
  return value >= 1_000_000 ? `${trimDecimal(value / 1_000_000)}M` : `${trimDecimal(value / 1_000)}K`
}

function formatOptionalTokens(value: number | undefined, t: TFunc): string | undefined {
  return value ? t('model:model.tokensSuffix', { value: formatTokens(value) }) : undefined
}

function formatPrice(value: string | undefined, t: TFunc): string | undefined {
  if (value === undefined) return undefined
  const price = Number(value) * 1_000_000
  if (!Number.isFinite(price)) return undefined
  return t('model:model.priceFormat', { price: price.toLocaleString(undefined, { maximumFractionDigits: 4 }) })
}

function formatDate(value: string, t: TFunc): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? t('model:model.updatedTimeUnknown') : date.toLocaleString()
}

function trimDecimal(value: number): string {
  return Number(value.toFixed(1)).toString()
}
