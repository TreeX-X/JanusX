import type { ParchmentDocument, RoundtableState } from './events'

export function projectParchment(state: RoundtableState): ParchmentDocument {
  const active = state.facts.filter((fact) => fact.status !== 'rejected')
  const decisions = active.filter((fact) => fact.kind === 'decision')
  const evidence = active.filter((fact) => fact.kind === 'evidence')
  const risks = active.filter((fact) => fact.kind === 'risk')
  const actions = active.filter((fact) => fact.kind === 'action')
  const unresolved = active.filter((fact) => fact.kind === 'question' || ['proposal', 'concern', 'pending-validation'].includes(fact.status))
  return {
    version: state.version,
    title: state.userInput ? `圆桌议题：${state.userInput}` : '圆桌会议',
    conclusion: decisions.find((fact) => fact.status === 'confirmed')?.content ?? '尚未形成已确认结论。',
    decisions, evidence, risks, actions, unresolved,
    sourceEventIds: [...new Set(active.flatMap((fact) => fact.sourceEventIds))],
  }
}
