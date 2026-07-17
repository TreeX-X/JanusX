import type {
  ModelCatalogRefreshResult,
  ModelCatalogSnapshot,
  ModelInfo,
  ProviderSettings,
} from '@janusx/llm-core'
import type { KnowledgeRecallTrace } from '../knowledge'

export const LLM_CHANNELS = {
  getProviders: 'llm:get-providers', saveProvider: 'llm:save-provider', testConnection: 'llm:test-connection',
  removeProvider: 'llm:remove-provider', setDefaultProvider: 'llm:set-default-provider', listModels: 'llm:list-models',
  getCatalog: 'llm:model-catalog:get', refreshCatalog: 'llm:model-catalog:refresh', getAdapters: 'llm:get-adapters',
  getDefaultProvider: 'llm:get-default-provider', chat: 'llm:chat', chatStream: 'llm:chat-stream', abort: 'llm:chat:abort',
  delta: 'llm:chat:delta', done: 'llm:chat:done', error: 'llm:chat:error', recallTrace: 'llm:chat:recall-trace',
} as const

export interface ChatMessage { role: 'user' | 'assistant' | 'system'; content: string }
export interface ChatRequest {
  messages: ChatMessage[]; providerId: string; modelId?: string; sourceTag?: 'janus-chat'; workspaceId?: string; workspacePath?: string
}
export interface ChatStreamRequest extends ChatRequest { requestId: string }
export interface ChatStreamEvent { requestId: string; delta?: string; done?: boolean; error?: string }

export interface LlmAPI {
  getProviders(): Promise<ProviderSettings[]>
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
}
