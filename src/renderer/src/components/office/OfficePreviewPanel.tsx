import { useEffect, useMemo, useRef, useState } from 'react'
import type { OfficecliManualInstallGuidance } from '../../../../shared/office'
import { encodeTerminalPaste } from '../../../../shared/terminalPaste'
import { officeService } from '@/services/office'
import { useOfficeStore } from '@/stores/office'
import { useWorkspaceStore } from '@/stores/workspace'
import { OfficeFileList } from './OfficeFileList'
import { OfficePreviewFrame } from './OfficePreviewFrame'
import {
  canPasteOfficePrompt,
  isOfficePromptContextCurrent,
  OfficePromptPreview,
  type OfficePromptContext,
  type OfficePromptPreviewState,
} from './OfficePromptPreview'

export function OfficePreviewPanel({ workspaceId, onClose }: { workspaceId: string | null; onClose: () => void }) {
  const tabs = useOfficeStore((state) => state.tabs)
  const activeTabIds = useOfficeStore((state) => state.activeTabIds)
  const openPreview = useOfficeStore((state) => state.openPreview)
  const activateTab = useOfficeStore((state) => state.activateTab)
  const closeTab = useOfficeStore((state) => state.closeTab)
  const reloadTab = useOfficeStore((state) => state.reloadTab)
  const releaseWorkspace = useOfficeStore((state) => state.releaseWorkspace)
  const handleEvicted = useOfficeStore((state) => state.handleEvicted)
  const terminals = useWorkspaceStore((state) => state.terminals)
  const activeTerminalId = useWorkspaceStore((state) => state.activeTerminalId)
  const [promptPreview, setPromptPreview] = useState<OfficePromptPreviewState | null>(null)
  const [manualInstall, setManualInstall] = useState<OfficecliManualInstallGuidance>()
  const previousWorkspace = useRef<string | null>(null)
  const promptRequestId = useRef(0)
  const workspaceTabs = useMemo(() => tabs.filter((tab) => tab.workspaceId === workspaceId), [tabs, workspaceId])
  const activeTab = workspaceTabs.find((tab) => tab.tabId === activeTabIds[workspaceId ?? '']) ?? workspaceTabs[0]
  const activeTerminal = terminals.find((terminal) => terminal.id === activeTerminalId) ?? null
  const promptIdentity = `${workspaceId ?? ''}\n${activeTab?.relPath ?? ''}\n${activeTerminal?.id ?? ''}\n${activeTerminal?.preset ?? 'shell'}`
  const promptIdentityRef = useRef(promptIdentity)
  promptIdentityRef.current = promptIdentity

  useEffect(() => {
    const previous = previousWorkspace.current
    previousWorkspace.current = workspaceId
    if (previous && previous !== workspaceId) void releaseWorkspace(previous)
  }, [releaseWorkspace, workspaceId])
  useEffect(() => () => {
    const current = previousWorkspace.current
    if (current) void useOfficeStore.getState().releaseWorkspace(current)
  }, [])
  useEffect(() => officeService.onWatchEvicted((event) => handleEvicted(event.previewLeaseIds, event.reason)), [handleEvicted])
  useEffect(() => {
    setPromptPreview(null)
  }, [promptIdentity])
  useEffect(() => {
    let disposed = false
    setManualInstall(undefined)
    if (workspaceId) void officeService.detect({ workspaceId }).then((result) => {
      if (!disposed && result.ok) setManualInstall(result.value.manualInstall)
    })
    return () => { disposed = true }
  }, [workspaceId])

  const showPrompt = async () => {
    if (!workspaceId || !activeTab) return
    const context: OfficePromptContext = {
      requestId: ++promptRequestId.current,
      workspaceId,
      relPath: activeTab.relPath,
      terminalId: activeTerminal?.id ?? null,
      terminalPreset: activeTerminal?.preset ?? 'shell',
    }
    const identity = promptIdentity
    const result = await officeService.buildPrompt({ workspaceId, relPath: activeTab.relPath, terminalPreset: context.terminalPreset })
    if (result.ok && context.requestId === promptRequestId.current && identity === promptIdentityRef.current) {
      setPromptPreview({ prompt: result.value, context })
    }
  }

  const pastePrompt = (context: OfficePromptContext, text: string): boolean => {
    const workspace = useWorkspaceStore.getState()
    const terminal = workspace.activeTerminalId
      ? workspace.terminals.find((item) => item.id === workspace.activeTerminalId) ?? null
      : null
    const office = useOfficeStore.getState()
    const tab = office.tabs.find((item) => item.tabId === office.activeTabIds[context.workspaceId])
    if (!isOfficePromptContextCurrent(context, workspace.activeWorkspaceId, tab?.relPath, terminal) || !canPasteOfficePrompt(context, terminal)) return false
    window.electron.send('terminal:input', { id: terminal.id, data: encodeTerminalPaste(text) })
    return true
  }
  if (!workspaceId) return <div className="flex h-full items-center justify-center text-xs text-[#666]">请选择工作区</div>

  return <div className="relative flex h-full min-h-0 flex-col bg-[var(--bg-deep)]">
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.08] px-3">
      <div className="min-w-0">
        <span className="text-[10px] font-semibold tracking-[0.14em] text-[#ff7830]">OFFICE PREVIEW</span>
      </div>
      <button type="button" aria-label="Close Office preview" className="px-2 py-1 text-sm text-[#777] hover:text-white" onClick={onClose}>�</button>
    </div>
    <div className="border-b border-white/[0.06] px-3 py-2 text-[10px] leading-4 text-[#777]">实时刷新仅适用于 OfficeCLI 写入；其他修改请从磁盘重新加载。</div>
    <OfficeFileList workspaceId={workspaceId} onOpen={(relPath) => void openPreview(workspaceId, relPath)} />
    {workspaceTabs.length > 0 && <div className="flex overflow-x-auto border-b border-white/[0.06]">
      {workspaceTabs.map((tab) => <button key={tab.tabId} type="button" className="flex min-w-0 items-center gap-1 border-r border-white/[0.06] px-2 py-1.5 text-[10px]" style={{ color: tab.tabId === activeTab?.tabId ? '#eee' : '#777' }} onClick={() => activateTab(workspaceId, tab.tabId)}>
        <span className="max-w-32 truncate">{tab.relPath}</span>
        <span role="button" aria-label={`关闭 ${tab.relPath}`} className="px-1 text-[#666] hover:text-white" onClick={(event) => { event.stopPropagation(); void closeTab(tab.tabId) }}>×</span>
      </button>)}
    </div>}
    {activeTab ? <>
      <div className="flex items-center justify-end gap-2 border-b border-white/[0.06] px-2 py-1">
        <button className="text-[10px] text-[#888] hover:text-white disabled:opacity-30" onClick={() => void showPrompt()}>插入 OfficeCLI 用法</button>
        <button className="text-[10px] text-[#888] hover:text-white disabled:opacity-30" disabled={!activeTab.previewLeaseId || activeTab.status === 'reloading'} onClick={() => void reloadTab(activeTab.tabId)}>从磁盘重新加载</button>
      </div>
      <div className="min-h-0 flex-1"><OfficePreviewFrame port={activeTab.port} status={activeTab.status} errorCode={activeTab.errorCode} manualInstall={manualInstall} onRetry={() => activeTab.previewLeaseId ? void reloadTab(activeTab.tabId) : void closeTab(activeTab.tabId).then(() => openPreview(workspaceId, activeTab.relPath))} onClose={() => void closeTab(activeTab.tabId)} /></div>
    </> : <div className="flex min-h-32 flex-1 items-center justify-center text-xs text-[#666]">从上方列表选择 Office 文档</div>}
    {promptPreview && <OfficePromptPreview preview={promptPreview} terminal={activeTerminal} onPaste={pastePrompt} onClose={() => setPromptPreview(null)} />}
  </div>
}
