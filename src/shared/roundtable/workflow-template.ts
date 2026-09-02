export type WorkflowRole = 'host' | 'refiner' | 'challenger' | string

export interface ParticipantInstance {
  id: string
  role: WorkflowRole
  model?: string
  capabilities: string[]
}

export interface ParticipantSpec {
  role: WorkflowRole
  min: number
  max: number
  instances: ParticipantInstance[]
}

export interface WorkflowStage {
  id: string
  role: WorkflowRole
  fanOut?: string
  join?: string
}

export interface WorkflowTemplate {
  id: string
  version: string
  participants: ParticipantSpec[]
  stages: WorkflowStage[]
  termination: 'user-only' | string
}

export function validateWorkflowTemplate(template: WorkflowTemplate): void {
  if (!template.id || !template.version) throw new Error('Workflow template requires id and version')
  if (!template.participants.some((item) => item.role === 'host' && item.instances.length === 1)) {
    throw new Error('Workflow template requires exactly one host')
  }
  for (const participant of template.participants) {
    if (participant.min < 0 || participant.max < participant.min || participant.instances.length > participant.max) {
      throw new Error(`Invalid participant bounds for role ${participant.role}`)
    }
    if (participant.instances.length < participant.min) {
      throw new Error(`Participant role ${participant.role} has too few instances`)
    }
  }
  if (!template.stages.length) throw new Error('Workflow template requires at least one stage')
}

export const defaultRoundtableWorkflow: WorkflowTemplate = {
  id: 'roundtable-default',
  version: '1.0.0',
  participants: [
    { role: 'host', min: 1, max: 1, instances: [{ id: 'janusx', role: 'host', capabilities: ['synthesis'] }] },
    { role: 'refiner', min: 1, max: 20, instances: [{ id: 'refiner-1', role: 'refiner', capabilities: ['improve'] }] },
    { role: 'challenger', min: 1, max: 20, instances: [{ id: 'challenger-1', role: 'challenger', capabilities: ['critique'] }] },
  ],
  stages: [
    { id: 'refiners', role: 'refiner', fanOut: 'refiner', join: 'refiners-join' },
    { id: 'challengers', role: 'challenger', fanOut: 'challenger', join: 'challengers-join' },
    { id: 'host-synthesis', role: 'host' },
  ],
  termination: 'user-only',
}

export function participantsForRole(template: WorkflowTemplate, role: WorkflowRole): ParticipantInstance[] {
  return template.participants.find((item) => item.role === role)?.instances ?? []
}
