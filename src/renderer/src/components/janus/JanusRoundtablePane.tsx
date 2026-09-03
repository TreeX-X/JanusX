import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { UsersRound } from 'lucide-react'
import type { JanusResourceController, Message } from './useJanusChat'
import { RoundtableStage, type RoundtableRole, type RoundtableStageParticipant } from './RoundtableStage'
import type { AgentResultCard } from '../../../../shared/roundtable/events'
import type { RoundtableState } from '../../../../shared/roundtable/events'
import { EMPTY_AGENT_WORK_PROJECTION, reconcilePendingUserMessages, reduceAgentWorkEvent, type AgentWorkProjection, type PendingUserInput } from './agentWorkProjection'
import { AgentResultCard as AgentResultCardView } from './AgentResultCard'

const ROUNDTABLE_SESSION_KEY = 'janusx.roundtable.sessionId'

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
  const [pendingInputs, setPendingInputs] = useState<PendingUserInput[]>([])
  const restoreAttempted = useRef(false)
  // Stage E: at-most-once dispatch per click. Renderer state lags behind the
  // main process, so rapid clicks would otherwise send duplicate IPC calls.
  const dispatchBusy = useRef(false)
  // Optimistic UI keeps the work deck responsive while the first runtime event
  // is still crossing IPC.
  const [optimisticRun, setOptimisticRun] = useState(false)
  const updateState = (next: RoundtableState | null) => {
    setRoundtableState(next)
    if (next?.cards?.length) setWork((current) => ({ ...current, cards: next.cards }))
    if (next) setPendingInputs((items) => reconcilePendingUserMessages(next.userMessages, items))
    onStateChange?.(next)
  }

  // Stage D: the store is the stable source. Reattach to the last session on
  // mount (Island remount, refresh) instead of starting blank.
  useEffect(() => {
    try {
      if (roundtableState?.sessionId) localStorage.setItem(ROUNDTABLE_SESSION_KEY, roundtableState.sessionId)
    } catch { /* private mode: stay memory-only */ }
  }, [roundtableState?.sessionId])

  useEffect(() => {
    if (roundtableState || restoreAttempted.current) return
    restoreAttempted.current = true
    let id: string | null = null
    try { id = localStorage.getItem(ROUNDTABLE_SESSION_KEY) } catch { id = null }
    if (!id || !window.electron.roundtable) return
    let cancelled = false
    void window.electron.roundtable.restore(id).then((restored) => {
      if (!restored || cancelled) return
      updateState(restored)
    }).catch(() => undefined)
    return () => { cancelled = true; restoreAttempted.current = false }
  })

  useEffect(() => window.electron.roundtable?.onEvent((event) => {
    setWork((current) => reduceAgentWorkEvent(current, event))
    // user:message events arrive before the start/advance round-trip resolves,
    // so the discussion stream stays responsive and survives remounts.
    if (event.type === 'user:message') {
      setRoundtableState((current) => {
        if (!current || current.sessionId !== event.sessionId) return current
        if (current.userMessages.some((item) => item.id === event.message.id)) return current
        return { ...current, userMessages: [...current.userMessages, event.message] }
      })
      // NOTE: do NOT clear pendingInputs here. On initial start current is
      // null (no session yet), so the state update above is a no-op while the
      // start() IPC stays pending for the whole first round. Clearing pending
      // on the event would make the just-sent user bubble vanish until the
      // round completes. Render already dedupes pending vs confirmed, and
      // updateState() reconciles pending once start()/advance() resolves.
      return
    }
      setRoundtableState((current) => {
      if (!current) return current
      if (event.type === 'session:ended') { setOptimisticRun(false); return { ...current, phase: 'ended' } }
      if (event.type === 'round:started') return { ...current, phase: 'running', roundNumber: event.roundNumber, userInput: event.userInput }
      if (event.type === 'round:awaiting-user') { setOptimisticRun(false); return { ...current, phase: 'awaiting-user', roundNumber: event.roundNumber } }
      return current
      })
  }) ?? (() => undefined), [])

  const handleCenterSend = async (text: string) => {
    const current = roundtableState
    const trimmed = text.trim()
    const willStart = !current || current.phase === 'idle' || current.phase === 'ended'
    const willAdvance = !willStart && current.phase === 'awaiting-user' && !!current.sessionId
    if (!trimmed || (!willStart && !willAdvance)) return
    if (!window.electron.roundtable || dispatchBusy.current) return
    // Optimistic UI: show the user bubble on the right immediately, while the
    // left agent deck shows working cards. The pending entry survives until
    // start()/advance() resolves and updateState() reconciles it against the
    // confirmed userMessages.
    const pendingId = `roundtable-user-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const targetRound = willStart ? 1 : (current?.roundNumber ?? 0) + 1
    const pendingTimestamp = Date.now()
    setOptimisticRun(true)
    setPendingInputs((items) => [...items, {
      id: pendingId,
      content: trimmed, roundNumber: targetRound, timestamp: pendingTimestamp,
    }])
    try {
      if (willStart) {
        dispatchBusy.current = true
        try {
          const next = await window.electron.roundtable.start({
            prompt: text,
            workspaceResources: resourceController.resources.map(({ workspaceId, workspacePath, workspaceName }) => ({ workspaceId, workspacePath, workspaceName })),
          })
          updateState(next)
        } finally {
          dispatchBusy.current = false
        }
        return
      }
      if (willAdvance && current?.sessionId) {
        dispatchBusy.current = true
        try {
          const requestId = `advance-${Date.now()}-${Math.random().toString(36).slice(2)}`
          const next = await window.electron.roundtable.advance(current.sessionId, text, requestId)
          updateState(next)
        } finally {
          dispatchBusy.current = false
        }
      }
    } catch {
      // Dispatch failed: roll back the optimistic bubble so a retry shows a
      // single message. Runtime errors otherwise surface via the event stream.
      setPendingInputs((items) => items.filter((item) => item.id !== pendingId))
      setOptimisticRun(false)
    }
  }
  const handleEnd = async () => {
    if (!roundtableState?.sessionId || roundtableState.phase === 'running' || dispatchBusy.current) return
    if (!window.electron.roundtable) return
    dispatchBusy.current = true
    try {
      await window.electron.roundtable.end(roundtableState.sessionId)
    } catch {
      // End failures still clear the dialog; the error surfaces via events.
    } finally {
      dispatchBusy.current = false
    }
    // Product rule: ending a meeting clears the dialog. Ended sessions are
    // not persisted for restore, so drop the session key and all local state.
    try { localStorage.removeItem(ROUNDTABLE_SESSION_KEY) } catch { /* private mode */ }
    setRoundtableState(null)
    setWork(EMPTY_AGENT_WORK_PROJECTION)
    setPendingInputs([])
    setOptimisticRun(false)
    onStateChange?.(null)
  }
  const dialogStatus = !roundtableState || roundtableState.phase === 'idle' || roundtableState.phase === 'ended'
    ? (optimisticRun || pendingInputs.length > 0
        ? `第 ${pendingInputs[0]?.roundNumber ?? 1} 轮讨论中`
        : '等待议题')
    : roundtableState.phase === 'running'
      ? `第 ${roundtableState.roundNumber} 轮讨论中`
      : `第 ${roundtableState.roundNumber} 轮已完成`
  const roundtableMessages: Message[] = [
    ...(roundtableState?.userMessages ?? []).map((item) => ({
      id: item.id, role: 'user' as const, content: item.text, timestamp: Date.parse(item.createdAt) || 0,
    })),
    ...pendingInputs
      .filter((item) => !(roundtableState?.userMessages.some((msg) => msg.text === item.content && msg.roundNumber === item.roundNumber)))
      .map((item) => ({ id: item.id, role: 'user' as const, content: item.content, timestamp: item.timestamp })),
  ]
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
              <span className="janus-roundtable-dialog-status">{dialogStatus}</span>
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
              {work.toolCalls.length > 0 ? (
                <div className="janus-roundtable-tool-trace" aria-label="工作区读取记录">
                  <div className="janus-roundtable-tool-trace-heading"><span>WORKSPACE READS</span><small>{work.toolCalls.filter((item) => item.status === 'started').length} ACTIVE / {work.toolCalls.length}</small></div>
                  {work.toolCalls.slice(-5).map((tool) => (
                    <div key={tool.toolCallId} className="janus-roundtable-tool-trace-item" data-status={tool.status}>
                      <span className="janus-roundtable-tool-trace-name">{tool.toolName}</span>
                      <span className="janus-roundtable-tool-trace-state">{tool.status === 'started' ? '读取中…' : tool.status}</span>
                      {tool.status === 'failed' ? (
                        <details className="janus-roundtable-tool-trace-error">
                          <summary>{tool.errorCode ?? 'FAILED'}</summary>
                          <p>{tool.error}</p>
                        </details>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
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
