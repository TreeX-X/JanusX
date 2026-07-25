import type { LaunchConfig, ProjectType, ValidationResult } from '../../../../shared/ipc/project'

export const JANUS_PROJECT_CANDIDATE_EVENT = 'janus:project-candidate'

export interface JanusProjectCandidate {
  workspaceId: string
  workspacePath: string
  projectPath: string
  relativePath: string
  config: LaunchConfig
  validation: ValidationResult
  detection: {
    type: ProjectType
    confidence: number
    evidence: string[]
    candidates: Array<{ path: string; type: ProjectType; confidence: number; evidence: string[] }>
  }
}

export function joinWorkspacePath(root: string, relativePath: string): string {
  if (!relativePath) return root
  const separator = root.includes('\\') ? '\\' : '/'
  return `${root.replace(/[\\/]+$/, '')}${separator}${relativePath.replace(/[\\/]+/g, separator)}`
}
