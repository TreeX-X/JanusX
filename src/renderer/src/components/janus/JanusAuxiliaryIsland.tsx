import type { ReactNode } from 'react'
import { PanelRightClose } from 'lucide-react'

export type JanusAuxiliaryModuleType = 'roundtable-parchment' | 'agent-result' | 'knowledge-detail' | 'runtime-detail' | 'office-preview'
export interface JanusAuxiliaryModuleDescriptor { id: string; type: JanusAuxiliaryModuleType; title: string; ariaLabel: string }
interface JanusAuxiliaryIslandProps { module: JanusAuxiliaryModuleDescriptor; closing?: boolean; onClose: () => void; children: ReactNode }

export function JanusAuxiliaryIsland({ module, closing = false, onClose, children }: JanusAuxiliaryIslandProps) {
  return <aside id={module.id} className={`janus-auxiliary-island${closing ? ' janus-auxiliary-island--closing' : ''}`} data-module={module.type} aria-label={module.ariaLabel}>
    <div className="janus-auxiliary-shell">
        <header className="janus-auxiliary-header janus-auxiliary-header--minimal">
          <button type="button" className="janus-auxiliary-close" aria-label="Collapse parchment" title="Collapse parchment" onClick={onClose}>
          <PanelRightClose size={15} strokeWidth={1.7} aria-hidden="true" />
        </button>
      </header>
      <div className="janus-auxiliary-content">{children}</div>
    </div>
  </aside>
}
