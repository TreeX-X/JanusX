import type { AgentApprovalMode } from '../../../shared/ipc/agent-runtime'

export type AgentSettings = { approvalMode: AgentApprovalMode }

export async function getAgentSettings(): Promise<AgentSettings> {
  return window.electron.agentSettings.get()
}

export async function updateAgentSettings(settings: AgentSettings): Promise<AgentSettings> {
  return window.electron.agentSettings.update(settings)
}
