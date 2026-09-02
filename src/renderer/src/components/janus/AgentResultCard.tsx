import type { AgentResultCard as AgentResultCardModel } from '../../../../shared/roundtable/events'

export function AgentResultCard({ card, onOpen }: { card: AgentResultCardModel; onOpen?: () => void }) {
  const completed = card.status === 'completed' || card.status === 'done' || card.status === 'failed'
  return <button type="button" className="janus-agent-result-card" onClick={completed ? onOpen : undefined} disabled={!completed} aria-label={`${card.title}: ${card.status}`}>
    <span className="janus-agent-result-card__status" data-status={card.status}>{card.status}</span>
    <strong>{card.title}</strong>
    <span>{card.summary}</span>
  </button>
}
