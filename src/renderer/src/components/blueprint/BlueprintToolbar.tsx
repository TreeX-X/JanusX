/**
 * @file 蓝图统一操作栏（高保真顶栏）
 * @description
 *  复刻 design/blueprint-note-graph.html 的 toolbar：scope 徽 + 只读锁 +
 *  搜索 + 状态/kind 自定义下拉 + 适应画布 / 重放加载 / 在对话中变更 +
 *  本机布局保存态。整条栏位于工作台 shell 内、横跨三列之上。
 *
 *  画布中部的旧操作栏（节点操作组/匹配导航/更多折叠面板）已收敛到此，
 *  节点详情与恢复布局使用 Canvas 注册的入口；本机布局不修改 Note。
 *  搜索/过滤/选中等状态由 BlueprintToolbarProvider 持有，
 *  BlueprintCanvas 在 workbench 下受控消费（embedded 无 provider 时走本地态）。
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { BlueprintNodeStatus } from '@/services/blueprint'
import type { BlueprintLayoutSaveStatus } from '@/features/blueprint/useBlueprintGraphController'
import { useBlueprintStore } from '@/stores/blueprint'
import { useBlueprintMaintenanceStore } from '@/stores/blueprint-maintenance'
import { useI18n } from '@/i18n/useI18n'
import { Select } from '../ui/Select'
import { STATUS_ORDER, STATUS_VISUALS, NOTE_KINDS, NOTE_KIND_LABEL_KEY, type NoteKindFilter } from './blueprintStatus'

// Note: two chrome rows and recoverable local layout — see .agents/notes/2026-09-25-blueprint-note-workbench-repair--62e857d3.md

export type ToolbarStatusFilter = BlueprintNodeStatus | 'all'
/** kind 下拉直接过滤 note 原始 kind（高保真同构），不再按映射后的 type 过滤 */
export type ToolbarKindFilter = NoteKindFilter

interface BlueprintToolbarState {
  searchQuery: string
  setSearchQuery: (query: string) => void
  statusFilter: ToolbarStatusFilter
  setStatusFilter: (filter: ToolbarStatusFilter) => void
  kindFilter: ToolbarKindFilter
  setKindFilter: (filter: ToolbarKindFilter) => void
  /** 画布当前选中节点（Canvas 回報，供“在对话中变更”携带 nodeId） */
  selectedId: string | null
  reportSelectedId: (id: string | null) => void
  /** 画布 fitView 入口（Canvas 注册） */
  fitRef: { current: (() => void) | null }
  toggleDetailRef: { current: (() => void) | null }
  restoreLayoutRef: { current: (() => void) | null }
  undoLayoutRef: { current: (() => void) | null }
  detailOpen: boolean
  canUndoLayout: boolean
  reportDetailOpen: (open: boolean) => void
  reportCanUndoLayout: (available: boolean) => void
  /** 本机布局保存态（Canvas 回報） */
  saveStatus: BlueprintLayoutSaveStatus
  reportSaveStatus: (status: BlueprintLayoutSaveStatus) => void
}

const BlueprintToolbarContext = createContext<BlueprintToolbarState | null>(null)

export function BlueprintToolbarProvider({ children }: { children: ReactNode }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ToolbarStatusFilter>('all')
  const [kindFilter, setKindFilter] = useState<ToolbarKindFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<BlueprintLayoutSaveStatus>('clean')
  const fitRef = useRef<(() => void) | null>(null)
  const toggleDetailRef = useRef<(() => void) | null>(null)
  const restoreLayoutRef = useRef<(() => void) | null>(null)
  const undoLayoutRef = useRef<(() => void) | null>(null)
  const [detailOpen, reportDetailOpen] = useState(true)
  const [canUndoLayout, reportCanUndoLayout] = useState(false)
  const reportSelectedId = useCallback((id: string | null) => setSelectedId(id), [])
  const reportSaveStatus = useCallback((status: BlueprintLayoutSaveStatus) => setSaveStatus(status), [])
  const value = useMemo<BlueprintToolbarState>(() => ({
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    kindFilter,
    setKindFilter,
    selectedId,
    reportSelectedId,
    fitRef,
    toggleDetailRef, restoreLayoutRef, undoLayoutRef,
    detailOpen, canUndoLayout, reportDetailOpen, reportCanUndoLayout,
    saveStatus,
    reportSaveStatus,
  }), [searchQuery, statusFilter, kindFilter, selectedId, saveStatus, reportSelectedId, reportSaveStatus, detailOpen, canUndoLayout])
  return <BlueprintToolbarContext.Provider value={value}>{children}</BlueprintToolbarContext.Provider>
}

/** workbench 下 Canvas 消费（null = embedded，Canvas 走本地态 + 内部栏） */
export function useOptionalBlueprintToolbar(): BlueprintToolbarState | null {
  return useContext(BlueprintToolbarContext)
}

function useRequiredBlueprintToolbar(): BlueprintToolbarState {
  const state = useContext(BlueprintToolbarContext)
  if (!state) throw new Error('BlueprintToolbar must be rendered inside BlueprintToolbarProvider')
  return state
}

