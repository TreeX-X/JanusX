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
  getTerminalBindings: 'llm:get-terminal-bindings', setTerminalBinding: 'llm:set-terminal-binding',
  steer: 'llm:chat:steer', steerCancel: 'llm:chat:steer-cancel',
  delta: 'llm:chat:delta', done: 'llm:chat:done', error: 'llm:chat:error', recallTrace: 'llm:chat:recall-trace',
  toolTrace: 'llm:chat:tool-trace', agentEvent: 'llm:chat:agent-event',
  // Shell-owned extension (no upstream equivalent): renderer answers a mid-turn
  // ask_user question; main resolves the pending QuestionPort promise.
  answerQuestion: 'llm:chat:answer-question',
} as const

export interface ChatMessage { role: 'user' | 'assistant' | 'system'; content: string }
export interface ChatWorkspaceResource {
  workspaceId: string
  workspacePath: string
  workspaceName: string
  agentSessionId: string
}
export interface ChatRequest {
  messages: ChatMessage[]; providerId: string; modelId?: string; sourceTag?: 'janus-chat'; conversationId?: string; workspaceId?: string; workspacePath?: string; workspaceResources?: ChatWorkspaceResource[]
  /** Compact trace of tool calls from earlier turns, replayed into the model's context. */
  toolTraces?: ChatToolTraceEntry[]
  /**
   * S6 engineering domain. Missing = legacy personal behavior for backward
   * compatibility; `project` must never fall back to personal memory capture.
   */
  domain?: 'personal' | 'project'
  /** Renderer selection request only; the host resolves URIs and never trusts paths/grants from here. */
  noteRefs?: Array<{ uri: string; expectedHash?: string }>
}
export interface ChatStreamRequest extends ChatRequest { requestId: string }
export interface ChatStreamEvent { requestId: string; delta?: string; done?: boolean; error?: string }

/** Tool-call status surfaced to the chat UI. Kept as a literal union so cards can branch on it. */
export type ChatToolTraceStatus = 'requested' | 'approval' | 'running' | 'completed' | 'failed' | 'cancelled'

/** Todo item status. Mirrors chat-core (opencode `todowrite` parity, no priority in v1). */
export type ChatTodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export interface ChatTodoItem {
  content: string
  status: ChatTodoStatus
}

/** One mid-turn confirmation option. Mirrors chat-core (opencode `question` parity). */
export interface ChatAskOption {
  label: string
  description?: string
}

/** One mid-turn confirmation question. Mirrors chat-core. */
export interface ChatAskQuestion {
  question: string
  header: string
  options: ChatAskOption[]
  multiple: boolean
}

/**
 * Renderer answer to a pending mid-turn question. Mirrors AskUserPortAnswer
 * structurally so shared/ stays free of janus-agent imports.
 */
export type ChatQuestionAnswer =
  | { status: 'answered'; answers: Array<{ header: string; selected: string[]; custom?: string }> }
  | { status: 'cancelled' }

export interface ChatAnswerQuestionPayload {
  requestId: string
  callId: string
  answer: ChatQuestionAnswer
}

/**
 * Safe, request-scoped Agent lifecycle events for the Chat renderer.
 * Raw tool events stay in Main; the event set tracks chat-core's ChatAgentEvent
 * one-to-one (tool display follows the upstream raw tool call and execution events).
 * Note: alignment trade-offs live with the contract — see .agents/notes/implemented/feature/2026-09-12-janus-agent-chat-alignment.md
 */
export type ChatAgentEvent =
  | { type: 'agent_start'; requestId: string }
  | { type: 'text_delta'; requestId: string; delta: string }
  | { type: 'reasoning_delta'; requestId: string; delta: string }
  | { type: 'tool_call_start'; requestId: string; callId: string; toolName?: string }
  | { type: 'tool_call_delta'; requestId: string; callId: string; argumentDeltaLength: number }
  | { type: 'tool_call_ready'; requestId: string; callId: string; toolName: string; argumentKeys: string[] }
  | { type: 'tool_execution_start'; requestId: string; callId: string; toolName: string }
  | { type: 'tool_execution_update'; requestId: string; callId: string; toolName: string }
  | { type: 'tool_execution_end'; requestId: string; callId: string; toolName: string; status: ChatToolTraceStatus }
  | { type: 'model_finish'; requestId: string; reason: 'stop' | 'tool_calls' | 'length' | 'unknown' }
  | { type: 'model_error'; requestId: string; code: string; retryable: boolean }
  | { type: 'steering_consumed'; requestId: string; keys: string[] }
  | { type: 'todo_update'; requestId: string; todos: ChatTodoItem[] }
  | { type: 'question_requested'; requestId: string; callId: string; questions: ChatAskQuestion[]; allowCustom: boolean }
  | { type: 'question_resolved'; requestId: string; callId: string; status: 'answered' | 'cancelled' }
  | { type: 'stream_end'; requestId: string; cancelled: boolean }
  | { type: 'stream_error'; requestId: string; error: string }

