import type { HostSynthesis, HumanReadableParchment, ParchmentDocument, RoundtableState } from './events'

export function projectHumanReadableParchment(state: RoundtableState, active = state.facts.filter((fact) => fact.status !== 'rejected')): HumanReadableParchment {
  // Stage C: prefer the latest host synthesis draft when one exists. The
  // legacy rule projection below stays as the degraded path (no drafts yet,
  // or synthesis never emitted) and keeps identical legacy semantics.
  const drafts = state.hostDrafts ?? []
  const synthesis: HostSynthesis | undefined = drafts.length ? drafts[drafts.length - 1] : undefined
  if (synthesis) {
    return {
      title: state.userInput ? `圆桌议题：${state.userInput}` : '圆桌会议',
      conclusion: synthesis.conclusion,
      decisions: synthesis.decisions,
      evidence: synthesis.evidence,
      risks: synthesis.risks,
      actions: synthesis.actions,
      pending: synthesis.pending,
      conflicts: synthesis.conflicts.map((item) => ({ topic: item.topic, status: item.status })),
      draft: !synthesis.final,
      sourceEventIds: [...new Set([...synthesis.sourceEventIds, ...active.flatMap((fact) => fact.sourceEventIds)])],
    }
  }
  const decisions = active.filter((fact) => fact.kind === 'decision' && fact.status === 'confirmed').map((fact) => fact.content).slice(0, 5)
  const evidence = active.filter((fact) => fact.kind === 'evidence').map((fact) => fact.content).slice(0, 5)
  const risks = active.filter((fact) => fact.kind === 'risk' || fact.kind === 'question').map((fact) => fact.content).slice(0, 5)
  const actions = active.filter((fact) => fact.kind === 'action').map((fact) => fact.content).slice(0, 5)
  const pending = active.filter((fact) => fact.status === 'proposal' || fact.status === 'pending-validation').map((fact) => fact.content).slice(0, 5)
  return { title: state.userInput ? `圆桌议题：${state.userInput}` : '圆桌会议', conclusion: decisions[0] ?? '主持人尚未形成最终结论。', decisions, evidence, risks, actions, pending, conflicts: [], draft: state.phase !== 'ended', sourceEventIds: [...new Set(active.flatMap((fact) => fact.sourceEventIds))] }
}

export function projectParchment(state: RoundtableState): ParchmentDocument {
  const active = state.facts.filter((fact) => fact.status !== 'rejected')
  const decisions = active.filter((fact) => fact.kind === 'decision')
  const evidence = active.filter((fact) => fact.kind === 'evidence')
  const risks = active.filter((fact) => fact.kind === 'risk')
  const actions = active.filter((fact) => fact.kind === 'action')
  const unresolved = active.filter((fact) => fact.kind === 'question' || ['proposal', 'concern', 'pending-validation'].includes(fact.status))
  const drafts = state.hostDrafts ?? []
  const synthesis: HostSynthesis | undefined = drafts.length ? drafts[drafts.length - 1] : undefined
  return {
    version: state.version,
    title: state.userInput ? `圆桌议题：${state.userInput}` : '圆桌会议',
    conclusion: synthesis?.conclusion ?? decisions.find((fact) => fact.status === 'confirmed')?.content ?? '尚未形成已确认结论。',
    decisions, evidence, risks, actions, unresolved,
    sourceEventIds: [...new Set(active.flatMap((fact) => fact.sourceEventIds))],
    humanReadable: projectHumanReadableParchment(state, active),
  }
}
