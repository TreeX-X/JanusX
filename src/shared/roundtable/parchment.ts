import type { HumanReadableParchment, ParchmentDocument, RoundtableState } from './events'

export function projectHumanReadableParchment(state: RoundtableState, active = state.facts.filter((fact) => fact.status !== 'rejected')): HumanReadableParchment {
  const decisions = active.filter((fact) => fact.kind === 'decision' && fact.status === 'confirmed').map((fact) => fact.content).slice(0, 5)
  const evidence = active.filter((fact) => fact.kind === 'evidence').map((fact) => fact.content).slice(0, 5)
  const risks = active.filter((fact) => fact.kind === 'risk' || fact.kind === 'question').map((fact) => fact.content).slice(0, 5)
  const actions = active.filter((fact) => fact.kind === 'action').map((fact) => fact.content).slice(0, 5)
  return { title: state.userInput ? `圆桌议题：${state.userInput}` : '圆桌会议', conclusion: decisions[0] ?? '主持人尚未形成最终结论。', decisions, evidence, risks, actions, draft: state.phase !== 'ended', sourceEventIds: [...new Set(active.flatMap((fact) => fact.sourceEventIds))] }
}

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
    humanReadable: projectHumanReadableParchment(state, active),
  }
}
