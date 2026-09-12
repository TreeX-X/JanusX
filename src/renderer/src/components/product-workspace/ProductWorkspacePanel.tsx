import { useEffect, useMemo, useRef, useState } from 'react'
import type { OfficecliManualInstallGuidance } from '../../../../shared/office'
import { officeService } from '@/services/office'
import { useProductWorkspaceStore } from '@/stores/productWorkspace'
import { useI18n } from '@/i18n/useI18n'
import { ProductFileList } from './ProductFileList'
import { LocalFileStage } from './LocalFileStage'
import { OfficePreviewFrame } from '../office/OfficePreviewFrame'
import { OfficeSetupGate } from '../office/OfficeSetupGate'

export function ProductWorkspacePanel({ workspaceId, workspacePath, onClose }: {
  workspaceId: string | null
  workspacePath: string | null
  onClose: () => void
}) {
  const { t } = useI18n('editor')
  const tabs = useProductWorkspaceStore((state) => state.tabs)
  const activeTabIds = useProductWorkspaceStore((state) => state.activeTabIds)
  const productsByWorkspace = useProductWorkspaceStore((state) => state.productsByWorkspace)
  const openPreview = useProductWorkspaceStore((state) => state.openPreview)
  const activateTab = useProductWorkspaceStore((state) => state.activateTab)
  const closeTab = useProductWorkspaceStore((state) => state.closeTab)
  const reloadTab = useProductWorkspaceStore((state) => state.reloadTab)
  const releaseWorkspace = useProductWorkspaceStore((state) => state.releaseWorkspace)
  const handleEvicted = useProductWorkspaceStore((state) => state.handleEvicted)
  const [manualInstall, setManualInstall] = useState<OfficecliManualInstallGuidance>()
  const [setupOpen, setSetupOpen] = useState(false)
  const previousWorkspace = useRef<string | null>(null)
  const workspaceTabs = useMemo(() => tabs.filter((tab) => tab.workspaceId === workspaceId), [tabs, workspaceId])
  const activeTab = workspaceTabs.find((tab) => tab.tabId === activeTabIds[workspaceId ?? '']) ?? workspaceTabs[0]
  const workspaceProducts = workspaceId ? productsByWorkspace[workspaceId] ?? [] : []

  useEffect(() => officeService.onWatchEvicted((event) => handleEvicted(event.previewLeaseIds, event.reason)), [handleEvicted])
  useEffect(() => {
    const previous = previousWorkspace.current
    previousWorkspace.current = workspaceId
    if (previous && previous !== workspaceId) void releaseWorkspace(previous)
  }, [releaseWorkspace, workspaceId])
  useEffect(() => () => {
    const current = previousWorkspace.current
    if (current) void useProductWorkspaceStore.getState().releaseWorkspace(current)
  }, [])
  useEffect(() => {
    let disposed = false
    setManualInstall(undefined)
    if (workspaceId) void officeService.detect({ workspaceId }).then((result) => {
      if (!disposed && result.ok) setManualInstall(result.value.manualInstall)
    })
    return () => { disposed = true }
  }, [workspaceId])

  const retryActiveTab = () => {
    if (!activeTab || !workspaceId) return
    if (activeTab.kind === 'office' && activeTab.previewLeaseId) {
      void reloadTab(activeTab.tabId)
      return
    }
    if (activeTab.kind === 'office') {
      const { tabId, relPath } = activeTab
      void closeTab(tabId).then(() => openPreview(workspaceId, relPath))
      return
    }
    void reloadTab(activeTab.tabId)
  }
  useEffect(() => {
    if (activeTab?.errorCode === 'NOT_INSTALLED' || activeTab?.errorCode === 'INCOMPATIBLE') setSetupOpen(true)
  }, [activeTab?.errorCode])
  if (!workspaceId) return <div className="flex h-full items-center justify-center text-xs text-[#666]">{t('editor:product.selectWorkspace')}</div>

  return <div className="relative flex h-full min-h-0 flex-col bg-[var(--bg-deep)]">
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.08] px-3">
      <div className="min-w-0">
        <span className="text-[10px] font-semibold tracking-[0.14em] text-[#ff7830]">{t('editor:product.panelTitle')}</span>
      </div>
      {activeTab?.kind === 'office' && <button type="button" className="ml-auto mr-1 text-[9px] text-[#777] hover:text-white" onClick={() => setSetupOpen(true)}>{t('editor:product.engineButton')}</button>}
      <button
        type="button"
        aria-label={t('editor:product.closeAria')}
        className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-visible text-[#777] hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#ff7830]"
        onClick={onClose}
      >
        <span aria-hidden="true" className="relative block h-3 w-3">
          <span className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-current" />
          <span className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-current" />
        </span>
      </button>
    </div>
    <div className="border-b border-white/[0.06] px-3 py-2 text-[10px] leading-4 text-[#777]">{t('editor:product.refreshHint')}</div>
    <ProductFileList entries={workspaceProducts} onOpen={(relPath) => void openPreview(workspaceId, relPath)} />
    {workspaceTabs.length > 0 && <div className="flex overflow-x-auto border-b border-white/[0.06]">
      {workspaceTabs.map((tab) => <button key={tab.tabId} type="button" className="flex min-w-0 items-center gap-1 border-r border-white/[0.06] px-2 py-1.5 text-[10px]" style={{ color: tab.tabId === activeTab?.tabId ? '#eee' : '#777' }} onClick={() => activateTab(workspaceId, tab.tabId)}>
        <span className="max-w-32 truncate">{tab.relPath}</span>
        <span role="button" aria-label={t('editor:product.closeTabAria', { relPath: tab.relPath })} className="px-1 text-[#666] hover:text-white" onClick={(event) => { event.stopPropagation(); void closeTab(tab.tabId) }}>×</span>
      </button>)}
    </div>}
    {activeTab ? <>
      <div className="flex items-center justify-end gap-2 border-b border-white/[0.06] px-2 py-1">
        <button className="text-[10px] text-[#888] hover:text-white disabled:opacity-30" disabled={activeTab.status === 'reloading'} onClick={() => void reloadTab(activeTab.tabId)}>{t('editor:product.reloadFromDisk')}</button>
      </div>
      <div className="min-h-0 flex-1">
        {activeTab.kind === 'office'
          ? <OfficePreviewFrame port={activeTab.port} status={activeTab.status} errorCode={activeTab.errorCode} manualInstall={manualInstall} onRetry={retryActiveTab} onClose={() => void closeTab(activeTab.tabId)} />
          : activeTab.kind === 'unsupported' || !workspacePath
            ? <div className="flex h-full items-center justify-center px-4 text-center text-xs text-[#666]">{t('editor:product.unsupportedKind')}</div>
            : <LocalFileStage workspacePath={workspacePath} relPath={activeTab.relPath} kind={activeTab.kind} revision={activeTab.revision} />}
      </div>
    </> : <div className="flex min-h-32 flex-1 items-center justify-center text-xs text-[#666]">{t('editor:product.selectFromList')}</div>}
    {setupOpen && <OfficeSetupGate workspaceId={workspaceId} onClose={() => setSetupOpen(false)} onReady={() => { setSetupOpen(false); if (activeTab?.status === 'error') retryActiveTab() }} />}
  </div>
}
