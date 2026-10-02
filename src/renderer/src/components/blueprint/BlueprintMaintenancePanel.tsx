/**
 * Single-session workspace dialog.
 * Note: 右侧只有一个以当前工作区为基础的对话，无多会话管理 — see .agents/notes/2026-09-25-blueprint-workspace-dialog--5480ef6d.md
 * Note: 对话上下文跟随画布焦点成批注入，无需「维护此节点」点击 — see .agents/notes/2026-09-30-blueprint-batch-context--7c1e4a92.md
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useWorkspaceStore } from '@/stores/workspace'
import { useI18n } from '@/i18n/useI18n'
import { JanusChat } from '../janus/JanusChat'
import { useJanusChatRegistry } from '../janus/JanusChatProvider'
import type { EngineeringContext } from '../../../../shared/ipc/janus-chat'
import { useBlueprintStore } from '@/stores/blueprint'
import { useBlueprintMaintenanceStore } from '@/stores/blueprint-maintenance'
import { EMPTY_FOCUS, resolveBlueprintContextScope } from '@/features/blueprint/blueprint-focus'
import { useOptionalBlueprintToolbar } from './BlueprintToolbar'
import { BlueprintActionBar } from './BlueprintActionBar'

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
  const toolbar = useOptionalBlueprintToolbar()
  const activeWorkspaceId = useWorkspaceStore(state => state.activeWorkspaceId)
  const workspaces = useWorkspaceStore(state => state.workspaces)
  const activeWorkspace = workspaces.find(item => item.id === activeWorkspaceId) ?? null
  const blueprint = useBlueprintStore(state => state.currentBlueprint)
  const ownerPath = useBlueprintStore(state => blueprint ? state.blueprintWorkspace[blueprint.id] ?? null : null)
  const selection = useBlueprintMaintenanceStore(state => state.contextSelection)
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)
  const [switchNotice, setSwitchNotice] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const bindingKey = useRef('')
  const configuredKey = useRef('')
  const previousRevision = useRef<number | null>(null)
  const noticeTimer = useRef(0)

  // Context follows the canvas. The toolbar owns search/status/kind/selection in
  // the workbench; island and legacy entries fall back to the requested node.
  // Scalars, not an object: the resolver memo keys on these directly.
  const searchQuery = toolbar ? toolbar.searchQuery : EMPTY_FOCUS.searchQuery
  const statusFilter = toolbar ? toolbar.statusFilter : EMPTY_FOCUS.statusFilter
  const kindFilter = toolbar ? toolbar.kindFilter : EMPTY_FOCUS.kindFilter
  const selectedId = toolbar ? toolbar.selectedId : selection?.nodeId ?? null
  // Typing must not re-cut a 200-node batch on every keystroke; the canvas uses
  // the same deferred value for its own matching.
  const deferredQuery = useDeferredValue(searchQuery)

  const contextScope = useMemo(() => blueprint && activeWorkspace
    ? resolveBlueprintContextScope(blueprint, { searchQuery: deferredQuery, statusFilter, kindFilter, selectedId },
      { active: activeWorkspace.path, owner: ownerPath })
    : null, [blueprint, activeWorkspace, ownerPath, deferredQuery, statusFilter, kindFilter, selectedId])

  // A composition member whose Note lives in another checkout cannot be injected
  // here: main authorizes refs only against attached workspace roots.
  const foreignCount = contextScope?.foreignNodeIds.length ?? 0
  const sourceUnavailable = !!contextScope && contextScope.noteRefs.length === 0 && foreignCount > 0

  const context = useMemo<EngineeringContext>(() => ({
    domain: 'project', intent: 'discuss', scope: contextScope?.scope ?? 'view',
    repoIds: [...new Set((contextScope?.noteRefs ?? [])
      .map(ref => ref.uri.split('/')[2])
      .filter((id): id is string => !!id))],
    viewRef: { ...BLUEPRINT_PANEL_VIEW_REF },
    noteRefs: contextScope?.noteRefs ?? [],
  }), [contextScope?.scope, contextScope?.noteRefs])

  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  useEffect(() => {
    if (!registry.persistenceReady || !activeWorkspace) return
    const key = `${activeWorkspace.id}|${blueprint?.id ?? ''}`
    if (bindingKey.current === key) return
    bindingKey.current = key
    const id = registry.bindPanelProject(context, [activeWorkspace.id], activeWorkspace.name)
    setConversationId(id)
    // `context` is deliberately not a dependency: bindProjectConversation keys on
    // viewRef alone and returns the same conversation, so only configure below
    // needs to observe the batch changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, activeWorkspace, blueprint?.id])

  // Binding publishes a new controller on the next render. Never configure the
  // getController fallback (the personal conversation) while that publication waits.
  useEffect(() => {
    if (!conversationId || !activeWorkspace) return
    const chat = registry.getController(conversationId)
    if (chat.conversationId !== conversationId) return
    const key = `${conversationId}|${activeWorkspace.id}|${JSON.stringify(context)}`
    if (configuredKey.current === key) return
    configuredKey.current = key
    const revision = chat.engineeringContext?.contextRevision ?? 0
    const switched = revision > 0 && previousRevision.current !== revision
    previousRevision.current = revision
    chat.setEngineeringContext({ ...context, contextRevision: revision })
    chat.setApprovalMode('plan')
    for (const resource of chat.resourceController.resources) {
      if (resource.workspaceId !== activeWorkspace.id) chat.resourceController.detachWorkspace(resource.workspaceId)
    }
    chat.resourceController.attachWorkspace(activeWorkspace.id)
    if (switched) {
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
        messagesHidden={reviewOpen}
        pendingContent={chat.pendingContent} isStreaming={chat.isStreaming} error={chat.error}
        modelOptions={chat.modelOptions} activeModel={chat.activeModel} modelNotice={chat.modelNotice}
        resourceController={chat.resourceController} toolTraces={chat.toolTraces} conversationController={chat}
        onSelectModel={chat.selectModel} onSend={text => { setSwitchNotice(null); chat.send(text) }} onRewrite={chat.rewrite}
        aboveComposer={blueprint && contextScope && <BlueprintActionBar key={`${activeWorkspace.id}|${blueprint.id}|${contextScope.maintenanceScope.type}`}
          chat={chat} blueprint={blueprint} workspace={activeWorkspace} ownerPath={ownerPath}
          onReviewOpenChange={setReviewOpen}
          nodeScope={contextScope.maintenanceScope} noteCount={contextScope.noteRefs.length}
          sourceUnavailable={sourceUnavailable} switchPath={contextScope.foreignCheckoutPath}
          foreignCount={foreignCount} droppedCount={contextScope.droppedNodeIds.length} />}
        onStop={chat.stop} onRetry={chat.retry} onClear={chat.clear} minimalComposer />
    </div> : <p className="bp-maintenance-connecting" role="status">{t('blueprint:toolbar.loading')}</p>}
  </PanelFrame>
}
