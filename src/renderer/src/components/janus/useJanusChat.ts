import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  chatStream,
  getDefaultProvider,
  getProviders,
  listModels,
  type ChatMessage,
} from '@/services/llm'
import { useWorkspaceStore } from '@/stores/workspace'
import type { Workspace } from '@/types'
import type { KnowledgeRecallTrace } from '../../../../shared/knowledge'
import { normalizeAgentApprovalMode, type AgentApprovalMode, type AgentSession, type ApprovalRequest } from '../../../../shared/ipc/agent-runtime'
import { getAgentSettings } from '@/services/agent-settings'
import type { ChatToolTraceEntry, ChatWorkspaceResource } from '../../../../shared/ipc/llm'
import type {
  JanusChatMessage,
  JanusChatStorageSnapshot,
  PersistedJanusConversation,
} from '../../../../shared/ipc/janus-chat'
import {
  MAX_TOOL_TRACES,
  NEW_CONVERSATION_TITLE,
  capChatMessages,
  createJanusConversation,
  getRetryTurn,
  createInitialSnapshot,
  titleFromMessages,
} from './janusChatConversations'
import {
  JANUS_RESOURCE_STORAGE_KEY,
  parseJanusResourcePreferences,
  type WorkspaceResource,
} from './janusResources'
import {
  appendReasoningDelta,
  emptyReasoning,
  type ReasoningSnapshot,
} from './janusReasoning'
import {
  EMPTY_JANUS_RUNTIME_STATE,
  reduceChatAgentEvent,
  reduceJanusRuntimeState,
  runtimeEventSessionId,
  type JanusRuntimeState,
  type JanusToolActivity,
} from './janusRuntimeState'

export type Message = JanusChatMessage

export interface ConversationSummary {
  id: string
  title: string
  updatedAt: number
  messageCount: number
  isStreaming: boolean
  hasError: boolean
}

export interface ChatModelOption {
  providerId: string
  providerName: string
  modelId: string
  label: string
  isDefault: boolean
  isProviderDefault: boolean
}

export type { WorkspaceResource } from './janusResources'
export type { ReasoningSnapshot } from './janusReasoning'

export interface JanusResourceController {
  resources: WorkspaceResource[]
  availableWorkspaces: Workspace[]
  attachWorkspace: (workspaceId: string) => void
  detachWorkspace: (workspaceId: string) => void
  activities: JanusToolActivity[]
  pendingApprovals: ApprovalRequest[]
  resolveApproval: (approvalId: string, approved: boolean) => void
}

export interface UseJanusChatReturn {
  conversationId: string
  conversationTitle: string
  conversations: ConversationSummary[]
  messages: Message[]
  pendingContent: string
  /** 本轮流式推理快照（仅 UI 展示，永不计入正文与回复判定）。 */
  pendingReasoning: ReasoningSnapshot
  /** 已提交 assistant 消息的思维链快照（key 为消息 id，默认收起回看）。 */
  reasoningByTurn: Record<string, ReasoningSnapshot>
  isStreaming: boolean
  error: string | null
  modelOptions: ChatModelOption[]
  activeModel: ChatModelOption | null
  modelNotice: string | null
  latestRecallTrace: KnowledgeRecallTrace | null
  /** Tool-call trace entries recorded for this conversation, used to inline tool cards under messages. */
  toolTraces: ChatToolTraceEntry[]
  resourceController: JanusResourceController
  send: (text: string) => void
  rewrite: (messageId: string, text: string) => void
  stop: () => void
  retry: () => void
  clear: () => void
  selectModel: (providerId: string, modelId: string) => void
  refreshModels: () => Promise<ChatModelOption[]>
  createConversation: () => string
  selectConversation: (conversationId: string) => void
  renameConversation: (conversationId: string, title: string) => void
  deleteConversation: (conversationId: string) => void
  approvalMode: AgentApprovalMode
  setApprovalMode: (mode: AgentApprovalMode) => void
}

export interface UseJanusChatRegistryReturn {
  islandConversationId: string
  getController: (conversationId?: string) => UseJanusChatReturn
}

interface ConversationRuntime {
  pendingContent: string
  pendingReasoning: ReasoningSnapshot
  reasoningByTurn: Record<string, ReasoningSnapshot>
  isStreaming: boolean
  error: string | null
  modelNotice: string | null
  latestRecallTrace: KnowledgeRecallTrace | null
  agent: JanusRuntimeState
  approvalMode: AgentApprovalMode
}

