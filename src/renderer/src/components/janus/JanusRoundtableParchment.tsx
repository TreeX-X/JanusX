import type { ParchmentDocument } from '../../../../shared/roundtable/events'

interface JanusRoundtableParchmentProps {
  detailed?: boolean
  document?: ParchmentDocument
}

const parchmentSections = [
  { title: 'CURRENT CONCLUSION', content: 'Waiting for a roundtable topic. Confirmed decisions will be organized here after the discussion begins.' },
  { title: 'OPEN QUESTIONS', content: 'No unresolved items yet. Agent concerns, boundaries, and validation tasks will remain linked to their sources.' },
  { title: 'NEXT ACTIONS', content: 'No actions yet. Only actions confirmed by the host will enter this section.' },
]

export function JanusRoundtableParchment({ detailed = false, document }: JanusRoundtableParchmentProps) {
  const human = document?.humanReadable
  if (detailed) {
    // Shares the agent-result detail visual language (dark archive panel):
    // same eyebrow, headings, summary rule and evidence box, no paper theme.
    const sections = human ? [
      { title: 'CONFIRMED DECISIONS', content: human.decisions.join('\n') || 'No confirmed decisions yet.' },
      { title: 'KEY EVIDENCE', content: human.evidence.join('\n') || 'No evidence recorded yet.' },
      { title: 'OPEN QUESTIONS & RISKS', content: human.risks.join('\n') || 'No unresolved items yet.' },
      { title: 'PENDING VALIDATION', content: human.pending.join('\n') || 'Nothing awaiting validation.' },
      { title: 'CONFLICTS', content: human.conflicts.length ? human.conflicts.map((item) => `[${item.status}] ${item.topic}`).join('\n') : 'No open conflicts.' },
      { title: 'NEXT ACTIONS', content: human.actions.join('\n') || 'No actions yet.' },
    ] : parchmentSections
    return (
      <div className="janus-agent-result-detail janus-roundtable-parchment" data-detailed={detailed}>
        <div className="janus-agent-result-detail__eyebrow">DECISION RECORD // {human ? (human.draft ? 'DRAFT' : 'FINAL') : 'WAITING'}</div>
        <h2>{document?.title ?? '圆桌会议'}</h2>
        <p className="janus-agent-result-detail__summary">{human?.conclusion ?? 'A concise, traceable record of decisions, evidence, risks, and actions from the roundtable.'}</p>
        {sections.map((section) => (
          <section key={section.title}>
            <h3>{section.title}</h3>
            <p>{section.content}</p>
          </section>
        ))}
        <div className="janus-agent-result-detail__evidence">
          <strong>Source index</strong>
          <span>{human?.draft ? 'DRAFT · ' : ''}{human?.sourceEventIds.join(', ') || 'The discussion has not started.'}</span>
        </div>
      </div>
    )
  }
  return (
    <div className="janus-roundtable-parchment" data-detailed={detailed}>
      <div className="janus-roundtable-parchment-meta">
        <span>DECISION RECORD</span>
        <small>{human ? (human.draft ? 'DRAFT' : 'FINAL') : 'AWAITING TOPIC'}</small>
      </div>
      <div className="janus-roundtable-parchment-origin">
        <strong>JanusX</strong>
        <span>STRUCTURED DECISION RECORD</span>
        <small>ROUND TABLE / SHARED RECORD</small>
      </div>
      <p className="janus-roundtable-parchment-lead">
        A concise, traceable record of decisions, evidence, risks, and actions from the roundtable.
      </p>
    </div>
  )
}
