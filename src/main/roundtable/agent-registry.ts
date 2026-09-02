import type { FixtureAgent } from '../../shared/roundtable/events'
import type { ParticipantInstance, WorkflowRole } from '../../shared/roundtable/workflow-template'

export interface RegisteredAgent extends FixtureAgent {
  id: string
  role: WorkflowRole
  timeoutMs?: number
}

export class AgentRegistry {
  private readonly entries = new Map<string, RegisteredAgent>()

  register(agent: RegisteredAgent): void {
    if (this.entries.has(agent.id)) throw new Error(`Agent already registered: ${agent.id}`)
    this.entries.set(agent.id, agent)
  }

  replace(agent: RegisteredAgent): void { this.entries.set(agent.id, agent) }
  get(id: string): RegisteredAgent | undefined { return this.entries.get(id) }
  resolve(participant: ParticipantInstance): RegisteredAgent | undefined { return this.entries.get(participant.id) }
  list(): RegisteredAgent[] { return [...this.entries.values()] }
}