interface BlueprintToolbarProps {
  getSelectPortalContainer?: () => HTMLElement | null
}

export function BlueprintToolbar({ getSelectPortalContainer }: BlueprintToolbarProps) {
  const { t } = useI18n('blueprint')
  const {
    searchQuery, setSearchQuery,
    statusFilter, setStatusFilter,
    kindFilter, setKindFilter,
    selectedId, fitRef, saveStatus, toggleDetailRef, restoreLayoutRef, undoLayoutRef, detailOpen, canUndoLayout,
  } = useRequiredBlueprintToolbar()
  const currentBlueprint = useBlueprintStore((s) => s.currentBlueprint)
  const loading = useBlueprintStore((s) => s.loading)
  const error = useBlueprintStore((s) => s.error)
  const requestMaintenanceOpen = useBlueprintMaintenanceStore((s) => s.requestOpen)

  const statusFilterOptions = useMemo(
    () => [
      { value: 'all', label: t('blueprint:search.statusAll') },
      ...STATUS_ORDER.map((status) => ({ value: status, label: t(STATUS_VISUALS[status].labelKey) })),
    ],
    [t],
  )
  const kindFilterOptions = useMemo(
    () => [
      { value: 'all', label: t('blueprint:search.kindAll') },
      ...NOTE_KINDS.map((kind) => ({ value: kind, label: t(NOTE_KIND_LABEL_KEY[kind]) })),
    ],
    [t],
  )

  return (
    <div className="blueprint-toolbar blueprint-workbench-toolbar" role="toolbar" aria-label={t('blueprint:ariaLabel.focus')}>
      {currentBlueprint ? (
        <span className="blueprint-toolbar__scope" title={t('blueprint:view.scopeBadge', { name: currentBlueprint.name, rev: currentBlueprint.contentRevision, count: currentBlueprint.nodeIds.length, adapter: currentBlueprint.adapterVersion ?? 'v1' })}>
          {t('blueprint:view.scopeBadge', { name: currentBlueprint.name, rev: currentBlueprint.contentRevision, count: currentBlueprint.nodeIds.length, adapter: currentBlueprint.adapterVersion ?? 'v1' })}
        </span>
      ) : null}
      <span className="blueprint-toolbar__lock" title={t('blueprint:view.readOnlyBadge')}>
        {t('blueprint:view.readOnlyBadge')}
      </span>
      <div className="blueprint-toolbar__spacer" />
      {loading ? <span className="blueprint-toolbar__loading">{t('blueprint:toolbar.loading')}</span> : null}
      {error ? <span className="blueprint-toolbar__error">{error}</span> : null}
      <div className="blueprint-toolbar__search-wrap">
        <input
          className="blueprint-toolbar__search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
          placeholder={t('blueprint:search.placeholder')}
          aria-label={t('blueprint:ariaLabel.search')}
        />
      </div>
      <Select
        value={statusFilter}
        onChange={(value) => setStatusFilter(value as ToolbarStatusFilter)}
        options={statusFilterOptions}
        className="blueprint-select blueprint-select--status-filter"
        getPortalContainer={getSelectPortalContainer}
      />
      <Select
        value={kindFilter}
        onChange={(value) => setKindFilter(value as ToolbarKindFilter)}
        options={kindFilterOptions}
        className="blueprint-select blueprint-select--kind-filter"
        getPortalContainer={getSelectPortalContainer}
      />
      <button className="blueprint-btn" onClick={() => fitRef.current?.()} title={t('blueprint:action.fitCanvas')}>
        {t('blueprint:action.fitCanvas')}
      </button>
      <button
        className="blueprint-btn"
        onClick={() => toggleDetailRef.current?.()}
        aria-pressed={detailOpen}
        disabled={!currentBlueprint}
      >
        {t('blueprint:action.nodeDetail')}
      </button>
      <button className="blueprint-btn" disabled={!currentBlueprint} onClick={() => restoreLayoutRef.current?.()}>
        {t('blueprint:action.restoreDefaultLayout')}
      </button>
      {canUndoLayout && <button className="blueprint-btn" onClick={() => undoLayoutRef.current?.()}>{t('blueprint:action.undoRestore')}</button>}
      <button
        className="blueprint-btn blueprint-btn--primary-ghost"
        onClick={() => {
          if (!currentBlueprint) return
          requestMaintenanceOpen(selectedId ? { blueprintId: currentBlueprint.id, nodeId: selectedId } : { blueprintId: currentBlueprint.id })
        }}
        title={t('blueprint:action.editInChat')}
      >
        {t('blueprint:action.editInChat')}
      </button>
      <span className={`blueprint-toolbar__save-status blueprint-toolbar__save-status--${saveStatus === 'clean' ? 'saved' : saveStatus}`}>
        {saveStatus === 'saving' ? '保存中…' : saveStatus === 'pending' ? '待保存' : saveStatus === 'failed' ? '保存失败' : '布局已保存（本机）'}
      </span>
    </div>
  )
}
