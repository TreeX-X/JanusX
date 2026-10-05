// Note: shared contracts with Janus conversation event routing — see .agents/notes/2026-10-04-agentx-harness-inheritance--bd7fd0c6.md
import type { AgentRuntimeAPI as SharedAPI, AgentRuntimeEvent as SharedEvent } from '@janus-agent/agent-core/contracts'
export * from '@janus-agent/agent-core/contracts'

export type AgentRuntimeEvent = SharedEvent & { parentSessionId?: string }
export interface AgentRuntimeAPI extends Omit<SharedAPI, 'onEvent'> {
  onEvent(callback: (event: AgentRuntimeEvent) => void): () => void
}
