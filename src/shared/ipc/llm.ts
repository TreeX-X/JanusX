import type {
  ModelCatalogRefreshResult,
  ModelCatalogSnapshot,
  ModelInfo,
  ProviderSettings,
} from '@janusx/llm-core'
import type { KnowledgeRecallTrace } from '../knowledge'

export const LLM_CHANNELS = {
  getProviders: 'llm:get-providers', saveProvider: 'llm:save-provider', testConnection: 'llm:test-connection',
  runtimeStatus: 'llm:runtime-status',
  removeProvider: 'llm:remove-provider', setDefaultProvider: 'llm:set-default-provider', listModels: 'llm:list-models',
  getCatalog: 'llm:model-catalog:get', refreshCatalog: 'llm:model-catalog:refresh', getAdapters: 'llm:get-adapters',
  getDefaultProvider: 'llm:get-default-provider', chat: 'llm:chat', chatStream: 'llm:chat-stream', abort: 'llm:chat:abort',
  delta: 'llm:chat:delta', done: 'llm:chat:done', error: 'llm:chat:error', recallTrace: 'llm:chat:recall-trace',
  toolTrace: 'llm:chat:tool-trace',
} as const

export interface ChatMessage { role: 'user' | 'assistant' | 'system'; content: string }
export interface ChatWorkspaceResource {
  workspaceId: string
  workspacePath: string
  workspaceName: string
  agentSessionId: string
}
export interface ChatRequest {
  messages: ChatMessage[]; providerId: string; modelId?: string; sourceTag?: 'janus-chat'; workspaceId?: string; workspacePath?: string; workspaceResources?: ChatWorkspaceResource[]
  /** Compact trace of tool calls from earlier turns, replayed into the model's context. */
  toolTraces?: ChatToolTraceEntry[]
}
export interface ChatStreamRequest extends ChatRequest { requestId: string }
export interface ChatStreamEvent { requestId: string; delta?: string; done?: boolean; error?: string }

/** One executed workspace tool call, replayed into the next turn's history so the model keeps its working context. */
export interface ChatToolTraceEntry {
  toolName: string
  workspaceId: string
  status: string
  /** Compact human/model-readable outcome, e.g. "read src/main.ts (sha256 ab12…, 2.1KB)". Bounded. */
  summary: string
}
export interface ChatToolTraceEvent { requestId: string; entries: ChatToolTraceEntry[] }

export interface LlmRuntimeStatus {
  profileSync: {
    state: 'not-applicable' | 'source-missing' | 'unchanged' | 'synchronized' | 'failed'
    importedProviderCount: number
    sourceProfile?: string
    error?: string
  }
  connection: {
    state: 'checking' | 'available' | 'unavailable' | 'unconfigured'
    providerId?: string
    checkedAt?: string
    latency?: number
    error?: string
  }
}

export interface LlmAPI {
  getProviders(): Promise<ProviderSettings[]>
  getRuntimeStatus(): Promise<LlmRuntimeStatus>
  saveProvider(settings: ProviderSettings): Promise<{ success: boolean; error?: string }>
  testConnection(settings: ProviderSettings & { testModel?: string }): Promise<{ success: boolean; latency?: number; error?: string }>
  removeProvider(providerId: string): Promise<{ success: boolean; error?: string }>
  setDefaultProvider(providerId: string): Promise<{ success: boolean }>
  listModels(providerId: string): Promise<ModelInfo[]>
  getModelCatalog(): Promise<ModelCatalogSnapshot>
  refreshModelCatalog(): Promise<ModelCatalogRefreshResult>
  getAdapters(): Promise<Array<{ id: string; name: string; authType: string }>>
  getDefaultProvider(): Promise<{ provider: ProviderSettings; modelId: string } | null>
  chat(request: ChatRequest): Promise<string>
  startChatStream(request: ChatStreamRequest): void
  abortChat(requestId: string): Promise<void>
  onDelta(callback: (payload: ChatStreamEvent) => void): () => void
  onDone(callback: (payload: ChatStreamEvent) => void): () => void
  onError(callback: (payload: ChatStreamEvent) => void): () => void
  onRecallTrace(callback: (payload: KnowledgeRecallTrace) => void): () => void
  onToolTrace(callback: (payload: ChatToolTraceEvent) => void): () => void
}
