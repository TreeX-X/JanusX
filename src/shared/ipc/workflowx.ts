import type { WorkflowXDetection } from '@janus-agent/node-hosts'

export const WORKFLOWX_CHANNELS = {
  detect: 'workflowx:detect',
  openRepository: 'workflowx:open-repository',
} as const

export interface WorkflowXSnapshot extends WorkflowXDetection {
  workspaceId: string | null
  unavailable?: boolean
}

export interface WorkflowXAPI {
  detect(workspaceId: string | null, refresh?: boolean): Promise<WorkflowXSnapshot>
  openRepository(): Promise<boolean>
}
