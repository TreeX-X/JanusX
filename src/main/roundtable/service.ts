import type { RoundtableEventEnvelope, RoundtableState, RoundtableWorkspaceResource } from '../../shared/roundtable/events'
import { defaultRoundtableWorkflow } from '../../shared/roundtable/workflow-template'
import { RoundtableRuntime } from './runtime'
import { llmService } from '../llm/LlmService'
import { generateText } from '../llm/ai-runtime'
import { roundtableStore } from './store'

export class RoundtableService {
  private readonly sessions = new Map<string, RoundtableRuntime>()
  private readonly listeners = new Set<(event: RoundtableEventEnvelope) => void>()

  onEvent(listener: (event: RoundtableEventEnvelope) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }

  async start(input: string | { prompt: string; workspaceResources?: RoundtableWorkspaceResource[] }): Promise<RoundtableState> {
    const runtime = this.createRuntime()
    const state = await runtime.start(typeof input === 'string' ? { prompt: input } : input)
    this.sessions.set(state.sessionId!, runtime)
    return state
  }

  private createRuntime(): RoundtableRuntime {
    const agents = Object.fromEntries(defaultRoundtableWorkflow.participants.flatMap((spec) => spec.instances).map((participant) => [participant.id, {
      run: async ({ userInput, priorCards, workspaceResources }: { userInput?: string; priorCards: any[]; workspaceResources?: RoundtableWorkspaceResource[] }) => {
        const fallback = `${participant.role} reviewed "${userInput ?? 'the shared state'}" with ${priorCards.length} prior results.`
        try {
          const target = await llmService.getDefaultModel()
          if (!target) return fallback
          const model = await llmService.getLanguageModel(target.provider.id, target.modelId)
          const roleInstruction = participant.role === 'refiner'
            ? 'Propose a concrete improvement and implementation path.'
            : participant.role === 'challenger'
              ? 'Identify gaps, risks, and assumptions that need validation.'
              : 'Synthesize the discussion into a concise host summary.'
          const result = await generateText({ model: model as any, messages: [
            { role: 'system', content: `You are the ${participant.role} in a structured roundtable. ${roleInstruction} Return concise markdown.` },
            { role: 'user', content: `Topic: ${userInput ?? 'Continue from shared state'}\nWorkspace resources (read-only context):\n${(workspaceResources ?? []).map((resource) => `${resource.workspaceName}: ${resource.workspacePath}`).join('\n') || 'None attached'}\nPrior results:\n${priorCards.map((card) => card.summary ?? '').join('\n')}` },
          ] })
          return result.text?.trim() || fallback
        } catch {
          return fallback
        }
      },
    }]))
    const runtime = new RoundtableRuntime(agents)
    runtime.onEvent((event) => {
      if (event.type === 'agent:result') {
        const kind = event.card.role === 'challenger' ? 'risk' : event.card.role === 'host' ? 'decision' : 'evidence'
        runtime.addFact({ id: `fact-${event.card.id}`, kind, status: event.card.role === 'host' ? 'confirmed' : event.card.role === 'challenger' ? 'concern' : 'proposal', title: event.card.title, content: event.card.summary, sourceEventIds: [event.eventId], updatedAt: event.occurredAt })
      }
      void roundtableStore.append(event.sessionId, event, runtime.getState()); this.listeners.forEach((listener) => listener(event))
    })
    return runtime
  }

  advance(sessionId: string, input = ''): Promise<RoundtableState> { return this.require(sessionId).advance(input) }
  end(sessionId: string): RoundtableState { return this.require(sessionId).end() }
  getState(sessionId: string): RoundtableState | null { return this.sessions.get(sessionId)?.getState() ?? null }
  exportMarkdown(sessionId: string): string {
    const state = this.require(sessionId).getState()
    const lines = [`# ${state.userInput ?? 'Roundtable session'}`, '', `Status: ${state.phase}`, `Round: ${state.roundNumber}`, '', '## Conclusion', state.facts.find((fact) => fact.kind === 'decision' && fact.status === 'confirmed')?.content ?? 'No confirmed conclusion.', '', '## Decisions', ...state.facts.filter((fact) => fact.kind === 'decision').map((fact) => `- [${fact.status}] ${fact.content}`), '', '## Evidence', ...state.facts.filter((fact) => fact.kind === 'evidence').map((fact) => `- ${fact.content}`), '', '## Risks and Open Questions', ...state.facts.filter((fact) => fact.kind === 'risk' || fact.kind === 'question').map((fact) => `- [${fact.status}] ${fact.content}`), '', '## Actions', ...state.facts.filter((fact) => fact.kind === 'action').map((fact) => `- ${fact.content}`), '', '## Source Index', ...state.eventIds.map((id) => `- ${id}`)]
    return `${lines.join('\n')}\n`
  }
  async restore(sessionId: string): Promise<RoundtableState | null> {
    const saved = await roundtableStore.load(sessionId)
    if (!saved) return null
    const runtime = this.createRuntime()
    runtime.hydrate(saved.state)
    this.sessions.set(sessionId, runtime)
    return runtime.getState()
  }
  private require(sessionId: string): RoundtableRuntime {
    const runtime = this.sessions.get(sessionId)
    if (!runtime) throw new Error(`Unknown roundtable session: ${sessionId}`)
    return runtime
  }
}

export const roundtableService = new RoundtableService()
