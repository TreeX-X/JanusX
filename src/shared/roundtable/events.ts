import type { ParticipantInstance, WorkflowRole } from './workflow-template'

export type AgentWorkState = 'queued' | 'working' | 'completed' | 'failed' | 'awaiting-input' | 'cancelled'

export interface AgentResultCard {
  id: string
  sessionId: string
  roundId: string
  agentId: string
  role: WorkflowRole
  title: string
  status: AgentWorkState
  summary: string
  createdAt: string
  updatedAt: string
  sourceEventIds: string[]
  sections?: Array<{ id: string; title: string; markdown: string }>
  evidenceRefs?: string[]
  requiresUserAction?: boolean
}

export type RoundtableFactStatus = 'confirmed' | 'proposal' | 'concern' | 'pending-validation' | 'rejected' | 'resolved'

export interface RoundtableFact {
  id: string
  kind: 'decision' | 'evidence' | 'risk' | 'action' | 'question'
  status: RoundtableFactStatus
  title: string
  content: string
  sourceEventIds: string[]
  updatedAt: string
}

export interface ParchmentDocument {
  version: number
  title: string
  conclusion: string
  decisions: RoundtableFact[]
  evidence: RoundtableFact[]
  risks: RoundtableFact[]
  actions: RoundtableFact[]
  unresolved: RoundtableFact[]
  sourceEventIds: string[]
}

export interface RoundtableState {
  phase: 'idle' | 'running' | 'awaiting-user' | 'ended'
  sessionId?: string
  roundNumber: number
  userInput?: string
  participants: ParticipantInstance[]
  cards: AgentResultCard[]
  errors: string[]
  facts: RoundtableFact[]
  eventIds: string[]
  version: number
}

export type RoundtableEvent =
  | ({ type: 'session:created'; sessionId: string; workflowId: string; workflowVersion: string })
  | ({ type: 'round:started'; sessionId: string; roundId: string; roundNumber: number; trigger: 'initial-input' | 'user-advance'; userInput?: string })
  | ({ type: 'agent:queued'; sessionId: string; roundId: string; agentId: string; role: WorkflowRole })
  | ({ type: 'agent:working'; sessionId: string; roundId: string; agentId: string; role: WorkflowRole })
  | ({ type: 'agent:result'; sessionId: string; roundId: string; card: AgentResultCard })
  | ({ type: 'agent:error'; sessionId: string; roundId: string; agentId: string; role: WorkflowRole; error: string })
  | ({ type: 'round:awaiting-user'; sessionId: string; roundId: string; roundNumber: number })
  | ({ type: 'session:ended'; sessionId: string })

export type RoundtableEventEnvelope = RoundtableEvent & { eventId: string; occurredAt: string }

export interface FixtureAgent {
  run(input: { sessionId: string; roundId: string; roundNumber: number; userInput?: string; priorCards: AgentResultCard[] }): Promise<string>
}
