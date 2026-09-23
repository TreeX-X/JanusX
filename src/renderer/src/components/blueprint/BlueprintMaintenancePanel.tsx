/**
 * @file 蓝图右侧对话列（V2）
 * @description
 *  右列只有对话功能：JanusChat（chipless composer，plan-first）。
 *  机器面（提案/审计/撤销/迁移/start 表单/tabs）已移除——变更走对话 +
 *  Agent 事务与原生审批轨；main 侧 service/IPC 保留，能力不断不断档，
 *  待 agent 接管 apply 后重新接线。样式见 ./blueprint.css。
 */
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useBlueprintStore } from '@/stores/blueprint'
import { useBlueprintMaintenanceStore } from '@/stores/blueprint-maintenance'
import { useWorkspaceStore } from '@/stores/workspace'
import { useI18n } from '@/i18n/useI18n'
import { JanusChat } from '../janus/JanusChat'
import { useJanusChatRegistry } from '../janus/JanusChatProvider'
import type { UseJanusChatReturn } from '../janus/useJanusChat'

interface BlueprintMaintenancePanelProps { onClose: () => void }

export function BlueprintMaintenancePanel({ onClose }: BlueprintMaintenancePanelProps) {
  const blueprint = useBlueprintStore((state) => state.currentBlueprint)
  return blueprint?.source === 'harness'
    ? <ProjectChatColumn key={blueprint.id} onClose={onClose} />
    : <ChatPlaceholder onClose={onClose} />
}

function ProjectChatColumn({ onClose }: BlueprintMaintenancePanelProps) {
  const registry = useJanusChatRegistry()
  const blueprint = useBlueprintStore((state) => state.currentBlueprint)!
  const session = useBlueprintStore((state) => state.activeSession)
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const openRequest = useBlueprintMaintenanceStore((state) => state.openRequest)
  const [conversationId, setConversationId] = useState<string>()
  const selected = blueprint.nodes[openRequest?.nodeId ?? blueprint.rootNodeId]
  const repoId = selected?.sourceUri?.split('/')[2]
  const bindProject = registry.bindProject
  const boundExists = !!conversationId && registry.getController(conversationId).conversationId === conversationId
  useEffect(() => {
    if (!registry.persistenceReady || !repoId || boundExists) return
    const workspace = workspaces.find((item) => item.path === session?.workspacePath)
    const boundId = bindProject({
      domain: 'project', intent: 'maintain', scope: 'selected', repoIds: [repoId],
      viewRef: { ownerRepoId: repoId, viewId: blueprint.id },
      noteRefs: selected?.sourceUri ? [{ uri: selected.sourceUri, expectedHash: selected.sourceHash }] : [],
    }, workspace ? [workspace.id] : [], blueprint.name)
    // V2 plan-first: blueprint sessions explore read-only; writes go through
    // per-action approval. Set once at creation; later opens reuse the stored mode.
    registry.getController(boundId).setApprovalMode('plan')
    setConversationId(boundId)
  }, [bindProject, registry, registry.persistenceReady, repoId, blueprint.id, blueprint.name, session?.workspacePath, workspaces, selected?.sourceHash, selected?.sourceUri, boundExists])
  if (!boundExists) return null
  return <ChatColumn onClose={onClose} chat={registry.getController(conversationId)} />
}

function ChatPlaceholder({ onClose }: BlueprintMaintenancePanelProps) {
  const { t } = useI18n('blueprint')
  return (
    <aside className="bp-maintenance-panel" aria-label={t('blueprint:maintenance.consoleAria')}>
      <header className="bp-maintenance-panel__header">
        <div className="bp-maintenance-janus-head">
          <span className="bp-maintenance-janus-dot" aria-hidden="true" />
          <strong>Janus</strong>
        </div>
        <button type="button" className="bp-panel-close" onClick={onClose} aria-label={t('blueprint:maintenance.closeConsole')} title={t('common:action.close')}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <div className="bp-maintenance-history-view">
        <p>{t('blueprint:view.emptySelectHint')}</p>
      </div>
    </aside>
  )
}

function ChatColumn({ onClose, chat }: BlueprintMaintenancePanelProps & { chat: UseJanusChatReturn }) {
  const { t } = useI18n('blueprint')
  return (
    <aside className="bp-maintenance-panel" aria-label={t('blueprint:maintenance.consoleAria')}>
      <header className="bp-maintenance-panel__header">
        <div className="bp-maintenance-janus-head">
          <span className="bp-maintenance-janus-dot" aria-hidden="true" />
          <strong>Janus</strong>
        </div>
        <button type="button" className="bp-panel-close" onClick={onClose} aria-label={t('blueprint:maintenance.closeConsole')} title={t('common:action.close')}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <div className="bp-maintenance-task">
        <JanusChat visible docked compactNavigation focused modeColor="#ff7830" messages={chat.messages}
          pendingContent={chat.pendingContent} isStreaming={chat.isStreaming} error={chat.error}
          modelOptions={chat.modelOptions} activeModel={chat.activeModel} modelNotice={chat.modelNotice}
          resourceController={chat.resourceController} toolTraces={chat.toolTraces} conversationController={chat}
          onSelectModel={chat.selectModel} onSend={chat.send} onRewrite={chat.rewrite}
          onStop={chat.stop} onRetry={chat.retry} onClear={chat.clear} minimalComposer />
      </div>
    </aside>
  )
}
