export const JANUS_ROUNDTABLE_CHANNELS = {
  list: 'janus-roundtable:list',
  get: 'janus-roundtable:get',
  create: 'janus-roundtable:create',
  updateWorkspaces: 'janus-roundtable:update-workspaces',
  advance: 'janus-roundtable:advance',
  end: 'janus-roundtable:end',
  exportMarkdown: 'janus-roundtable:export-markdown',
  progress: 'janus-roundtable:progress',
} as const

export type RoundtableStatus = 'active' | 'ended'
export type RoundtableRole = 'user' | 'host' | 'agent-1' | 'agent-2'
export type RoundtableProgressState = 'working' | 'idle'

export interface RoundtableProgressEvent {
  sessionId: string
  round: number
  role: RoundtableRole
  state: RoundtableProgressState
  message?: RoundtableMessage
}

export interface RoundtableMessage {
  id: string
  role: RoundtableRole
  round: number
  content: string
  createdAt: number
}

export interface RoundtableSharedState {
  version: number
  requirements: string[]
  openIssues: string[]
  resolvedIssues: string[]
  proposals: string[]
  risks: string[]
  actionItems: string[]
  citations: string[]
}

export interface RoundtableFinalResult {
  conclusion: string
  sharedState: RoundtableSharedState
  generatedAt: number
}

export interface RoundtableWorkspaceDependency {
  workspaceId: string
  workspacePath: string
  workspaceName: string
}

export interface RoundtableSession {
  id: string
  title: string
  topic: string
  status: RoundtableStatus
  currentRound: number
  createdAt: number
  updatedAt: number
  workspaceId?: string
  workspacePath?: string
  workspaces?: RoundtableWorkspaceDependency[]
  providerId?: string
  modelId?: string
  messages: RoundtableMessage[]
  sharedState: RoundtableSharedState
  finalResult?: RoundtableFinalResult
}

export interface CreateRoundtableInput {
  topic: string
  title?: string
  workspaceId?: string
  workspacePath?: string
  workspaces?: RoundtableWorkspaceDependency[]
  providerId?: string
  modelId?: string
}

export interface UpdateRoundtableWorkspacesInput {
  sessionId: string
  workspaces: RoundtableWorkspaceDependency[]
}

export interface AdvanceRoundInput {
  sessionId: string
  userInput?: string
}

export interface RoundtableExportResult {
  filePath: string
  content: string
}

export interface JanusRoundtableAPI {
  list(): Promise<RoundtableSession[]>
  get(sessionId: string): Promise<RoundtableSession | null>
  create(input: CreateRoundtableInput): Promise<RoundtableSession>
  updateWorkspaces(input: UpdateRoundtableWorkspacesInput): Promise<RoundtableSession>
  advance(input: AdvanceRoundInput): Promise<RoundtableSession>
  end(sessionId: string): Promise<RoundtableSession>
  exportMarkdown(sessionId: string, directory: string, fileName?: string): Promise<RoundtableExportResult>
  onProgress(listener: (event: RoundtableProgressEvent) => void): () => void
}

export function emptySharedState(): RoundtableSharedState {
  return { version: 0, requirements: [], openIssues: [], resolvedIssues: [], proposals: [], risks: [], actionItems: [], citations: [] }
}
