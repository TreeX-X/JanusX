import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import type { AgentResultCard, FixtureAgent, RoundtableEvent, RoundtableEventEnvelope, RoundtableFact, RoundtableState, RoundtableWorkspaceResource } from '../../shared/roundtable/events'
import { EMPTY_ROUNDTABLE_STATE, reduceRoundtableEvent } from '../../shared/roundtable/state'
import { defaultRoundtableWorkflow, participantsForRole, validateWorkflowTemplate, type ParticipantInstance, type WorkflowTemplate } from '../../shared/roundtable/workflow-template'
import { AgentRegistry } from './agent-registry'

type GraphState = {
  sessionId: string
  roundId: string
  roundNumber: number
  userInput?: string
  cards: AgentResultCard[]
  errors: string[]
  workspaceResources: RoundtableWorkspaceResource[]
}

const GraphAnnotation = Annotation.Root({
  sessionId: Annotation<string>(), roundId: Annotation<string>(), roundNumber: Annotation<number>(),
  userInput: Annotation<string | undefined>(),
  cards: Annotation<AgentResultCard[]>({ reducer: (left, right) => left.concat(right), default: () => [] }),
  errors: Annotation<string[]>({ reducer: (left, right) => left.concat(right), default: () => [] }),
  workspaceResources: Annotation<RoundtableWorkspaceResource[]>({ reducer: (_left, right) => right, default: () => [] }),
})

export class RoundtableRuntime {
  private readonly agents: Map<string, FixtureAgent>
  private readonly template: WorkflowTemplate
  private readonly listeners = new Set<(event: RoundtableEventEnvelope) => void>()
  private state: RoundtableState = { ...EMPTY_ROUNDTABLE_STATE }

  constructor(agents: Record<string, FixtureAgent> | AgentRegistry, template: WorkflowTemplate = defaultRoundtableWorkflow) {
    validateWorkflowTemplate(template)
    this.agents = agents instanceof AgentRegistry
      ? new Map(agents.list().map((agent) => [agent.id, agent]))
      : new Map(Object.entries(agents))
    this.template = template
  }