interface RuntimeHandles {
  generation: number
  active: boolean
  abort: (() => void) | null
  assistantMessageId: string | null
  pendingBuffer: string
  reasoning: ReasoningSnapshot
  flushTimer: number | null
  noticeTimer: number | null
  sessions: Map<string, AgentSession>
}

const HISTORY_MESSAGE_LIMIT = 24

function emptyRuntime(approvalMode: AgentApprovalMode = 'per-action'): ConversationRuntime {
  return {
    pendingContent: '',
    pendingReasoning: emptyReasoning(),
    reasoningByTurn: {},
    isStreaming: false,
    error: null,
    modelNotice: null,
    latestRecallTrace: null,
    agent: EMPTY_JANUS_RUNTIME_STATE,
    approvalMode,
  }
}

function createRuntimeHandles(): RuntimeHandles {
  return {
    generation: 0,
    active: false,
    abort: null,
    assistantMessageId: null,
    pendingBuffer: '',
    reasoning: emptyReasoning(),
    flushTimer: null,
    noticeTimer: null,
    sessions: new Map(),
  }
}

function workspaceResources(
  conversation: PersistedJanusConversation,
  workspaces: Workspace[],
): WorkspaceResource[] {
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]))
  return conversation.attachedWorkspaceIds.flatMap((id) => {
    const workspace = byId.get(id)
    return workspace
      ? [{ workspaceId: workspace.id, workspacePath: workspace.path, workspaceName: workspace.name }]
      : []
  })
}

