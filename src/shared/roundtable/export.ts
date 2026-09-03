import type { RoundtableState } from './events'

/**
 * Render a traceable Markdown record from a roundtable state. Pure function
 * so the full acceptance chain stays unit-testable without Electron.
 * Prefers the latest host synthesis for the conclusion and conflicts.
 */
export function exportRoundtableMarkdown(state: RoundtableState): string {
  const drafts = state.hostDrafts ?? []
  const synthesis = drafts.length ? drafts[drafts.length - 1] : undefined
  const conclusion = synthesis?.conclusion
    ?? state.facts.find((fact) => fact.kind === 'decision' && fact.status === 'confirmed')?.content
    ?? 'No confirmed conclusion.'
  const conflicts = synthesis?.conflicts ?? []
  const lines = [
    `# ${state.userInput ?? 'Roundtable session'}`, '',
    `Status: ${state.phase}`, `Round: ${state.roundNumber}`, '',
    '## Conclusion', conclusion, '',
    '## Decisions', ...state.facts.filter((fact) => fact.kind === 'decision').map((fact) => `- [${fact.status}] ${fact.content}`), '',
    '## Evidence', ...state.facts.filter((fact) => fact.kind === 'evidence').map((fact) => `- ${fact.content}`), '',
    '## Risks and Open Questions', ...state.facts.filter((fact) => fact.kind === 'risk' || fact.kind === 'question').map((fact) => `- [${fact.status}] ${fact.content}`), '',
    ...(conflicts.length ? ['## Conflicts', ...conflicts.map((item) => `- [${item.status}] ${item.topic}`), ''] : []),
    '## Actions', ...state.facts.filter((fact) => fact.kind === 'action').map((fact) => `- ${fact.content}`), '',
    '## Source Index', ...state.eventIds.map((id) => `- ${id}`),
  ]
  return `${lines.join('\n')}\n`
}