  onEvent(listener: (event: RoundtableEventEnvelope) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  getState(): RoundtableState { return { ...this.state, participants: [...this.state.participants], cards: [...this.state.cards], errors: [...this.state.errors] } }
  hydrate(state: RoundtableState): void { this.state = { ...state, participants: [...state.participants], cards: [...state.cards], errors: [...state.errors], facts: [...state.facts], eventIds: [...state.eventIds] } }
  addFact(fact: RoundtableFact): void { this.state = { ...this.state, facts: [...this.state.facts.filter((item) => item.id !== fact.id), fact], version: this.state.version + 1 } }

  async start(input: string | { prompt: string; workspaceResources?: RoundtableWorkspaceResource[] }): Promise<RoundtableState> {
    const value = (typeof input === 'string' ? input : input.prompt).trim()
    const workspaceResources = typeof input === 'string' ? [] : (input.workspaceResources ?? []).map((resource) => ({ ...resource }))
    if (!value || this.state.phase !== 'idle') throw new Error('A non-empty input is required to start an idle roundtable')
    const sessionId = `session-${Date.now()}`
    this.state = { ...EMPTY_ROUNDTABLE_STATE, phase: 'running', sessionId, roundNumber: 1, userInput: value, participants: this.allParticipants(), workspaceResources }
    this.emit({ type: 'session:created', sessionId, workflowId: this.template.id, workflowVersion: this.template.version })
    this.state = { ...this.state, roundNumber: 1, userInput: value, participants: this.allParticipants() }
    return this.runRound(value, 'initial-input')
  }

  async advance(input = ''): Promise<RoundtableState> {
    if (this.state.phase !== 'awaiting-user' || !this.state.sessionId) throw new Error('Roundtable is not waiting for user advance')
    this.state = { ...this.state, phase: 'running', roundNumber: this.state.roundNumber + 1, userInput: input.trim() || undefined, errors: [] }
    return this.runRound(this.state.userInput, 'user-advance')
  }

  end(): RoundtableState {
    if (!this.state.sessionId || this.state.phase === 'idle') throw new Error('Roundtable has not started')
    if (this.state.phase === 'running') throw new Error('A running round cannot be ended')
    this.emit({ type: 'session:ended', sessionId: this.state.sessionId })
    return this.getState()
  }

  private async runRound(userInput: string | undefined, trigger: 'initial-input' | 'user-advance'): Promise<RoundtableState> {
    const sessionId = this.state.sessionId!
    const roundNumber = this.state.roundNumber
    const roundId = `${sessionId}-round-${roundNumber}`
    this.emit({ type: 'round:started', sessionId, roundId, roundNumber, trigger, userInput })
    const graph = this.buildGraph(roundId)
    const result = await graph.invoke({ sessionId, roundId, roundNumber: this.state.roundNumber, userInput, cards: [], errors: [], workspaceResources: this.state.workspaceResources })
    // Agent events have already been reduced into state; only the lifecycle event changes phase.
    void result
    this.state = { ...this.state, roundNumber, userInput }
    this.emit({ type: 'round:awaiting-user', sessionId, roundId, roundNumber })
    return this.getState()
  }

  private buildGraph(roundId: string) {
    return new StateGraph(GraphAnnotation)
      .addNode('run-template', async (state: GraphState) => this.runTemplate(state, roundId))
      .addEdge(START, 'run-template')
      .addEdge('run-template', END)
      .compile()
  }

  private async runTemplate(state: GraphState, roundId: string) {
    const cards: AgentResultCard[] = []
    const errors: string[] = []
    for (const stage of this.template.stages) {
      const participants = participantsForRole(this.template, stage.role)
      const stageState = { ...state, cards: state.cards.concat(cards), errors: state.errors.concat(errors) }
      const results = await Promise.all(participants.map((participant) => this.runAgent(stageState, participant, roundId)))
      for (const result of results) {
        cards.push(...(result.cards ?? []))
        errors.push(...(result.errors ?? []))
      }
    }
    return { cards, errors }
  }

  private async runAgent(state: GraphState, participant: ParticipantInstance, roundId: string) {
    const { sessionId } = state
    this.emit({ type: 'agent:queued', sessionId, roundId, agentId: participant.id, role: participant.role })
    this.emit({ type: 'agent:working', sessionId, roundId, agentId: participant.id, role: participant.role })
    try {
      const summary = await this.agents.get(participant.id)?.run({ sessionId, roundId, roundNumber: state.roundNumber, userInput: state.userInput, priorCards: state.cards, workspaceResources: this.state.workspaceResources })
        ?? `Fixture result for ${participant.id}`
      const now = new Date().toISOString()
      const card: AgentResultCard = {
        id: `${roundId}-${participant.id}`, sessionId, roundId, agentId: participant.id,
        role: participant.role, title: `${participant.role} result`, status: 'completed', summary,
        sections: [{ id: 'summary', title: 'Summary', markdown: summary }],
        evidenceRefs: state.cards.map((item) => item.id),
        requiresUserAction: participant.role === 'host' && summary.includes('?'),
        createdAt: now, updatedAt: now, sourceEventIds: [],
      }
      this.emit({ type: 'agent:result', sessionId, roundId, card })
      return { cards: [card] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.emit({ type: 'agent:error', sessionId, roundId, agentId: participant.id, role: participant.role, error: message })
      return { errors: [`${participant.id}: ${message}`] }
    }
  }

  private allParticipants(): ParticipantInstance[] { return this.template.participants.flatMap((item) => item.instances) }
  private emit(event: RoundtableEvent): void {
    const envelope: RoundtableEventEnvelope = { ...event, eventId: `${event.type}-${Date.now()}-${Math.random().toString(36).slice(2)}`, occurredAt: new Date().toISOString() }
    this.state = reduceRoundtableEvent(this.state, envelope)
    if (event.type === 'agent:result') {
      const kind = event.card.role === 'challenger' ? 'risk' : event.card.role === 'host' ? 'decision' : 'evidence'
      this.addFact({ id: `fact-${event.card.id}`, kind, status: event.card.role === 'host' ? 'confirmed' : event.card.role === 'challenger' ? 'concern' : 'proposal', title: event.card.title, content: event.card.summary, sourceEventIds: [envelope.eventId], updatedAt: envelope.occurredAt })
    }
    this.listeners.forEach((listener) => listener(envelope))
  }
}
