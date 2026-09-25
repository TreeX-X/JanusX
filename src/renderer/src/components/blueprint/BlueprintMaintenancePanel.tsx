/**
 * Workspace-following pure dialog.
 * Note: 右侧只剩 Janus 对话，切工作区即换维护目标 — see .agents/notes/2026-09-25-blueprint-workspace-dialog--5480ef6d.md
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useBlueprintStore } from '@/stores/blueprint'
import { useWorkspaceStore } from '@/stores/workspace'
import { useI18n } from '@/i18n/useI18n'
import { JanusChat } from '../janus/JanusChat'
import { useJanusChatRegistry } from '../janus/JanusChatProvider'
import type { EngineeringContext } from '../../../../shared/ipc/janus-chat'

interface BlueprintMaintenancePanelProps { onClose: () => void }

function PanelFrame({ onClose, children }: BlueprintMaintenancePanelProps & { children: React.ReactNode }) {
  const { t } = useI18n('blueprint')
  return <aside className="bp-maintenance-panel" aria-label={t('blueprint:maintenance.consoleAria')}>
    <header className="bp-maintenance-panel__header">
      <div className="bp-maintenance-janus-head"><span className="bp-maintenance-janus-dot" aria-hidden="true" /><strong>Janus</strong></div>
      <button type="button" className="bp-panel-close" onClick={onClose} aria-label={t('blueprint:maintenance.closeConsole')}><X size={16} /></button>
    </header>
    {children}
  </aside>
}

export function BlueprintMaintenancePanel({ onClose }: BlueprintMaintenancePanelProps) {
  const { t } = useI18n('blueprint')
  const activeWorkspaceId = useWorkspaceStore(state => state.activeWorkspaceId)
  const workspaces = useWorkspaceStore(state => state.workspaces)
  const activeWorkspace = workspaces.find(item => item.id === activeWorkspaceId) ?? null
  if (!activeWorkspace) {
    return <PanelFrame onClose={onClose}><p>{t('blueprint:view.emptySelectHint')}</p></PanelFrame>
  }
  return <WorkspaceChatColumn key={activeWorkspace.id} workspaceId={activeWorkspace.id} workspaceName={activeWorkspace.name} onClose={onClose} />
}

function WorkspaceChatColumn({ workspaceId, workspaceName, onClose }: BlueprintMaintenancePanelProps & { workspaceId: string; workspaceName: string }) {
  const { t } = useI18n('blueprint')
  const registry = useJanusChatRegistry()
  const blueprints = useBlueprintStore(state => state.blueprints)
  const currentBlueprint = useBlueprintStore(state => state.currentBlueprint)
  const blueprintWorkspace = useBlueprintStore(state => state.blueprintWorkspace)
  const workspaces = useWorkspaceStore(state => state.workspaces)
  const activeWorkspace = workspaces.find(item => item.id === workspaceId) ?? null
  const activePath = activeWorkspace?.path ?? null

  // 对话跟随工作区：优先复用归属该 checkout 的蓝图身份（胶囊与旧视图引用保持兼容），
  // 无归属蓝图时退化为工作区级会话。
  const target = useMemo(() => {
    if (activePath) {
      const match = blueprints.find(item => blueprintWorkspace[item.id] === activePath)
      if (match) {
        const rootUri = match.id === currentBlueprint?.id
          ? currentBlueprint.nodes[currentBlueprint.rootNodeId]?.sourceUri
          : undefined
        return {
          ownerRepoId: rootUri?.split('/')[2] ?? workspaceId,
          viewId: match.id,
          title: match.name ?? workspaceName,
        }
      }
      if (currentBlueprint && blueprintWorkspace[currentBlueprint.id] === activePath) {
        const rootUri = currentBlueprint.nodes[currentBlueprint.rootNodeId]?.sourceUri
        return {
          ownerRepoId: rootUri?.split('/')[2] ?? workspaceId,
          viewId: currentBlueprint.id,
          title: currentBlueprint.name,
        }
      }
    }
    return { ownerRepoId: workspaceId, viewId: `workspace:${workspaceId}`, title: workspaceName }
  }, [activePath, blueprints, blueprintWorkspace, currentBlueprint, workspaceId, workspaceName])

  const engineeringContext: EngineeringContext = useMemo(() => ({
    domain: 'project' as const,
    intent: 'maintain' as const,
    scope: 'view' as const,
    repoIds: [],
    viewRef: { ownerRepoId: target.ownerRepoId, viewId: target.viewId },
    noteRefs: [],
  }), [target])
  const engineeringKey = JSON.stringify(engineeringContext)
  const bindingKey = useRef('')
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!registry.persistenceReady) return
    const key = `${engineeringKey}|${workspaceId}`
    if (bindingKey.current === key) return
    bindingKey.current = key
    const id = registry.bindProject(engineeringContext, [workspaceId], target.title)
    const chat = registry.getController(id)
    chat.setEngineeringContext(engineeringContext)
    chat.setApprovalMode('plan')
    for (const resource of chat.resourceController.resources) {
      if (resource.workspaceId !== workspaceId) chat.resourceController.detachWorkspace(resource.workspaceId)
    }
    chat.resourceController.attachWorkspace(workspaceId)
    setConversationId(id)
  }, [registry, engineeringKey, workspaceId, target.title, engineeringContext])

  const chat = conversationId ? registry.getController(conversationId) : null
  const bound = !!chat
    && chat.conversationId === conversationId
    && chat.engineeringContext?.viewRef?.viewId === target.viewId
    && chat.resourceController.resources.some(item => item.workspaceId === workspaceId)

  return <PanelFrame onClose={onClose}>
    <div className="bp-maintenance-context" aria-live="polite">
      <strong>{activeWorkspace?.name ?? workspaceName}</strong>
      <span>{t('blueprint:maintenance.scopeBlueprint')}</span>
    </div>
    {bound && chat ? <div className="bp-maintenance-task">
      <JanusChat visible docked focused modeColor="#ff7830" messages={chat.messages}
        pendingContent={chat.pendingContent} isStreaming={chat.isStreaming} error={chat.error}
        modelOptions={chat.modelOptions} activeModel={chat.activeModel} modelNotice={chat.modelNotice}
        resourceController={chat.resourceController} toolTraces={chat.toolTraces} conversationController={chat}
        onSelectModel={chat.selectModel} onSend={chat.send} onRewrite={chat.rewrite}
        onStop={chat.stop} onRetry={chat.retry} onClear={chat.clear} />
    </div> : <p className="bp-maintenance-connecting" role="status">{t('blueprint:toolbar.loading')}</p>}
  </PanelFrame>
}
