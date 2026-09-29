/**
 * Single-session workspace dialog.
 * Note: 右侧只有一个以当前工作区为基础的对话，无多会话管理 — see .agents/notes/2026-09-25-blueprint-workspace-dialog--5480ef6d.md
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useWorkspaceStore } from '@/stores/workspace'
import { useI18n } from '@/i18n/useI18n'
import { JanusChat } from '../janus/JanusChat'
import { useJanusChatRegistry } from '../janus/JanusChatProvider'
import type { EngineeringContext } from '../../../../shared/ipc/janus-chat'
import { useBlueprintStore } from '@/stores/blueprint'
import { useBlueprintMaintenanceStore } from '@/stores/blueprint-maintenance'
import { sameCheckoutPath } from '@/features/blueprint/resolveNodeWorkspace'
import { BlueprintMaintenanceActions } from './BlueprintMaintenanceActions'

/** Stable identity of the single blueprint-panel conversation. */
export const BLUEPRINT_PANEL_VIEW_REF = { ownerRepoId: 'blueprint', viewId: 'workspace-dialog' } as const

const SWITCH_NOTICE_MS = 5000

interface BlueprintMaintenancePanelProps { onClose: () => void }

function PanelFrame({ onClose, onClear, children }: BlueprintMaintenancePanelProps & { onClear?: () => void; children: React.ReactNode }) {
  const { t } = useI18n('blueprint')
  return <aside className="bp-maintenance-panel" aria-label={t('blueprint:maintenance.consoleAria')}>
    <header className="bp-maintenance-panel__header">
      <div className="bp-maintenance-janus-head"><span className="bp-maintenance-janus-dot" aria-hidden="true" /><strong>Janus</strong></div>
      {onClear && <button type="button" className="bp-maintenance-clear" onClick={onClear} title={t('blueprint:action.clear')}>{t('blueprint:action.clear')}</button>}
      <button type="button" className="bp-panel-close" onClick={onClose} aria-label={t('blueprint:maintenance.closeConsole')}><X size={16} /></button>
    </header>
    {children}
  </aside>
}

export function BlueprintMaintenancePanel({ onClose }: BlueprintMaintenancePanelProps) {
  const { t } = useI18n('blueprint')
  const registry = useJanusChatRegistry()
  const activeWorkspaceId = useWorkspaceStore(state => state.activeWorkspaceId)
  const workspaces = useWorkspaceStore(state => state.workspaces)
  const activeWorkspace = workspaces.find(item => item.id === activeWorkspaceId) ?? null
  const blueprint = useBlueprintStore(state => state.currentBlueprint)
  const ownerPath = useBlueprintStore(state => blueprint ? state.blueprintWorkspace[blueprint.id] ?? null : null)
  const selection = useBlueprintMaintenanceStore(state => state.contextSelection)
  const nodeId = selection?.blueprintId === blueprint?.id ? selection?.nodeId : undefined
  const node = nodeId ? blueprint?.nodes[nodeId] : undefined
  const sourcePath = (nodeId ? blueprint?.composition?.nodes[nodeId]?.path : null) || ownerPath
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)
  const [switchNotice, setSwitchNotice] = useState<string | null>(null)
  const bindingKey = useRef('')
  const configuredKey = useRef('')
  const prevWorkspaceId = useRef<string | null>(null)
  const noticeTimer = useRef(0)
  const context = useMemo<EngineeringContext>(() => ({
    domain: 'project', intent: 'maintain', scope: node ? 'selected' : 'view',
    repoIds: node?.sourceUri ? [node.sourceUri.split('/')[2]] : [],
    viewRef: { ...BLUEPRINT_PANEL_VIEW_REF },
    noteRefs: node?.sourceUri && sourcePath && activeWorkspace && sameCheckoutPath(sourcePath, activeWorkspace.path)
      ? [{ uri: node.sourceUri, expectedHash: node.sourceHash, checkoutPath: sourcePath }] : [],
  }), [node, sourcePath, activeWorkspace])

  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  useEffect(() => {
    if (!registry.persistenceReady || !activeWorkspace) return
    const key = `${activeWorkspace.id}|${JSON.stringify(context)}`
    if (bindingKey.current === key) return
    bindingKey.current = key
    const id = registry.bindPanelProject(context, [activeWorkspace.id], activeWorkspace.name)
    setConversationId(id)
  }, [registry, activeWorkspace, context])

  // Binding publishes a new controller on the next render. Never configure the
  // getController fallback (the personal conversation) while that publication waits.
  useEffect(() => {
    if (!conversationId || !activeWorkspace) return
    const chat = registry.getController(conversationId)
    if (chat.conversationId !== conversationId) return
    const key = `${conversationId}|${activeWorkspace.id}|${JSON.stringify(context)}`
    if (configuredKey.current === key) return
    configuredKey.current = key
    const switched = prevWorkspaceId.current !== null && prevWorkspaceId.current !== activeWorkspace.id
    prevWorkspaceId.current = activeWorkspace.id
    chat.setEngineeringContext(context)
    chat.setApprovalMode('plan')
    for (const resource of chat.resourceController.resources) {
      if (resource.workspaceId !== activeWorkspace.id) chat.resourceController.detachWorkspace(resource.workspaceId)
    }
    chat.resourceController.attachWorkspace(activeWorkspace.id)
    if (switched) {
      chat.clear()
      setSwitchNotice(t('blueprint:maintenance.workspaceSwitched', { name: activeWorkspace.name }))
      window.clearTimeout(noticeTimer.current)
      noticeTimer.current = window.setTimeout(() => setSwitchNotice(null), SWITCH_NOTICE_MS)
    }
  }, [registry, conversationId, activeWorkspace, context, t])

  if (!activeWorkspace) {
    return <PanelFrame onClose={onClose}><p>{t('blueprint:view.emptySelectHint')}</p></PanelFrame>
  }
  const chat = conversationId ? registry.getController(conversationId) : null
  const bound = !!chat
    && chat.conversationId === conversationId
    && chat.engineeringContext?.viewRef?.viewId === BLUEPRINT_PANEL_VIEW_REF.viewId
    && chat.resourceController.resources.some(item => item.workspaceId === activeWorkspace.id)

  return <PanelFrame onClose={onClose} onClear={bound && chat ? () => { setSwitchNotice(null); chat.clear() } : undefined}>
    {switchNotice && <p className="bp-maintenance-switch-notice" role="status">{switchNotice}</p>}
    {bound && chat ? <div className="bp-maintenance-task">
      <JanusChat visible docked compactNavigation focused modeColor="#ff7830" messages={chat.messages}
        pendingContent={chat.pendingContent} isStreaming={chat.isStreaming} error={chat.error}
        modelOptions={chat.modelOptions} activeModel={chat.activeModel} modelNotice={chat.modelNotice}
        resourceController={chat.resourceController} toolTraces={chat.toolTraces} conversationController={chat}
        onSelectModel={chat.selectModel} onSend={text => { setSwitchNotice(null); chat.send(text) }} onRewrite={chat.rewrite}
        discussionFooter={blueprint && <BlueprintMaintenanceActions key={`${activeWorkspace.id}|${blueprint.id}|${nodeId ?? ''}`}
          chat={chat} blueprint={blueprint} workspace={activeWorkspace} ownerPath={ownerPath} nodeId={nodeId} />}
        onStop={chat.stop} onRetry={chat.retry} onClear={chat.clear} minimalComposer />
    </div> : <p className="bp-maintenance-connecting" role="status">{t('blueprint:toolbar.loading')}</p>}
  </PanelFrame>
}
