import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight } from 'lucide-react'
import { useBlueprintStore } from '@/stores/blueprint'
import { JanusIdentityCore } from '@/components/janus/JanusIdentityCore'
import { BlueprintView } from './BlueprintView'
import { BlueprintSelectPortalContext } from './blueprintSelectPortal'
import { BlueprintMaintenancePanel } from './BlueprintMaintenancePanel'
import { useBlueprintMaintenanceStore } from '@/stores/blueprint-maintenance'
import { WorkbenchIcon } from '../ui/WorkbenchIcon'
import './blueprint.css'

interface BlueprintWorkbenchProps {
  isOpen: boolean
  onClose: () => void
}

export function BlueprintWorkbench({ isOpen, onClose }: BlueprintWorkbenchProps) {
  const blueprints = useBlueprintStore((s) => s.blueprints)
  const currentBlueprint = useBlueprintStore((s) => s.currentBlueprint)
  const activeSession = useBlueprintStore((s) => s.activeSession)
  const maintenanceTasks = useBlueprintMaintenanceStore((s) => s.tasks)
  const maintenanceInitialized = useBlueprintMaintenanceStore((s) => s.initialized)
  const openRequest = useBlueprintMaintenanceStore((s) => s.openRequest)
  const initializeMaintenance = useBlueprintMaintenanceStore((s) => s.initialize)
  const requestOpen = useBlueprintMaintenanceStore((s) => s.requestOpen)
  const [maintenanceOpen, setMaintenanceOpen] = useState(false)
  // 工作台专属下拉承载层：z-index 12001，恰好高于遮罩 12000；
  // 零尺寸 + overflow visible，不拦截点击、不裁切子节点。
  // Select 通过 getPortalContainer 把浮层挂进这里，进入比遮罩更高的层叠上下文。
  const [selectPortalNode, setSelectPortalNode] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (maintenanceOpen) setMaintenanceOpen(false)
      else onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, maintenanceOpen, onClose])

  useEffect(() => {
    if (isOpen && openRequest) setMaintenanceOpen(true)
  }, [isOpen, openRequest])

  useEffect(() => {
    if (isOpen && !maintenanceInitialized) void initializeMaintenance()
  }, [initializeMaintenance, isOpen, maintenanceInitialized])

  const maintenanceTask = useMemo(
    () => maintenanceTasks.find((task) => task.blueprintId === currentBlueprint?.id && !['completed', 'cancelled'].includes(task.status)) ?? null,
    [currentBlueprint?.id, maintenanceTasks],
  )

  const maintenanceState = useMemo(() => {
    if (!currentBlueprint) return { tone: 'disabled', label: '未连接' }
    if (!maintenanceTask) return { tone: 'idle', label: '待命' }
    if (maintenanceTask.status === 'analyzing' || maintenanceTask.status === 'applying') {
      return { tone: 'working', label: maintenanceTask.status === 'applying' ? '应用中' : '分析中' }
    }
    if (maintenanceTask.status === 'proposal-ready') return { tone: 'attention', label: '待审批' }
    if (maintenanceTask.status === 'failed' || maintenanceTask.status === 'stale') return { tone: 'error', label: '需处理' }
    return { tone: 'active', label: '对话中' }
  }, [currentBlueprint, maintenanceTask])
  const maintenanceIdentityState = maintenanceState.tone === 'working'
    ? 'scanning'
    : maintenanceState.tone === 'error'
      ? 'failed'
      : maintenanceState.tone === 'active'
        ? 'running'
        : 'default'

  if (!isOpen) return null

  const nodeCount = currentBlueprint?.nodeIds.length ?? 0
  const pendingCandidateCount =
    currentBlueprint?.requirementCandidates?.filter((candidate) => candidate.status === 'pending').length ?? 0
  const focusedTitle =
    activeSession && currentBlueprint?.id === activeSession.blueprintId
      ? currentBlueprint.nodes[activeSession.nodeId]?.title ?? activeSession.nodeSnapshot.title
      : activeSession?.nodeSnapshot.title ?? ''

  return createPortal(
    <BlueprintSelectPortalContext.Provider value={selectPortalNode}>
      <div className="blueprint-workbench-backdrop">
        <section className="blueprint-workbench-shell" aria-label="Blueprint Workbench">
        <header className="blueprint-workbench-header">
          <div className="blueprint-workbench-header-left">
            <span className="blueprint-workbench-icon-badge" aria-hidden="true">
              <WorkbenchIcon id="blueprint" />
            </span>
            <nav className="blueprint-workbench-breadcrumb" aria-label="Breadcrumb">
              <span className="blueprint-workbench-bc-current">Blueprint Workbench</span>
            </nav>
          </div>

          <div className="blueprint-workbench-metrics" aria-label="Blueprint summary">
            <div className="blueprint-workbench-metric">
              <span className="blueprint-workbench-metric__label">Blueprints</span>
              <strong className="blueprint-workbench-metric__value">{Math.max(blueprints.length, currentBlueprint ? 1 : 0)}</strong>
            </div>
            <div className="blueprint-workbench-metric">
              <span className="blueprint-workbench-metric__label">Nodes</span>
              <strong className="blueprint-workbench-metric__value">{nodeCount}</strong>
            </div>
            <div className="blueprint-workbench-metric" data-attention={pendingCandidateCount > 0 ? 'true' : 'false'}>
              <span className="blueprint-workbench-metric__label">Inbox</span>
              <strong className="blueprint-workbench-metric__value">{pendingCandidateCount}</strong>
            </div>
            <div className="blueprint-workbench-metric blueprint-workbench-metric--focus" data-attention={focusedTitle ? 'true' : 'false'}>
              <span className="blueprint-workbench-metric__label">Focus</span>
              <strong className="blueprint-workbench-metric__value" title={focusedTitle || undefined}>{focusedTitle || '—'}</strong>
            </div>
          </div>

          <div className="blueprint-workbench-actions">
            <button
              type="button"
              className="blueprint-janus-capsule"
              data-state={maintenanceState.tone}
              disabled={!currentBlueprint}
              aria-label={`打开 Janus Copilot 控制台，当前状态：${maintenanceState.label}`}
              aria-expanded={maintenanceOpen}
              onClick={() => {
                if (!currentBlueprint) return
                if (maintenanceOpen) {
                  setMaintenanceOpen(false)
                  return
                }
                requestOpen({ blueprintId: currentBlueprint.id })
                setMaintenanceOpen(true)
              }}
            >
              <JanusIdentityCore
                identity="main"
                state={maintenanceIdentityState}
                size="pod"
                showHalo={false}
                showScanline={false}
                className="blueprint-janus-capsule__identity"
                aria-label={`Janus ${maintenanceState.label}`}
              />
              <span className="blueprint-janus-capsule__name">JANUS // COPILOT</span>
              <span className="blueprint-janus-capsule__status">
                {maintenanceState.tone === 'working'
                  ? 'RUNNING'
                  : maintenanceState.tone === 'attention'
                    ? 'ACTION_REQUIRED'
                    : maintenanceState.tone === 'error'
                      ? 'ERROR'
                      : maintenanceState.tone === 'disabled'
                        ? 'OFFLINE'
                        : 'IDLE'}
              </span>
              <ChevronRight className="blueprint-janus-capsule__chevron" size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="blueprint-workbench-close"
              onClick={onClose}
              aria-label="Close Blueprint Workbench"
              title="Close Blueprint Workbench"
            >
              <span aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="blueprint-workbench-body">
          <BlueprintView density="workbench" />
          {maintenanceOpen ? <BlueprintMaintenancePanel onClose={() => setMaintenanceOpen(false)} /> : null}
        </div>
      </section>
    </div>
      {createPortal(
        <div
          ref={setSelectPortalNode}
          className="blueprint-select-portal-layer"
        />,
        document.body
      )}
    </BlueprintSelectPortalContext.Provider>,
    document.body,
  )
}
