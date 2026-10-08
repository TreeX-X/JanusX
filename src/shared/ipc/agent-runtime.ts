// Note: shared contracts with Janus conversation event routing — see .agents/notes/blueprint/agentx-harness-inheritance.md
import type { AgentRuntimeAPI as SharedAPI, AgentRuntimeEvent as SharedEvent } from '@janus-agent/agent-core/contracts'
export * from '@janus-agent/agent-core/contracts'

export type AgentRuntimeEvent = SharedEvent & { parentSessionId?: string }
export interface AgentRuntimeAPI extends Omit<SharedAPI, 'onEvent'> {
  onEvent(callback: (event: AgentRuntimeEvent) => void): () => void
}
