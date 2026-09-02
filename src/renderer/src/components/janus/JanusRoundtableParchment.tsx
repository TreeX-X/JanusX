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
  const sections = human ? [
    { title: 'CURRENT CONCLUSION', content: human.conclusion },
    { title: 'CONFIRMED DECISIONS', content: human.decisions.join('\n') || 'No confirmed decisions yet.' },
    { title: 'KEY EVIDENCE', content: human.evidence.join('\n') || 'No evidence recorded yet.' },
    { title: 'OPEN QUESTIONS & RISKS', content: human.risks.join('\n') || 'No unresolved items yet.' },
    { title: 'NEXT ACTIONS', content: human.actions.join('\n') || 'No actions yet.' },
  ] : parchmentSections
  return (
    <div className="janus-roundtable-parchment" data-detailed={detailed}>
      <div className="janus-roundtable-parchment-meta">
        <span>DECISION RECORD</span>
        <small>AWAITING TOPIC</small>
      </div>
      <div className="janus-roundtable-parchment-origin">
        <strong>JanusX</strong>
        <span>STRUCTURED DECISION RECORD</span>
        <small>ROUND TABLE / SHARED RECORD</small>
      </div>
      <p className="janus-roundtable-parchment-lead">
        A concise, traceable record of decisions, evidence, risks, and actions from the roundtable.
      </p>
      {detailed ? (
        <div className="janus-roundtable-parchment-sections">
          {sections.map((section) => (
            <section key={section.title}>
              <h3>{section.title}</h3>
              <p>{section.content}</p>
            </section>
          ))}
          <section className="janus-roundtable-parchment-traceability">
            <h3>SOURCE INDEX</h3>
            <p>{human?.draft ? 'DRAFT · ' : ''}{human?.sourceEventIds.join(', ') || 'The discussion has not started.'}</p>
          </section>
        </div>
      ) : null}
    </div>
  )
}