/** R6-full：流式中 steering 投递（主侧排队 + 抢占）与撤销。 */
export interface ChatSteerInput {
  conversationId?: string
  entryId: string
  text: string
}
export interface ChatSteerResult {
  accepted: boolean
  error?: string
}
export interface ChatSteerCancelInput {
  conversationId?: string
  entryId: string
}

/** One executed workspace tool call, replayed into the next turn's history so the model keeps its working context. */
export interface ChatToolTraceEntry {
  toolName: string
  workspaceId: string
  status: string
  /** Compact human/model-readable outcome, e.g. "read src/main.ts (sha256 ab12…, 2.1KB)". Bounded. */
  summary: string
  /** Stable id of the assistant turn this call belongs to. Lets cards be inlined under the right message. */
  turnId?: string
  /** Short display digest of the tool arguments (path/query/etc), already redacted. */
  argsDigest?: string
  /** Short display digest of the tool result (hash/count/etc), already redacted. */
  resultDigest?: string
  /** Error detail shown when the card is expanded; already redacted. */
  errorDetail?: string
  startedAt?: number
  completedAt?: number
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

export interface LlmTerminalBinding {
  providerId: string | null
  modelId?: string
}

/** 与主进程 ConfigStore 对齐的终端消费者；shell 无 LLM，不参与绑定。 */
export type LlmTerminalConsumer = 'janus' | 'claude' | 'codex' | 'opencode' | 'pi'

export interface LlmAPI {
  getProviders(): Promise<ProviderSettings[]>
  getRuntimeStatus(): Promise<LlmRuntimeStatus>
  saveProvider(settings: ProviderSettings): Promise<{ success: boolean; error?: string }>
  testConnection(settings: ProviderSettings & { testModel?: string }): Promise<{ success: boolean; latency?: number; error?: string }>
  removeProvider(providerId: string): Promise<{ success: boolean; error?: string }>
  setDefaultProvider(providerId: string): Promise<{ success: boolean }>
  getTerminalBindings(): Promise<Record<LlmTerminalConsumer, LlmTerminalBinding>>
  setTerminalBinding(consumer: LlmTerminalConsumer, binding: LlmTerminalBinding): Promise<{ success: boolean; error?: string }>
  listModels(providerId: string): Promise<ModelInfo[]>
  getModelCatalog(): Promise<ModelCatalogSnapshot>
  refreshModelCatalog(): Promise<ModelCatalogRefreshResult>
  getAdapters(): Promise<Array<{ id: string; name: string; authType: string }>>
  getDefaultProvider(): Promise<{ provider: ProviderSettings; modelId: string } | null>
  chat(request: ChatRequest): Promise<string>
  startChatStream(request: ChatStreamRequest): void
  abortChat(requestId: string): Promise<void>
  steerChat(input: ChatSteerInput): Promise<ChatSteerResult>
  cancelSteerChat(input: ChatSteerCancelInput): Promise<{ cancelled: boolean }>
  answerQuestion(payload: ChatAnswerQuestionPayload): Promise<{ accepted: boolean; error?: string }>
  onDelta(callback: (payload: ChatStreamEvent) => void): () => void
  onDone(callback: (payload: ChatStreamEvent) => void): () => void
  onError(callback: (payload: ChatStreamEvent) => void): () => void
  onAgentEvent(callback: (payload: ChatAgentEvent) => void): () => void
  onRecallTrace(callback: (payload: KnowledgeRecallTrace) => void): () => void
  onToolTrace(callback: (payload: ChatToolTraceEvent) => void): () => void
}
