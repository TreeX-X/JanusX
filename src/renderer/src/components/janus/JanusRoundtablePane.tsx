import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { UsersRound } from 'lucide-react'
import type { JanusResourceController, Message } from './useJanusChat'
import { RoundtableStage, type RoundtableRole, type RoundtableStageParticipant } from './RoundtableStage'
import type { AgentResultCard } from '../../../../shared/roundtable/events'
import type { RoundtableState } from '../../../../shared/roundtable/events'
import { EMPTY_AGENT_WORK_PROJECTION, reduceAgentWorkEvent, type AgentWorkProjection } from './agentWorkProjection'
import { AgentResultCard as AgentResultCardView } from './AgentResultCard'

interface JanusRoundtablePaneProps {
  className?: string
  onClose: () => void
  embedded?: boolean
  resourceController: JanusResourceController
  parchmentOpen: boolean
  parchmentDetailOpen: boolean
  onToggleParchment: () => void
  onOpenParchmentDetail: () => void
  center?: (onSend: (text: string) => void, messages: Message[], workingRole: RoundtableRole | null, cards: AgentResultCard[]) => ReactNode
  workingAgents?: string[]
  resultCards?: AgentResultCard[]
  onOpenAgentResult?: (card: AgentResultCard) => void
  onStateChange?: (state: RoundtableState | null) => void
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
  parchmentOpen,
  parchmentDetailOpen,
  onToggleParchment,
  onOpenParchmentDetail,
  center,
  workingAgents = [],
  resultCards = [],
  onOpenAgentResult,
  onStateChange,
}: JanusRoundtablePaneProps) {
  void onClose
  void resourceController
  const [roundtableState, setRoundtableState] = useState<RoundtableState | null>(null)
  const [work, setWork] = useState<AgentWorkProjection>(EMPTY_AGENT_WORK_PROJECTION)
  const [userMessages, setUserMessages] = useState<Message[]>([])
  // Optimistic UI keeps the work deck responsive while the first runtime event
  // is still crossing IPC.
  const [optimisticRun, setOptimisticRun] = useState(false)
  const updateState = (next: RoundtableState | null) => {
    setRoundtableState(next)
    if (next?.cards?.length) setWork((current) => ({ ...current, cards: next.cards }))
    onStateChange?.(next)
  }

  useEffect(() => window.electron.roundtable?.onEvent((event) => {
    setWork((current) => reduceAgentWorkEvent(current, event))
      setRoundtableState((current) => {
      if (!current) return current
      if (event.type === 'session:ended') { setOptimisticRun(false); return { ...current, phase: 'ended' } }
      if (event.type === 'round:started') return { ...current, phase: 'running', roundNumber: event.roundNumber, userInput: event.userInput }
      if (event.type === 'round:awaiting-user') { setOptimisticRun(false); return { ...current, phase: 'awaiting-user', roundNumber: event.roundNumber } }
      return current
      })
  }) ?? (() => undefined), [])

  const handleCenterSend = async (text: string) => {
    try {
      const current = roundtableState
      const trimmed = text.trim()
      if (trimmed) {
        setOptimisticRun(true)
        setUserMessages((messages) => [...messages, {
          id: `roundtable-user-${Date.now()}-${messages.length}`,
          role: 'user' as const, content: trimmed, timestamp: Date.now(),
        }])
      }
      if (!current || current.phase === 'idle' || current.phase === 'ended') {
        if (!window.electron.roundtable) return
        const next = await window.electron.roundtable.start(text)
        updateState(next)
        return
      }
      if (current.phase === 'awaiting-user' && current.sessionId) {
        if (!window.electron.roundtable) return
        const next = await window.electron.roundtable.advance(current.sessionId, text)
        updateState(next)
      }
    } catch {
      // Chat owns its own error surface; runtime errors are reflected by the event stream.
    }
  }
  const handleEnd = async () => {
    if (!roundtableState?.sessionId || roundtableState.phase === 'running') return
    if (!window.electron.roundtable) return
    const next = await window.electron.roundtable.end(roundtableState.sessionId)
    setOptimisticRun(false)
    updateState(next)
  }
  const roundtableMessages = userMessages
  const activeAgentIds = work.workingAgents.length > 0 ? work.workingAgents : (optimisticRun || roundtableState?.phase === 'running') ? ['refiner-1', 'challenger-1'] : []
  const liveAgentCards = useMemo<AgentResultCard[]>(() => activeAgentIds.map((agentId) => ({
    id: `working-${agentId}`, sessionId: roundtableState?.sessionId ?? '', roundId: `round-${roundtableState?.roundNumber ?? 0}`,
    agentId, role: agentId.startsWith('challenger') ? 'challenger' : 'refiner',
    title: agentId === 'refiner-1' ? '议题解决者' : '议题完善者', status: 'working', summary: '正在分析本轮上下文并准备结构化结果…',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), sourceEventIds: [],
  })), [activeAgentIds, roundtableState?.roundNumber, roundtableState?.sessionId])
  const deckCards = [...liveAgentCards, ...work.cards]
  const workingRole = activeAgentIds[0] === 'refiner-1' ? 'agent-1' : activeAgentIds[0] === 'challenger-1' ? 'agent-2' : null

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
              workingRole={workingRole}
              ended={false}
              parchmentOpen={parchmentOpen}
              onToggleParchment={onToggleParchment}
            />
          </aside>
          <main className="janus-roundtable-center">
            <div className="janus-roundtable-dialog-toolbar" aria-label="会议操作">
              <span className="janus-roundtable-dialog-status">{roundtableState?.phase === 'awaiting-user' ? `第 ${roundtableState.roundNumber} 轮已完成` : '讨论进行中'}</span>
              <div className="janus-roundtable-dialog-actions">
                {roundtableState?.phase === 'awaiting-user' && <button type="button" className="janus-roundtable-advance" onClick={() => void handleCenterSend('')}>开启下一轮</button>}
                {roundtableState?.phase === 'awaiting-user' && <button type="button" className="janus-roundtable-end" onClick={() => void handleEnd()}>结束会议</button>}
              </div>
            </div>
            {center?.(handleCenterSend, roundtableMessages, workingRole, deckCards)}
          </main>
          <aside className="janus-roundtable-state">
            <div className="janus-roundtable-agent-deck" aria-label="Agent 工作卡片">
              <div className="janus-roundtable-deck-heading"><span>AGENT WORK DECK</span><small>{deckCards.length} ITEMS</small></div>
              {deckCards.length === 0 ? <p className="janus-roundtable-deck-empty">等待 Agent 返回可追溯结果</p> : deckCards.map((card) => (
                <AgentResultCardView key={card.id} card={card} onOpen={() => onOpenAgentResult?.(card)} />
              ))}
            </div>
            <button
              type="button"
              className="janus-roundtable-parchment-expand"
              aria-label="展开羊皮纸"
              title="展开羊皮纸"
              aria-expanded={parchmentDetailOpen}
              aria-controls="janus-roundtable-parchment-detail"
              onClick={onOpenParchmentDetail}
            >
              <span className="janus-greek-expand-mark" aria-hidden="true">⟫</span>
            </button>
          </aside>
        </div>
      </div>
    </div>
  )
}
