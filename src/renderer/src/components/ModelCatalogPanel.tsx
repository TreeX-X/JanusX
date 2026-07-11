import { useEffect, useMemo, useState } from 'react'
import type { AiModelRegistryEntry, ModelCatalogSnapshot } from '@janusx/llm-core'
import { getModelCatalog, refreshModelCatalog } from '../services/llm'
import { buildCapabilityList, catalogEmptyState, formatList, groupModels } from './modelCatalogPanelLogic'
import styles from './ModelCatalogPanel.module.css'

export function ModelCatalogPanel() {
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
        setLoadError(error instanceof Error ? error.message : 'Model catalog failed to load')
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
        ? { kind: 'success', text: `Updated ${result.catalog.models.length} models` }
        : { kind: 'error', text: result.error ?? 'Update failed; keeping the current catalog' })
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Update failed; keeping the current catalog',
      })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <section className={styles.root} aria-busy={loading || refreshing}>
      <div className={styles.toolbar}>
        <label className={styles.searchField}>
          <span className={styles.srOnly}>Search model name or ID</span>
          <span className={styles.searchIcon} aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search model name or ID"
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
          {refreshing ? 'Updating' : loadError ? 'Retry' : 'Update catalog'}
        </button>
      </div>

      <div className={styles.summary} aria-live="polite">
        <span>{loading ? 'Loading model catalog...' : `${resultCount} models / ${groups.length} vendors`}</span>
        {catalog && (
          <span>
            {catalog.source === 'cache' ? 'Online catalog' : 'Bundled catalog'} / {formatDate(catalog.updatedAt)}
            {catalog.isStale ? ' / stale' : ''}
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
          <strong>Model catalog could not be loaded</strong>
          <span>{loadError}</span>
          <button type="button" className={styles.inlineButton} onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? 'Updating' : 'Retry update'}
          </button>
        </div>
      )}

      {(emptyState === 'empty-catalog' || emptyState === 'no-results') && (
        <div className={styles.empty}>
          <strong>{emptyState === 'no-results' ? 'No matching models' : 'No models available'}</strong>
          <span>{emptyState === 'no-results' ? 'Try a model name or complete ID' : 'Use Update catalog to retry the latest snapshot'}</span>
        </div>
      )}

      <div className={styles.groups}>
        {groups.map((group, index) => (
          <details className={styles.vendorGroup} key={group.vendor} open={hasSearch || index === 0}>
            <summary className={styles.vendorHeader}>
              <span>{group.vendor}</span>
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
  const capabilities = buildCapabilityList(model)

  return (
    <details className={styles.modelItem}>
      <summary className={styles.modelSummary}>
        <span className={styles.modelIdentity}>
          <strong>{model.name}</strong>
          <code>{model.id}</code>
        </span>
        <span className={styles.modelQuickMeta}>
          {model.effectiveContextWindow ? formatTokens(model.effectiveContextWindow) : 'Context unknown'}
        </span>
      </summary>
      <div className={styles.details}>
        <Metadata label="Context" value={formatOptionalTokens(model.effectiveContextWindow)} />
        <Metadata label="Max output" value={formatOptionalTokens(model.maxOutputTokens)} />
        <Metadata label="Input" value={formatList(model.inputModalities)} />
        <Metadata label="Output" value={formatList(model.outputModalities)} />
        <Metadata label="Capabilities" value={formatList(capabilities)} />
        <Metadata label="Input price" value={formatPrice(model.promptPricePerToken)} />
        <Metadata label="Output price" value={formatPrice(model.completionPricePerToken)} />
        {model.description && <p className={styles.description}>{model.description}</p>}
      </div>
    </details>
  )
}

function Metadata({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return <div className={styles.metadata}><span>{label}</span><strong>{value}</strong></div>
}

function formatTokens(value: number): string {
  return value >= 1_000_000 ? `${trimDecimal(value / 1_000_000)}M` : `${trimDecimal(value / 1_000)}K`
}

function formatOptionalTokens(value?: number): string | undefined {
  return value ? `${formatTokens(value)} tokens` : undefined
}

function formatPrice(value?: string): string | undefined {
  if (value === undefined) return undefined
  const price = Number(value) * 1_000_000
  return Number.isFinite(price) ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 4 })} / 1M tokens` : undefined
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Updated time unknown' : date.toLocaleString()
}

function trimDecimal(value: number): string {
  return Number(value.toFixed(1)).toString()
}
