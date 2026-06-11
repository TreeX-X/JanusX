import type { AgentEngine } from '../types'

export interface FileSnapshot {
  beforeHash: string
  afterHash?: string
  diff?: string
}

export interface ConversationCheckpoint {
  id: string
  terminalId: string
  conversationIndex: number
  createdAt: string
  engine: AgentEngine
  branch: string
  prompt: string
  stashRef: string | null
  filesSnapshot: Record<string, FileSnapshot>
  status: 'pending' | 'finalized'
}

export interface ConflictInfo {
  filePath: string
  resolution: 'ours' | 'theirs' | 'manual'
}

export interface CheckpointCreateOptions {
  terminalId: string
  engine: AgentEngine
  prompt: string
  cwd: string
}
