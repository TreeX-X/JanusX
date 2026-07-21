import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBlueprintStore } from '@/stores/blueprint'
import { BlueprintView } from './BlueprintView'
import { BlueprintSelectPortalContext } from './blueprintSelectPortal'
import './blueprint.css'

interface BlueprintWorkbenchProps {
  isOpen: boolean
  onClose: () => void
}

export function BlueprintWorkbench({ isOpen, onClose }: BlueprintWorkbenchProps) {
  const blueprints = useBlueprintStore((s) => s.blueprints)
  const currentBlueprint = useBlueprintStore((s) => s.currentBlueprint)
  const activeSession = useBlueprintStore((s) => s.activeSession)
  // 工作台专属下拉承载层：z-index 12001，恰好高于遮罩 12000；
  // 零尺寸 + overflow visible，不拦截点击、不裁切子节点。
  // Select 通过 getPortalContainer 把浮层挂进这里，进入比遮罩更高的层叠上下文。
  const [selectPortalNode, setSelectPortalNode] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

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
            <div className="blueprint-workbench-icon-badge" aria-hidden="true">B</div>
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

          <button
            type="button"
            className="blueprint-workbench-close"
            onClick={onClose}
            aria-label="Close Blueprint Workbench"
            title="Close Blueprint Workbench"
          >
            <span aria-hidden="true" />
          </button>
        </header>

        <div className="blueprint-workbench-body">
          <BlueprintView density="workbench" />
        </div>
      </section>
    </div>
      {createPortal(
        <div
          ref={setSelectPortalNode}
          className="blueprint-select-portal-layer"
          aria-hidden="true"
        />,
        document.body
      )}
    </BlueprintSelectPortalContext.Provider>,
    document.body,
  )
}
