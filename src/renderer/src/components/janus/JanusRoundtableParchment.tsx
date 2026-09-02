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
  const sections = document ? [
    { title: 'CURRENT CONCLUSION', content: document.conclusion },
    { title: 'CONFIRMED DECISIONS', content: document.decisions.map((item) => `[${item.status}] ${item.content}`).join('\n') || 'No confirmed decisions yet.' },
    { title: 'KEY EVIDENCE', content: document.evidence.map((item) => item.content).join('\n') || 'No evidence recorded yet.' },
    { title: 'OPEN QUESTIONS & RISKS', content: [...document.unresolved, ...document.risks].map((item) => `[${item.status}] ${item.content}`).join('\n') || 'No unresolved items yet.' },
    { title: 'NEXT ACTIONS', content: document.actions.map((item) => item.content).join('\n') || 'No actions yet.' },
    { title: 'SOURCE INDEX', content: document.sourceEventIds.join(', ') || 'No source events yet.' },
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
          <section>
            <h3>SOURCE INDEX</h3>
            <p>The discussion has not started. No rounds, files, or tool results are available.</p>
          </section>
        </div>
      ) : null}
    </div>
  )
}
