import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { ModelCatalogSnapshot } from '@janusx/llm-core'
import type { UsageRecord } from '../../../shared/usage'
import { useI18n } from '@/i18n/useI18n'
import { getModelCatalog, refreshModelCatalog } from '@/services/llm'
import { aggregateUsageCosts } from '@/lib/usage-cost'
import styles from './UsageStatsPanel.module.css'

function money(value: number): string {
  if (value > 0 && value < 0.0001) return '<$0.0001'
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

export function UsageCostPanel({ records, start, end, engine }: { records: readonly UsageRecord[]; start: number; end: number; engine?: string }) {
  const { t } = useI18n('settings')
  const [catalog, setCatalog] = useState<ModelCatalogSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  useEffect(() => {
    let active = true
    void Promise.resolve().then(getModelCatalog).then(value => { if (active) setCatalog(value) })
      .catch(() => { if (active) setFailed(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  async function refresh() {
    setRefreshing(true)
    try {
      const result = await refreshModelCatalog()
      setCatalog(result.catalog)
      setFailed(!result.success)
    } catch { setFailed(true) }
    finally { setRefreshing(false) }
  }
  const cost = useMemo(() => aggregateUsageCosts(records, catalog?.models ?? [], start, end, engine), [records, catalog, start, end, engine])
  const coverage = cost.totalTokens > 0 ? cost.pricedTokens / cost.totalTokens : 0
  const hint = loading ? t('settings:usageStats.costLoading')
    : failed ? t('settings:usageStats.costError')
      : !cost.pricedTokens ? t('settings:usageStats.costUnavailable')
        : t('settings:usageStats.costCoverage', { percent: Math.floor(coverage * 1000) / 10 })
  const refreshLabel = t(refreshing ? 'settings:usageStats.costRefreshing' : 'settings:usageStats.costRefresh')
  return <div className={styles.costInline}>
    <span>{t('settings:usageStats.costTitle')}</span>
    <strong data-testid="usage-cost" title={hint}>{loading || !cost.pricedTokens ? '–' : money(cost.usd)}</strong>
    <button type="button" onClick={() => void refresh()} disabled={refreshing} aria-label={refreshLabel} title={refreshLabel}>
      <RefreshCw size={12} aria-hidden="true" />
    </button>
  </div>
}
