import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useBlueprintStore } from '@/stores/blueprint'
import { BlueprintView } from './BlueprintView'
import './blueprint.css'

interface BlueprintWorkbenchProps {
  isOpen: boolean
  onClose: () => void
}

export function BlueprintWorkbench({ isOpen, onClose }: BlueprintWorkbenchProps) {
  const blueprints = useBlueprintStore((s) => s.blueprints)
  const currentBlueprint = useBlueprintStore((s) => s.currentBlueprint)
  const activeSession = useBlueprintStore((s) => s.activeSession)

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
    <div className="blueprint-workbench-backdrop">
      <section className="blueprint-workbench-shell" aria-label="Blueprint Workbench">
        <header className="blueprint-workbench-header">
          <div className="blueprint-workbench-brand">
            <div className="blueprint-workbench-mark" />
            <div className="blueprint-workbench-titleblock">
              <div className="blueprint-workbench-title">Blueprint Workbench</div>
              <div className="blueprint-workbench-subtitle">
                Plan graph / node execution / Janus reconciliation
              </div>
            </div>
          </div>

          <div className="blueprint-workbench-metrics" aria-label="Blueprint summary">
            <div>
              <span>Blueprints</span>
              <strong>{Math.max(blueprints.length, currentBlueprint ? 1 : 0)}</strong>
            </div>
            <div>
              <span>Nodes</span>
              <strong>{nodeCount}</strong>
            </div>
            <div data-attention={pendingCandidateCount > 0 ? 'true' : 'false'}>
              <span>Inbox</span>
              <strong>{pendingCandidateCount}</strong>
            </div>
            <div data-attention={focusedTitle ? 'true' : 'false'} className="blueprint-workbench-focus-metric">
              <span>Focus</span>
              <strong>{focusedTitle || 'None'}</strong>
            </div>
          </div>

          <button type="button" className="blueprint-workbench-close" onClick={onClose} title="Close Blueprint Workbench">
            Close
          </button>
        </header>

        <div className="blueprint-workbench-body">
          <BlueprintView density="workbench" />
        </div>
      </section>
    </div>,
    document.body,
  )
}