export function useJanusChat(): UseJanusChatRegistryReturn {
  const availableWorkspaces = useWorkspaceStore((state) => state.workspaces)
  const initialRef = useRef<JanusChatStorageSnapshot>()
  initialRef.current ??= createInitialSnapshot()

  const [conversations, setConversations] = useState(initialRef.current.conversations)
  const [islandConversationId, setIslandConversationId] = useState(initialRef.current.activeConversationId)
  const [runtimeStates, setRuntimeStates] = useState<Record<string, ConversationRuntime>>({})
  const [modelOptions, setModelOptions] = useState<ChatModelOption[]>([])
  const [persistenceReady, setPersistenceReady] = useState(false)
  const [defaultApprovalMode, setDefaultApprovalMode] = useState<AgentApprovalMode>('per-action')

  const conversationsRef = useRef(conversations)
  const runtimesRef = useRef(runtimeStates)
  const workspacesRef = useRef(availableWorkspaces)
  const modelOptionsRef = useRef(modelOptions)
  const handlesRef = useRef(new Map<string, RuntimeHandles>())
  const legacyResourcesRef = useRef(parseJanusResourcePreferences(
    typeof localStorage === 'undefined' ? null : localStorage.getItem(JANUS_RESOURCE_STORAGE_KEY),
  ))

  conversationsRef.current = conversations
  runtimesRef.current = runtimeStates
  workspacesRef.current = availableWorkspaces
  modelOptionsRef.current = modelOptions

  const setRuntime = useCallback((id: string, update: (current: ConversationRuntime) => ConversationRuntime) => {
    setRuntimeStates((current) => {
      const nextRuntime = update(current[id] ?? emptyRuntime())
      const next = { ...current, [id]: nextRuntime }
      runtimesRef.current = next
      return next
    })
  }, [])

  const updateConversations = useCallback((
    update: (current: PersistedJanusConversation[]) => PersistedJanusConversation[],
  ) => {
    setConversations((current) => {
      const next = update(current)
      conversationsRef.current = next
      return next
    })
  }, [])

  const updateConversation = useCallback((
    id: string,
    update: (current: PersistedJanusConversation) => PersistedJanusConversation,
  ) => {
    updateConversations((current) => current.map((conversation) =>
      conversation.id === id ? update(conversation) : conversation))
  }, [updateConversations])

  const getHandles = useCallback((id: string) => {
    let handles = handlesRef.current.get(id)
    if (!handles) {
      handles = createRuntimeHandles()
      handlesRef.current.set(id, handles)
    }
    return handles
  }, [])

  const clearFlushTimer = useCallback((handles: RuntimeHandles) => {
    if (handles.flushTimer === null) return
    window.clearTimeout(handles.flushTimer)
    handles.flushTimer = null
  }, [])

  const flushPending = useCallback((id: string): string => {
    const handles = getHandles(id)
    clearFlushTimer(handles)
    const content = handles.pendingBuffer
    setRuntime(id, (current) => current.pendingContent === content
      ? current
      : { ...current, pendingContent: content })
    return content
  }, [clearFlushTimer, getHandles, setRuntime])

  const scheduleFlush = useCallback((id: string) => {
    const handles = getHandles(id)
    if (handles.flushTimer !== null) return
    handles.flushTimer = window.setTimeout(() => {
      handles.flushTimer = null
      setRuntime(id, (current) => {
        const pendingContent = handles.pendingBuffer
        const pendingReasoning = handles.reasoning
        return current.pendingContent === pendingContent && current.pendingReasoning.text === pendingReasoning.text
          ? current
          : { ...current, pendingContent, pendingReasoning }
      })
    }, 16)
  }, [getHandles, setRuntime])

  const appendPending = useCallback((id: string, delta: string) => {
    if (!delta) return
    const handles = getHandles(id)
    handles.pendingBuffer += delta
    scheduleFlush(id)
  }, [getHandles, scheduleFlush])

  const appendReasoning = useCallback((id: string, delta: string) => {
    if (!delta) return
    const handles = getHandles(id)
    handles.reasoning = appendReasoningDelta(handles.reasoning, delta)
    scheduleFlush(id)
  }, [getHandles, scheduleFlush])

  /**
   * 收敛本轮思维链：清显示态；正文成功落库时把快照挂到该 assistant 消息下供收起回看。
   * 推理永不进入 messages/toolTraces/模型上下文，仅 UI 展示。
   */
  const snapshotReasoning = useCallback((id: string, messageId: string | undefined, store: boolean) => {
    const handles = getHandles(id)
    const snapshot = handles.reasoning
    handles.reasoning = emptyReasoning()
    setRuntime(id, (current) => ({
      ...current,
      pendingReasoning: emptyReasoning(),
      ...(store && messageId && snapshot.chars > 0
        ? { reasoningByTurn: { ...current.reasoningByTurn, [messageId]: snapshot } }
        : {}),
    }))
  }, [getHandles, setRuntime])

  const cancelSessions = useCallback((handles: RuntimeHandles) => {
    const sessions = [...handles.sessions.values()]
    handles.sessions.clear()
    for (const session of sessions) {
      void window.electron.agentRuntime.cancelSession(session.id).catch(() => undefined)
    }
  }, [])

  const invalidateRuntime = useCallback((id: string, cancelAgentSessions = false) => {
    const handles = getHandles(id)
    handles.generation += 1
    handles.active = false
    handles.abort?.()
    handles.abort = null
    clearFlushTimer(handles)
    if (handles.noticeTimer !== null) window.clearTimeout(handles.noticeTimer)
    handles.noticeTimer = null
    handles.pendingBuffer = ''
    handles.reasoning = emptyReasoning()
    if (cancelAgentSessions) cancelSessions(handles)
  }, [cancelSessions, clearFlushTimer, getHandles])

  useEffect(() => {
    void getAgentSettings().then((settings) => setDefaultApprovalMode(normalizeAgentApprovalMode(settings.approvalMode))).catch(() => undefined)
  }, [])

  useEffect(() => {
    let cancelled = false
    const persistence = window.electron.janusChat
    if (!persistence) {
      setPersistenceReady(true)
      return
    }
    void persistence.load().then((snapshot) => {
      if (cancelled || !snapshot?.conversations.length) return
      const activeId = snapshot.conversations.some((item) => item.id === snapshot.activeConversationId)
        ? snapshot.activeConversationId
        : snapshot.conversations[0].id
      conversationsRef.current = snapshot.conversations
      setConversations(snapshot.conversations)
      setIslandConversationId(activeId)
    }).catch(() => undefined).finally(() => {
      if (!cancelled) setPersistenceReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!persistenceReady) return
    const snapshot: JanusChatStorageSnapshot = {
      version: 1,
      activeConversationId: islandConversationId,
      conversations,
    }
    void window.electron.janusChat?.save(snapshot).catch(() => undefined)
  }, [conversations, islandConversationId, persistenceReady])

  const loadConfiguredModels = useCallback(async (): Promise<ChatModelOption[]> => {
    try {
      const [providers, defaultProvider] = await Promise.all([getProviders(), getDefaultProvider()])
      const enabledProviders = providers.filter((provider) => provider.enabled !== false)
      const options = (await Promise.all(enabledProviders.map(async (provider) => {
        const configuredModelIds = provider.models?.length
          ? provider.models
          : [provider.modelId || (defaultProvider?.provider.id === provider.id ? defaultProvider.modelId : '')]
        const models = await listModels(provider.id).catch(() => [])
        const modelIds = [...new Set([...models.map((model) => model.id), ...configuredModelIds].filter(Boolean))]
        return modelIds.map((modelId) => ({
          providerId: provider.id,
          providerName: provider.name,
          modelId,
          label: `${provider.name} / ${modelId}`,
          isDefault: defaultProvider?.provider.id === provider.id && defaultProvider.modelId === modelId,
          isProviderDefault: (provider.defaultModelId || provider.modelId) === modelId,
        }))
      }))).flat()
      modelOptionsRef.current = options
      setModelOptions(options)
      return options
    } catch (error) {
      console.error('Failed to load chat model options:', error)
      modelOptionsRef.current = []
      setModelOptions([])
      return []
    }
  }, [])

  useEffect(() => {
    void loadConfiguredModels()
    const refresh = () => void loadConfiguredModels()
    window.addEventListener('janus:llm-config-changed', refresh)
    return () => window.removeEventListener('janus:llm-config-changed', refresh)
  }, [loadConfiguredModels])

  useEffect(() => {
    const legacy = legacyResourcesRef.current
    if (availableWorkspaces.length === 0 || legacy.attachedWorkspaceIds.length === 0) return
    legacyResourcesRef.current = { version: 1, attachedWorkspaceIds: [] }
    updateConversation(islandConversationId, (conversation) => conversation.attachedWorkspaceIds.length > 0
      ? conversation
      : { ...conversation, attachedWorkspaceIds: legacy.attachedWorkspaceIds, updatedAt: Date.now() })
    localStorage.removeItem(JANUS_RESOURCE_STORAGE_KEY)
  }, [availableWorkspaces, islandConversationId, updateConversation])

  useEffect(() => {
    if (availableWorkspaces.length === 0) return
    const validIds = new Set(availableWorkspaces.map((workspace) => workspace.id))
    updateConversations((current) => {
      let changed = false
      const next = current.map((conversation) => {
        const attachedWorkspaceIds = conversation.attachedWorkspaceIds.filter((id) => validIds.has(id))
        if (attachedWorkspaceIds.length === conversation.attachedWorkspaceIds.length) return conversation
        changed = true
        const handles = handlesRef.current.get(conversation.id)
        if (handles) {
          for (const [workspaceId, session] of handles.sessions) {
            if (validIds.has(workspaceId)) continue
            handles.sessions.delete(workspaceId)
            void window.electron.agentRuntime.cancelSession(session.id).catch(() => undefined)
          }
        }
        return { ...conversation, attachedWorkspaceIds, updatedAt: Date.now() }
      })
      return changed ? next : current
    })
  }, [availableWorkspaces, updateConversations])

  useEffect(() => window.electron.agentRuntime.onEvent((event) => {
    const sessionId = runtimeEventSessionId(event)
    if (!sessionId) return
    for (const [conversationId, handles] of handlesRef.current) {
      if (![...handles.sessions.values()].some((session) => session.id === sessionId)) continue
      setRuntime(conversationId, (current) => ({
        ...current,
        agent: reduceJanusRuntimeState(current.agent, event),
      }))
      break
    }
  }), [setRuntime])

  useEffect(() => () => {
    for (const handles of handlesRef.current.values()) {
      handles.abort?.()
      clearFlushTimer(handles)
      if (handles.noticeTimer !== null) window.clearTimeout(handles.noticeTimer)
      cancelSessions(handles)
    }
    handlesRef.current.clear()
  }, [cancelSessions, clearFlushTimer])

  const ensureAgentSessions = useCallback(async (
    id: string,
    requestedResources: WorkspaceResource[],
  ): Promise<ChatWorkspaceResource[]> => {
    const handles = getHandles(id)
    const approvalMode = runtimesRef.current[id]?.approvalMode ?? defaultApprovalMode
    const resolved = await Promise.all(requestedResources.map(async (resource) => {
      let session = handles.sessions.get(resource.workspaceId)
      if (!session || session.status !== 'running') {
        session = await window.electron.agentRuntime.createSession({
          workspaceId: resource.workspaceId,
          workspaceRoot: resource.workspacePath,
          approvalMode,
        })
        handles.sessions.set(resource.workspaceId, session)
      }
      const conversation = conversationsRef.current.find((item) => item.id === id)
      const current = conversation
        ? workspaceResources(conversation, workspacesRef.current).find((item) =>
            item.workspaceId === resource.workspaceId && item.workspacePath === resource.workspacePath)
        : undefined
      if (!current) {
        handles.sessions.delete(resource.workspaceId)
        await window.electron.agentRuntime.cancelSession(session.id).catch(() => undefined)
        return null
      }
      return { ...current, agentSessionId: session.id }
    }))
    return resolved.filter((resource): resource is ChatWorkspaceResource => resource !== null)
  }, [defaultApprovalMode, getHandles])

  const commitAssistant = useCallback((id: string, content: string, messageId?: string) => {
    if (!content.trim()) return
    const assistantMessageId = messageId ?? crypto.randomUUID()
    updateConversation(id, (conversation) => {
      const messages = capChatMessages([...conversation.messages, {
        id: assistantMessageId,
        role: 'assistant' as const,
        content,
        timestamp: Date.now(),
      }])
      return { ...conversation, messages, updatedAt: Date.now() }
    })
  }, [updateConversation])

  const startRequest = useCallback((id: string, history: Message[], userMessage: Message) => {
    const runtime = runtimesRef.current[id]
    const conversation = conversationsRef.current.find((item) => item.id === id)
    const handles = getHandles(id)
    if (!conversation || runtime?.isStreaming || handles.active) return
    const generation = handles.generation + 1
    handles.generation = generation
    handles.active = true
    handles.abort?.()
    handles.abort = null
    handles.assistantMessageId = crypto.randomUUID()
    clearFlushTimer(handles)
    handles.pendingBuffer = ''
    handles.reasoning = emptyReasoning()

    const nextMessages = capChatMessages([...history, userMessage])
    updateConversation(id, (current) => ({
      ...current,
      title: current.title === NEW_CONVERSATION_TITLE ? titleFromMessages(nextMessages) : current.title,
      messages: nextMessages,
      updatedAt: Date.now(),
    }))
    setRuntime(id, (current) => ({
      ...current,
      pendingContent: '',
      pendingReasoning: emptyReasoning(),
      isStreaming: true,
      error: null,
      latestRecallTrace: null,
      agent: EMPTY_JANUS_RUNTIME_STATE,
    }))

    const chatMessages: ChatMessage[] = [
      ...history.slice(-HISTORY_MESSAGE_LIMIT).map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: 'user', content: userMessage.content },
    ]

    void (async () => {
      const latest = conversationsRef.current.find((item) => item.id === id)
      if (!latest) return
      const resources = workspaceResources(latest, workspacesRef.current)
      const agentResources = await ensureAgentSessions(id, resources)
      if (handles.generation !== generation) return
      const options = modelOptionsRef.current
      const model = options.find((option) =>
        option.providerId === latest.providerId && option.modelId === latest.modelId)
        ?? options.find((option) => option.isDefault)
        ?? options[0]

      const stream = chatStream(
        chatMessages,
        (delta) => {
          if (handles.generation === generation) appendPending(id, delta)
        },
        () => {
          if (handles.generation !== generation) return
          handles.active = false
          handles.abort = null
          const final = flushPending(id)
          handles.pendingBuffer = ''
          setRuntime(id, (current) => ({ ...current, pendingContent: '', isStreaming: false }))
          commitAssistant(id, final, handles.assistantMessageId ?? undefined)
          snapshotReasoning(id, handles.assistantMessageId ?? undefined, final.trim().length > 0)
          handles.assistantMessageId = null
        },
        (error) => {
          if (handles.generation !== generation) return
          handles.active = false
          handles.abort = null
          const final = flushPending(id)
          handles.pendingBuffer = ''
          setRuntime(id, (current) => ({
            ...current,
            pendingContent: '',
            isStreaming: false,
            error,
          }))
          commitAssistant(id, final, handles.assistantMessageId ?? undefined)
          snapshotReasoning(id, handles.assistantMessageId ?? undefined, final.trim().length > 0)
          handles.assistantMessageId = null
        },
        {
          ...(model ? { providerId: model.providerId, modelId: model.modelId } : {}),
          sourceTag: 'janus-chat',
          conversationId: id,
          workspaceResources: agentResources,
          toolTraces: latest.toolTraces,
          onRecallTrace: (trace) => {
            if (handles.generation === generation) {
              setRuntime(id, (current) => ({ ...current, latestRecallTrace: trace }))
            }
          },
          onToolTrace: (entries) => {
            if (handles.generation !== generation) return
            const assistantMessageId = handles.assistantMessageId
            if (!assistantMessageId) return
            updateConversation(id, (current) => ({
              ...current,
              toolTraces: [
                ...current.toolTraces,
                ...entries.map((entry) => ({ ...entry, turnId: assistantMessageId })),
              ].slice(-MAX_TOOL_TRACES),
              updatedAt: Date.now(),
            }))
          },
          onAgentEvent: (agentEvent) => {
            if (handles.generation === generation) {
              if (agentEvent.type === 'reasoning_delta') {
                appendReasoning(id, agentEvent.delta)
              }
              setRuntime(id, (current) => ({
                ...current,
                agent: reduceChatAgentEvent(current.agent, agentEvent),
              }))
            }
          },
        },
      )
      handles.abort = stream.abort
    })().catch((reason: unknown) => {
      if (handles.generation !== generation) return
      handles.active = false
      handles.assistantMessageId = null
      setRuntime(id, (current) => ({
        ...current,
        isStreaming: false,
        error: reason instanceof Error ? reason.message : 'Workspace session failed',
      }))
    })
  }, [appendPending, appendReasoning, clearFlushTimer, commitAssistant, ensureAgentSessions, flushPending, getHandles, setRuntime, snapshotReasoning, updateConversation])

  const stop = useCallback((id: string) => {
    const runtime = runtimesRef.current[id]
    const handles = handlesRef.current.get(id)
    if (!runtime?.isStreaming && !handles?.abort && !handles?.active) return
    if (!handles) return
    handles.generation += 1
    handles.active = false
    handles.abort?.()
    handles.abort = null
    const final = flushPending(id)
    handles.pendingBuffer = ''
    setRuntime(id, (current) => ({ ...current, pendingContent: '', isStreaming: false }))
    commitAssistant(id, final, handles.assistantMessageId ?? undefined)
    snapshotReasoning(id, handles.assistantMessageId ?? undefined, final.trim().length > 0)
    handles.assistantMessageId = null
  }, [commitAssistant, flushPending, setRuntime, snapshotReasoning])

  const send = useCallback((id: string, text: string) => {
    const trimmed = text.trim()
    const conversation = conversationsRef.current.find((item) => item.id === id)
    if (!trimmed || !conversation || runtimesRef.current[id]?.isStreaming || handlesRef.current.get(id)?.active) return
    startRequest(id, conversation.messages, {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    })
  }, [startRequest])

  const rewrite = useCallback((id: string, messageId: string, text: string) => {
    const trimmed = text.trim()
    const conversation = conversationsRef.current.find((item) => item.id === id)
    if (!trimmed || !conversation || runtimesRef.current[id]?.isStreaming || handlesRef.current.get(id)?.active) return
    const index = conversation.messages.findIndex((message) =>
      message.id === messageId && message.role === 'user')
    if (index < 0) return
    const target = conversation.messages[index]
    updateConversation(id, (current) => ({ ...current, toolTraces: [] }))
    startRequest(id, conversation.messages.slice(0, index), { ...target, content: trimmed })
  }, [startRequest, updateConversation])

  const retry = useCallback((id: string) => {
    const conversation = conversationsRef.current.find((item) => item.id === id)
    if (!conversation || runtimesRef.current[id]?.isStreaming || handlesRef.current.get(id)?.active) return
    const turn = getRetryTurn(conversation.messages)
    if (!turn) return
    updateConversation(id, (current) => ({ ...current, toolTraces: [] }))
    startRequest(id, turn.history, turn.userMessage)
  }, [startRequest, updateConversation])

  const clear = useCallback((id: string) => {
    invalidateRuntime(id)
    updateConversation(id, (conversation) => ({
      ...conversation,
      messages: [],
      toolTraces: [],
      updatedAt: Date.now(),
    }))
    setRuntime(id, () => emptyRuntime())
  }, [invalidateRuntime, setRuntime, updateConversation])

  const attachWorkspace = useCallback((id: string, workspaceId: string) => {
    if (!workspacesRef.current.some((workspace) => workspace.id === workspaceId)) return
    updateConversation(id, (conversation) => conversation.attachedWorkspaceIds.includes(workspaceId)
      ? conversation
      : {
          ...conversation,
          attachedWorkspaceIds: [...conversation.attachedWorkspaceIds, workspaceId],
          updatedAt: Date.now(),
        })
  }, [updateConversation])

  const detachWorkspace = useCallback((id: string, workspaceId: string) => {
    const handles = handlesRef.current.get(id)
    const session = handles?.sessions.get(workspaceId)
    if (session) {
      handles!.sessions.delete(workspaceId)
      void window.electron.agentRuntime.cancelSession(session.id).catch(() => undefined)
    }
    updateConversation(id, (conversation) => ({
      ...conversation,
      attachedWorkspaceIds: conversation.attachedWorkspaceIds.filter((item) => item !== workspaceId),
      updatedAt: Date.now(),
    }))
  }, [updateConversation])

  const resolveApproval = useCallback((id: string, approvalId: string, approved: boolean) => {
    const request = runtimesRef.current[id]?.agent.pendingApprovals.find((item) => item.id === approvalId)
    if (!request) return
    void window.electron.agentRuntime.resolveApproval({
      approvalId,
      approved,
      workspaceId: request.workspaceId,
      sessionId: request.sessionId,
      correlationId: request.correlationId,
      toolName: request.toolName,
      actionRisk: request.actionRisk,
    }).then((resolved) => {
      if (!resolved) setRuntime(id, (current) => ({
        ...current,
        error: 'Workspace action approval is no longer active',
      }))
    }).catch((reason: unknown) => {
      setRuntime(id, (current) => ({
        ...current,
        error: reason instanceof Error ? reason.message : 'Workspace action approval failed',
      }))
    })
  }, [setRuntime])

  const selectModel = useCallback((id: string, providerId: string, modelId: string) => {
    const model = modelOptionsRef.current.find((option) =>
      option.providerId === providerId && option.modelId === modelId)
    if (!model) return
    updateConversation(id, (conversation) => ({
      ...conversation,
      providerId,
      modelId,
      updatedAt: Date.now(),
    }))
    const handles = getHandles(id)
    if (handles.noticeTimer !== null) window.clearTimeout(handles.noticeTimer)
    setRuntime(id, (current) => ({ ...current, modelNotice: `Model switched: ${model.modelId}` }))
    handles.noticeTimer = window.setTimeout(() => {
      handles.noticeTimer = null
      setRuntime(id, (current) => ({ ...current, modelNotice: null }))
    }, 1800)
  }, [getHandles, setRuntime, updateConversation])

  const setApprovalMode = useCallback((id: string, mode: AgentApprovalMode) => {
    const normalized = normalizeAgentApprovalMode(mode)
    const handles = getHandles(id)
    setRuntime(id, (current) => ({ ...current, approvalMode: normalized }))
    for (const session of handles.sessions.values()) {
      void window.electron.agentRuntime.setApprovalMode(session.id, normalized).then((updated) => {
        if (!updated) setRuntime(id, (current) => ({ ...current, error: 'Unable to switch Agent permission mode' }))
      }).catch((error: unknown) => setRuntime(id, (current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Unable to switch Agent permission mode',
      })))
    }
  }, [getHandles, setRuntime])

  const createConversation = useCallback(() => {
    const conversation = createJanusConversation()
    updateConversations((current) => [conversation, ...current])
    setIslandConversationId(conversation.id)
    return conversation.id
  }, [updateConversations])

  const selectConversation = useCallback((id: string) => {
    if (conversationsRef.current.some((conversation) => conversation.id === id)) {
      setIslandConversationId(id)
    }
  }, [])

  const renameConversation = useCallback((id: string, title: string) => {
    const normalized = title.trim().replace(/\s+/g, ' ')
    if (!normalized) return
    updateConversation(id, (conversation) => ({
      ...conversation,
      title: normalized.slice(0, 80),
      updatedAt: Date.now(),
    }))
  }, [updateConversation])

  const deleteConversation = useCallback((id: string) => {
    const exists = conversationsRef.current.some((conversation) => conversation.id === id)
    if (!exists) return
    invalidateRuntime(id, true)
    handlesRef.current.delete(id)
    setRuntimeStates((current) => {
      const { [id]: _removed, ...next } = current
      runtimesRef.current = next
      return next
    })
    useWorkspaceStore.getState().removeJanusConversationViews(id)
    const remaining = conversationsRef.current.filter((conversation) => conversation.id !== id)
    const fallback = remaining[0] ?? createJanusConversation()
    const next = remaining.length > 0 ? remaining : [fallback]
    conversationsRef.current = next
    setConversations(next)
    setIslandConversationId((current) => current === id ? fallback.id : current)
  }, [invalidateRuntime])

  const summaries = useMemo<ConversationSummary[]>(() => conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
    isStreaming: runtimeStates[conversation.id]?.isStreaming ?? false,
    hasError: !!runtimeStates[conversation.id]?.error,
  })).sort((a, b) => b.updatedAt - a.updatedAt), [conversations, runtimeStates])

  const getController = useCallback((requestedId?: string): UseJanusChatReturn => {
    const id = requestedId && conversations.some((conversation) => conversation.id === requestedId)
      ? requestedId
      : islandConversationId
    const conversation = conversations.find((item) => item.id === id) ?? conversations[0]
    const runtime = runtimeStates[id] ?? emptyRuntime(defaultApprovalMode)
    const resources = conversation ? workspaceResources(conversation, availableWorkspaces) : []
    const activeModel = modelOptions.find((option) =>
      option.providerId === conversation?.providerId && option.modelId === conversation?.modelId)
      ?? modelOptions.find((option) => option.isDefault)
      ?? modelOptions[0]
      ?? null

    return {
      conversationId: conversation?.id ?? id,
      conversationTitle: conversation?.title ?? NEW_CONVERSATION_TITLE,
      conversations: summaries,
      messages: conversation?.messages ?? [],
      pendingContent: runtime.pendingContent,
      pendingReasoning: runtime.pendingReasoning,
      reasoningByTurn: runtime.reasoningByTurn,
      isStreaming: runtime.isStreaming,
      error: runtime.error,
      modelOptions,
      activeModel,
      modelNotice: runtime.modelNotice,
      latestRecallTrace: runtime.latestRecallTrace,
      toolTraces: conversation?.toolTraces ?? [],
      resourceController: {
        resources,
        availableWorkspaces,
        attachWorkspace: (workspaceId) => attachWorkspace(id, workspaceId),
        detachWorkspace: (workspaceId) => detachWorkspace(id, workspaceId),
        activities: runtime.agent.activities,
        pendingApprovals: runtime.agent.pendingApprovals,
        resolveApproval: (approvalId, approved) => resolveApproval(id, approvalId, approved),
      },
      send: (text) => send(id, text),
      rewrite: (messageId, text) => rewrite(id, messageId, text),
      stop: () => stop(id),
      retry: () => retry(id),
      clear: () => clear(id),
      selectModel: (providerId, modelId) => selectModel(id, providerId, modelId),
      refreshModels: loadConfiguredModels,
      createConversation,
      selectConversation,
      renameConversation,
      deleteConversation,
      approvalMode: runtime.approvalMode,
      setApprovalMode: (mode) => setApprovalMode(id, mode),
    }
  }, [
    attachWorkspace,
    availableWorkspaces,
    clear,
    conversations,
    createConversation,
    defaultApprovalMode,
    deleteConversation,
    detachWorkspace,
    islandConversationId,
    loadConfiguredModels,
    modelOptions,
    renameConversation,
    resolveApproval,
    retry,
    rewrite,
    runtimeStates,
    selectConversation,
    selectModel,
    send,
    setApprovalMode,
    stop,
    summaries,
  ])

  return { islandConversationId, getController }
}
