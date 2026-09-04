import { useI18n } from '@/i18n/useI18n'
import type { ParchmentDocument } from '../../../../shared/roundtable/events'

interface JanusRoundtableParchmentProps {
  detailed?: boolean
  document?: ParchmentDocument
}

export function JanusRoundtableParchment({ detailed = false, document }: JanusRoundtableParchmentProps) {
  const { t } = useI18n('janus')
  const human = document?.humanReadable
  if (detailed) {
    // Shares the parchment visual language with the agent-result detail:
    // same Georgia serif headings/body, parchment palette, summary rule
    // and evidence box on the auxiliary canvas.
    const sections = human ? [
      { title: t('janus:roundtable.parchment.section.decisions'), content: human.decisions.join('\n') || t('janus:roundtable.parchment.empty.decisions') },
      { title: t('janus:roundtable.parchment.section.evidence'), content: human.evidence.join('\n') || t('janus:roundtable.parchment.empty.evidence') },
      { title: t('janus:roundtable.parchment.section.risks'), content: human.risks.join('\n') || t('janus:roundtable.parchment.empty.risks') },
      { title: t('janus:roundtable.parchment.section.pending'), content: human.pending.join('\n') || t('janus:roundtable.parchment.empty.pending') },
      { title: t('janus:roundtable.parchment.section.conflicts'), content: human.conflicts.length ? human.conflicts.map((item) => `[${item.status}] ${item.topic}`).join('\n') : t('janus:roundtable.parchment.empty.conflicts') },
      { title: t('janus:roundtable.parchment.section.actions'), content: human.actions.join('\n') || t('janus:roundtable.parchment.empty.actions') },
    ] : [
      { title: t('janus:roundtable.parchment.placeholder.conclusionTitle'), content: t('janus:roundtable.parchment.placeholder.conclusionBody') },
      { title: t('janus:roundtable.parchment.placeholder.questionsTitle'), content: t('janus:roundtable.parchment.placeholder.questionsBody') },
      { title: t('janus:roundtable.parchment.placeholder.actionsTitle'), content: t('janus:roundtable.parchment.placeholder.actionsBody') },
    ]
    return (
      <div className="janus-agent-result-detail janus-roundtable-parchment" data-detailed={detailed}>
        <div className="janus-agent-result-detail__eyebrow">{t('janus:roundtable.parchment.eyebrow')} // {human ? (human.draft ? t('janus:roundtable.parchment.state.draft') : t('janus:roundtable.parchment.state.final')) : t('janus:roundtable.parchment.state.waiting')}</div>
        <h2>{document?.title ?? t('janus:roundtable.parchment.titleFallback')}</h2>
        <p className="janus-agent-result-detail__summary">{human?.conclusion ?? t('janus:roundtable.parchment.summaryFallback')}</p>
        {sections.map((section) => (
          <section key={section.title}>
            <h3>{section.title}</h3>
            <p>{section.content}</p>
          </section>
        ))}
        <div className="janus-agent-result-detail__evidence">
          <strong>{t('janus:roundtable.parchment.sourceIndex')}</strong>
          <span>{human?.draft ? `${t('janus:roundtable.parchment.state.draft')} · ` : ''}{human?.sourceEventIds.join(', ') || t('janus:roundtable.parchment.noSources')}</span>
        </div>
      </div>
    )
  }
  return (
    <div className="janus-roundtable-parchment" data-detailed={detailed}>
      <div className="janus-roundtable-parchment-meta">
        <span>{t('janus:roundtable.parchment.eyebrow')}</span>
        <small>{human ? (human.draft ? t('janus:roundtable.parchment.state.draft') : t('janus:roundtable.parchment.state.final')) : t('janus:roundtable.parchment.state.awaitingTopic')}</small>
      </div>
      <div className="janus-roundtable-parchment-origin">
        <strong>JanusX</strong>
        <span>{t('janus:roundtable.parchment.originSubtitle')}</span>
        <small>{t('janus:roundtable.parchment.originMeta')}</small>
      </div>
      <p className="janus-roundtable-parchment-lead">
        {t('janus:roundtable.parchment.summaryFallback')}
      </p>
    </div>
  )
}
