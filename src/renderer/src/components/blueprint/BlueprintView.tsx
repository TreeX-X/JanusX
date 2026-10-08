// Note: workspace-first selection and recoverable empty states — see .agents/notes/blueprint/requirements/blueprint-empty-init.md
import { useCallback, useEffect, useRef, useState } from 'react'
import './blueprint.css'
import { useI18n } from '@/i18n/useI18n'
import { useBlueprintStore } from '@/stores/blueprint'
import { useWorkspaceStore } from '@/stores/workspace'
import { BlueprintCanvas } from './BlueprintCanvas'
import { BlueprintWorkspaceSelect } from './BlueprintWorkspaceSelect'
import { BlueprintWorkspaceSetup } from './BlueprintWorkspaceSetup'
import { BlueprintMaintenancePanel } from './BlueprintMaintenancePanel'
import { useBlueprintSelectPortal } from './blueprintSelectPortal'
import { useBlueprintMaintenanceStore } from '@/stores/blueprint-maintenance'
import { onHarnessChanged } from '@/services/harness'
import { sameCheckoutPath } from '@/features/blueprint/resolveNodeWorkspace'
import { useNoteRefresh } from './useNoteRefresh'

interface BlueprintViewProps {
  density?: 'embedded' | 'workbench'
  onDetailOpenChange?: (open: boolean) => void
  onRegisterFlush?: (flush: () => Promise<boolean>) => void
}

export function BlueprintView({ density = 'embedded', onDetailOpenChange, onRegisterFlush }: BlueprintViewProps) {
  const { t } = useI18n('blueprint')
  const flushRef = useRef<(() => Promise<boolean>) | null>(null)
  const registerFlush = useCallback((flush: () => Promise<boolean>) => {
    flushRef.current = flush
    onRegisterFlush?.(flush)
  }, [onRegisterFlush])
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore(s => s.workspaces)
  const workspace = workspaces.find(w => w.id === activeWorkspaceId)
  const selectedWorkspaceId = useBlueprintStore(s => s.selectedWorkspaceId)
  const currentBlueprint = useBlueprintStore(s => s.currentBlueprint)
  const workspaceState = useBlueprintStore(s => activeWorkspaceId ? s.workspaceStates[activeWorkspaceId] : undefined)
  const loading = useBlueprintStore(s => s.loading)
  const error = useBlueprintStore(s => s.error)
  const loadWorkspace = useBlueprintStore(s => s.loadWorkspace)
  const refreshWorkspaceStates = useBlueprintStore(s => s.refreshWorkspaceStates)
  const maintenanceOpenRequest = useBlueprintMaintenanceStore(s => s.openRequest)
  const draftRequest = useBlueprintStore(s => s.draftRequest)
  const [embeddedChat, setEmbeddedChat] = useState(false)
  const selectPortal = useBlueprintSelectPortal()
  const workspaceKey = workspaces.map(w => `${w.id}:${w.path}`).join('\u0000')
  useNoteRefresh(selectedWorkspaceId === workspace?.id ? currentBlueprint?.id : undefined, workspace?.path)

  useEffect(() => { void refreshWorkspaceStates() }, [workspaceKey, refreshWorkspaceStates])
  useEffect(() => {
    const store = useBlueprintStore.getState()
    if (store.selectedWorkspaceId !== (workspace?.id ?? null)
      || (workspace && store.workspaceStates[workspace.id]?.workspacePath !== workspace.path && !store.loading)) {
      void loadWorkspace(workspace?.id ?? null)
    }
  }, [workspace, loadWorkspace])

  useEffect(() => {
    if (!workspace || (selectedWorkspaceId === workspace.id && currentBlueprint)) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        void loadWorkspace(workspace.id)
        void refreshWorkspaceStates()
      }, 250)
    }
    const off = onHarnessChanged(event => { if (sameCheckoutPath(event.root, workspace.path)) refresh() })
    window.addEventListener('focus', refresh)
    return () => { off(); clearTimeout(timer); window.removeEventListener('focus', refresh) }
  }, [workspace, selectedWorkspaceId, currentBlueprint, loadWorkspace, refreshWorkspaceStates])

  useEffect(() => {
    if (!maintenanceOpenRequest) return
    const states = useBlueprintStore.getState().workspaceStates
    const target = workspaces.find(w => states[w.id]?.projectId === maintenanceOpenRequest.blueprintId)
    if (target && target.id !== useWorkspaceStore.getState().activeWorkspaceId) void useBlueprintStore.getState().switchWorkspace(target.id)
    useBlueprintMaintenanceStore.getState().clearOpenRequest()
  }, [maintenanceOpenRequest, workspaces])

  useEffect(() => { if (draftRequest?.workspaceId === workspace?.id) setEmbeddedChat(true) }, [draftRequest, workspace?.id])
  const ownsProjection = selectedWorkspaceId === workspace?.id
  const hasNodes = ownsProjection && !!currentBlueprint?.nodeIds.length
  const state = ownsProjection ? workspaceState : undefined

  return <div className={`blueprint-view blueprint-view--${density}${hasNodes ? '' : ' blueprint-view--empty'}`}>
    {density === 'embedded' && <div className="blueprint-toolbar">
      <BlueprintWorkspaceSelect className="blueprint-select blueprint-select--toolbar"
        beforeSwitch={() => flushRef.current?.() ?? Promise.resolve(true)}
        getPortalContainer={selectPortal ? () => selectPortal : undefined} />
    </div>}
    <BlueprintWorkspaceSetup key={workspace?.id ?? 'none'} workspace={workspace} state={state} loading={loading || (!!workspace && !ownsProjection)} hasNodes={hasNodes} />
    {error && hasNodes && <div className="blueprint-toolbar__error" role="alert">{error}</div>}
    {hasNodes && currentBlueprint ? <BlueprintCanvas key={`${workspace?.id}:${currentBlueprint.id}`} blueprintId={currentBlueprint.id}
      onDetailOpenChange={onDetailOpenChange} onRegisterFlush={registerFlush} /> : null}
    {!workspace && <div className="blueprint-view__loading-state">{t('workspace.noWorkspace')}</div>}
    {density === 'embedded' && embeddedChat && workspace && <div className="blueprint-bootstrap-chat">
      <BlueprintMaintenancePanel onClose={() => setEmbeddedChat(false)} />
    </div>}
  </div>
}
