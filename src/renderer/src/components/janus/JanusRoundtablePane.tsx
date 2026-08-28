import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { UsersRound } from 'lucide-react'
import type { JanusResourceController, Message } from './useJanusChat'
import { RoundtableStage, type RoundtableRole, type RoundtableStageParticipant } from './RoundtableStage'

interface JanusRoundtablePaneProps {
  className?: string
  onClose: () => void
  embedded?: boolean
  resourceController: JanusResourceController
  center?: (onSend: (text: string) => void, messages: Message[], workingRole: RoundtableRole | null) => ReactNode
}

const stageParticipants: RoundtableStageParticipant[] = [
  { id: 'user', name: '用户', label: '提议人', identity: 'teammate', color: '#94a3b8' },
  { id: 'host', name: 'JanusX', label: '主持人', identity: 'main', color: '#ff7830' },
  { id: 'agent-1', name: 'Agent-1', label: '议题解决者', identity: 'coder', color: '#67d8ff' },
  { id: 'agent-2', name: 'Agent-2', label: '议题完善者', identity: 'evaluator', color: '#b79cff' },
]

export function JanusRoundtablePane({
  className,
  onClose,
  embedded = false,
  resourceController,
  center,
}: JanusRoundtablePaneProps) {
  const [parchmentOpen, setParchmentOpen] = useState(false)
  void onClose
  void resourceController

  // The old session engine has been removed. Keep the discussion surface mounted
  // so the current layout and workspace attachment interaction remain unchanged.
  const handleCenterSend = (_text: string) => undefined
  const stopPointerPropagation = (event: ReactPointerEvent) => event.stopPropagation()

  return (
    <div
      className={`janus-roundtable-overlay${embedded ? ' janus-roundtable-overlay--embedded' : ''}${className ? ` ${className}` : ''}`}
      role="dialog"
      aria-modal={!embedded}
      aria-label="圆桌会议"
      onPointerDown={stopPointerPropagation}
      onPointerMove={stopPointerPropagation}
      onPointerUp={stopPointerPropagation}
      onPointerCancel={stopPointerPropagation}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div className="janus-roundtable-panel">
        <header className="janus-roundtable-header">
          <div className="janus-roundtable-title">
            <UsersRound size={16} aria-hidden="true" />
            <span>圆桌会议</span>
            <small>准备开始</small>
          </div>
        </header>

        <div className="janus-roundtable-body" data-parchment-open={parchmentOpen}>
          <aside className="janus-roundtable-participants" aria-label="参与者">
            <RoundtableStage
              participants={stageParticipants}
              workingRole={null}
              ended={false}
              parchmentOpen={parchmentOpen}
              onToggleParchment={() => setParchmentOpen((open) => !open)}
            />
          </aside>
          <main className="janus-roundtable-center">
            {center?.(handleCenterSend, [], null)}
          </main>
          <aside className="janus-roundtable-state">
            <div className="janus-roundtable-section-label">共享文档{parchmentOpen ? ' · OPEN' : ''}</div>
            <small>新的圆桌引擎正在重构，当前仅保留视觉与交互。</small>
          </aside>
        </div>
      </div>
    </div>
  )
}
