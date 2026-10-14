import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { PanelRightClose } from 'lucide-react'
import { islandMotionStyle, useIslandReveal, type IslandPhase } from '../island/islandMotion'
import type { CompanionLayout } from '../island/islandLayout'

export type JanusAuxiliaryModuleType = 'roundtable-parchment' | 'agent-result' | 'roundtable-questions' | 'knowledge-detail' | 'runtime-detail' | 'office-preview'
export interface JanusAuxiliaryModuleDescriptor { id: string; type: JanusAuxiliaryModuleType; title: string; ariaLabel: string }
interface JanusAuxiliaryIslandProps { module: JanusAuxiliaryModuleDescriptor; phase: IslandPhase; layout: CompanionLayout; onClose: () => void; children: ReactNode; actions?: ReactNode }

export function JanusAuxiliaryIsland({ module, phase, layout, onClose, children, actions }: JanusAuxiliaryIslandProps) {
  const root = useRef<HTMLElement | null>(null)
  useIslandReveal(root, phase === 'open', module.type)
  return createPortal(<aside ref={element => { root.current = element; if (element) element.inert = phase === 'closing' }} id={module.id} className="janus-auxiliary-island island-surface" data-island-companion data-side="right" data-phase={phase} data-layout={layout.mode} data-module={module.type} aria-label={module.ariaLabel} style={{ ...islandMotionStyle, left: layout.companion.left, top: layout.companion.top, width: layout.companion.width, height: layout.companion.height }} onPointerDown={event => event.stopPropagation()} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') onClose() }}>
    <div className="janus-auxiliary-shell">
        <header className="janus-auxiliary-header janus-auxiliary-header--minimal" data-island-reveal>
          {actions ? <div className="janus-auxiliary-actions">{actions}</div> : null}
          <button type="button" className="janus-auxiliary-close" aria-label="Collapse parchment" title="Collapse parchment" onClick={onClose}>
          <PanelRightClose size={15} strokeWidth={1.7} aria-hidden="true" />
        </button>
      </header>
      <div className="janus-auxiliary-content" data-island-reveal>{children}</div>
    </div>
  </aside>, document.body)
}
