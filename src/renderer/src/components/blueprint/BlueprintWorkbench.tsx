import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight } from 'lucide-react'
import { useBlueprintStore } from '@/stores/blueprint'
import { JanusIdentityCore } from '@/components/janus/JanusIdentityCore'
import { BlueprintView } from './BlueprintView'
import { BlueprintSelectPortalContext } from './blueprintSelectPortal'
import { BlueprintMaintenancePanel } from './BlueprintMaintenancePanel'
import { useBlueprintMaintenanceStore } from '@/stores/blueprint-maintenance'
import { WorkbenchIcon } from '../ui/WorkbenchIcon'
import { useI18n } from '@/i18n/useI18n'
import './blueprint.css'

interface BlueprintWorkbenchProps {
  isOpen: boolean
  onClose: () => void
}

export function BlueprintWorkbench({ isOpen, onClose }: BlueprintWorkbenchProps) {
  const { t } = useI18n('blueprint')
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

  // Delayed unmount: keep portal alive during exit animation
  const [rendered, setRendered] = useState(isOpen)
  const closingRef = useRef(false)
  useEffect(() => {
    if (isOpen) {
      closingRef.current = false
      setRendered(true)
      return
    }
    if (!rendered) return
    closingRef.current = true
    const timer = setTimeout(() => {
      closingRef.current = false
      setRendered(false)
    }, 320)
    return () => clearTimeout(timer)
  }, [isOpen, rendered])

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
    if (!currentBlueprint) return { tone: 'disabled', label: t('blueprint:workbench.stateDisconnected') }
    if (!maintenanceTask) return { tone: 'idle', label: t('blueprint:workbench.stateStandby') }
    if (maintenanceTask.status === 'analyzing' || maintenanceTask.status === 'applying') {
      return { tone: 'working', label: maintenanceTask.status === 'applying' ? t('blueprint:workbench.stateApplying') : t('blueprint:workbench.stateAnalyzing') }
    }
    if (maintenanceTask.status === 'proposal-ready') return { tone: 'attention', label: t('blueprint:workbench.statePendingReview') }
    if (maintenanceTask.status === 'failed' || maintenanceTask.status === 'stale') return { tone: 'error', label: t('blueprint:workbench.stateNeedAttention') }
    return { tone: 'active', label: t('blueprint:workbench.stateInConversation') }
  }, [currentBlueprint, maintenanceTask, t])
  const maintenanceIdentityState = maintenanceState.tone === 'working'
    ? 'scanning'
    : maintenanceState.tone === 'error'
      ? 'failed'
      : maintenanceState.tone === 'active'
        ? 'running'
        : 'default'

  if (!rendered) return null
  const isClosing = closingRef.current

  const nodeCount = currentBlueprint?.nodeIds.length ?? 0
  const pendingCandidateCount =
    currentBlueprint?.requirementCandidates?.filter((candidate) => candidate.status === 'pending').length ?? 0
  const focusedTitle =
    activeSession && currentBlueprint?.id === activeSession.blueprintId
      ? currentBlueprint.nodes[activeSession.nodeId]?.title ?? activeSession.nodeSnapshot.title
      : activeSession?.nodeSnapshot.title ?? ''

  return createPortal(
    <BlueprintSelectPortalContext.Provider value={selectPortalNode}>
      <div className="blueprint-workbench-backdrop" data-closing={isClosing ? "true" : undefined}>
        <section className="blueprint-workbench-shell" data-closing={isClosing ? "true" : undefined} aria-label={t('blueprint:workbench.ariaLabel')}>
        <header className="blueprint-workbench-header">
          <div className="blueprint-workbench-header-left">
            <span className="blueprint-workbench-icon-badge" aria-hidden="true">
              <WorkbenchIcon id="blueprint" />
            </span>
            <nav className="blueprint-workbench-breadcrumb" aria-label="Breadcrumb">
              <span className="blueprint-workbench-bc-current">{t('blueprint:workbench.breadcrumb')}</span>
            </nav>
          </div>

          <div className="blueprint-workbench-metrics" aria-label="Blueprint summary">
            <div className="blueprint-workbench-metric">
              <span className="blueprint-workbench-metric__label">{t('blueprint:workbench.metricBlueprints')}</span>
              <strong className="blueprint-workbench-metric__value">{Math.max(blueprints.length, currentBlueprint ? 1 : 0)}</strong>
            </div>
            <div className="blueprint-workbench-metric">
              <span className="blueprint-workbench-metric__label">{t('blueprint:workbench.metricNodes')}</span>
              <strong className="blueprint-workbench-metric__value">{nodeCount}</strong>
            </div>
            <div className="blueprint-workbench-metric" data-attention={pendingCandidateCount > 0 ? 'true' : 'false'}>
              <span className="blueprint-workbench-metric__label">{t('blueprint:workbench.metricInbox')}</span>
              <strong className="blueprint-workbench-metric__value">{pendingCandidateCount}</strong>
            </div>
            <div className="blueprint-workbench-metric blueprint-workbench-metric--focus" data-attention={focusedTitle ? 'true' : 'false'}>
              <span className="blueprint-workbench-metric__label">{t('blueprint:workbench.metricFocus')}</span>
              <strong className="blueprint-workbench-metric__value" title={focusedTitle || undefined}>{focusedTitle || t('blueprint:workbench.metricFocusFallback')}</strong>
            </div>
          </div>

          <div className="blueprint-workbench-actions">
            <button
              type="button"
              className="blueprint-janus-capsule"
              data-state={maintenanceState.tone}
              disabled={!currentBlueprint}
              aria-label={t('blueprint:workbench.copilotOpenAria', { state: maintenanceState.label })}
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
                aria-label={t('blueprint:workbench.copilotIdentityAria', { state: maintenanceState.label })}
              />
              <span className="blueprint-janus-capsule__name">{t('blueprint:workbench.copilotName')}</span>
              <span className="blueprint-janus-capsule__status">
                {maintenanceState.tone === 'working'
                  ? t('blueprint:workbench.statusRunning')
                  : maintenanceState.tone === 'attention'
                    ? t('blueprint:workbench.statusActionRequired')
                    : maintenanceState.tone === 'error'
                      ? t('blueprint:workbench.statusError')
                      : maintenanceState.tone === 'disabled'
                        ? t('blueprint:workbench.statusOffline')
                        : t('blueprint:workbench.statusIdle')}
              </span>
              <ChevronRight className="blueprint-janus-capsule__chevron" size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="blueprint-workbench-close"
              onClick={onClose}
              aria-label={t('blueprint:workbench.closeAria')}
              title={t('blueprint:workbench.closeTitle')}
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
