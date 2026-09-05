import type { AgentApprovalMode } from '../../../shared/ipc/agent-runtime'

export type AgentSettings = { approvalMode: AgentApprovalMode; agentMaxSteps: number; safeCompileAutoAllow: boolean }

export const DEFAULT_AGENT_MAX_STEPS = 40
export const MIN_AGENT_MAX_STEPS = 1
export const MAX_AGENT_MAX_STEPS = 100

export function normalizeAgentMaxStepsInput(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return DEFAULT_AGENT_MAX_STEPS
  return Math.min(MAX_AGENT_MAX_STEPS, Math.max(MIN_AGENT_MAX_STEPS, Math.floor(parsed)))
}

export function normalizeSafeCompileAutoAllowInput(value: unknown): boolean {
  return value === undefined ? true : value === true
}

export async function getAgentSettings(): Promise<AgentSettings> {
  return window.electron.agentSettings.get()
}

export async function updateAgentSettings(settings: AgentSettings): Promise<AgentSettings> {
  return window.electron.agentSettings.update(settings)
}
