/**
 * @file useJanusChat — 持久化灵动岛对话状态
 * @description 将 JanusChat 状态提升到稳定父级（Titlebar），避免 Expanded 关闭时丢失消息。
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { chatStream, getDefaultProvider, getProviders, listModels, type ChatMessage, type ChatToolTraceEntry } from '@/services/llm'
import { useWorkspaceStore } from '@/stores/workspace'
import { useStreamingPrinter } from '@/hooks/useStreamingPrinter'
import type { KnowledgeRecallTrace } from '../../../../shared/knowledge'
import type { AgentSession, ApprovalRequest } from '../../../../shared/ipc/agent-runtime'
import type { ChatWorkspaceResource } from '../../../../shared/ipc/llm'
import type { Workspace } from '@/types'
import {
  attachWorkspaceResource,
  detachWorkspaceResource,
  JANUS_RESOURCE_STORAGE_KEY,
  parseJanusResourcePreferences,
  reconcileWorkspaceResources,
  restoreJanusResourcePreferences,
  toJanusResourcePreferences,
  type JanusResourceState,
  type WorkspaceResource,
} from './janusResources'
import {
  EMPTY_JANUS_RUNTIME_STATE,
  reduceJanusRuntimeState,
  runtimeEventSessionId,
  type JanusToolActivity,
} from './janusRuntimeState'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
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
  messages: Message[]
  pendingContent: string
  isStreaming: boolean
  error: string | null
  modelOptions: ChatModelOption[]
  activeModel: ChatModelOption | null
  modelNotice: string | null
  latestRecallTrace: KnowledgeRecallTrace | null
  resourceController: JanusResourceController
  send: (text: string) => void
  stop: () => void
  retry: () => void
  clear: () => void
  selectModel: (providerId: string, modelId: string) => void
  refreshModels: () => Promise<ChatModelOption[]>
}

const SYSTEM_PROMPT = (window as Partial<Window>).electron?.janusPersona ?? ''

/*-- 灵动岛对话消息上限：超出从头部裁剪，防止长对话消息数组无界增长 --*/
const MAX_CHAT_MESSAGES = 200
/*-- 发送给模型的历史条数与工具轨迹条数上限 --*/
const HISTORY_MESSAGE_LIMIT = 24
const MAX_TOOL_TRACES = 48

function capMessages(messages: Message[]): Message[] {
  return messages.length > MAX_CHAT_MESSAGES ? messages.slice(-MAX_CHAT_MESSAGES) : messages
}

export function useJanusChat(): UseJanusChatReturn {
  const availableWorkspaces = useWorkspaceStore((state) => state.workspaces)
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modelOptions, setModelOptions] = useState<ChatModelOption[]>([])
  const [activeModel, setActiveModel] = useState<ChatModelOption | null>(null)
  const [modelNotice, setModelNotice] = useState<string | null>(null)
  const [latestRecallTrace, setLatestRecallTrace] = useState<KnowledgeRecallTrace | null>(null)
  const [runtimeState, setRuntimeState] = useState(EMPTY_JANUS_RUNTIME_STATE)
  const [resourceState, setResourceState] = useState<JanusResourceState>({ resources: [] })
  const { resources } = resourceState
  const {
    output: printedContent,
    append: appendToPrinter,
    complete: completePrinter,
    flush: flushPrinter,
    reset: resetPrinter
  } = useStreamingPrinter()

  const messagesRef = useRef(messages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const abortRef = useRef<(() => void) | null>(null)
  const streamIdRef = useRef(0)
  /*-- 跨轮次工具轨迹：主进程每轮流结束时回传,下一轮随请求带回,模型据此保留文件/hash 上下文 --*/
  const toolTracesRef = useRef<ChatToolTraceEntry[]>([])
  const activeModelRef = useRef<ChatModelOption | null>(activeModel)
  const agentSessionsRef = useRef(new Map<string, AgentSession>())
  const resourcesRef = useRef(resources)
  const resourcePreferencesRef = useRef(parseJanusResourcePreferences(
    typeof localStorage === 'undefined' ? null : localStorage.getItem(JANUS_RESOURCE_STORAGE_KEY),
  ))
  const resourcesHydratedRef = useRef(false)

  useEffect(() => {
    activeModelRef.current = activeModel
  }, [activeModel])

  useEffect(() => {
    if (!modelNotice) return
    const timer = window.setTimeout(() => setModelNotice(null), 1800)
    return () => window.clearTimeout(timer)
  }, [modelNotice])

  const loadConfiguredModels = useCallback(async (
    preferDefault = false,
    updatedProviderId?: string,
  ): Promise<ChatModelOption[]> => {
    try {
      const [providers, defaultProvider] = await Promise.all([getProviders(), getDefaultProvider()])
      const enabledProviders = providers.filter((provider) => provider.enabled !== false)
      const nextOptions = (await Promise.all(enabledProviders.map(async (provider) => {
        const configuredModelId = provider.modelId ||
          (defaultProvider?.provider.id === provider.id ? defaultProvider.modelId : '')
        const models = await listModels(provider.id).catch(() => [])
        const modelIds = [...new Set([...models.map((model) => model.id), configuredModelId].filter(Boolean))]
        return modelIds.map((modelId) => ({
          providerId: provider.id,
          providerName: provider.name,
          modelId,
          label: `${provider.name} / ${modelId}`,
          isDefault: defaultProvider?.provider.id === provider.id && defaultProvider.modelId === modelId,
          isProviderDefault: configuredModelId === modelId,
        }))
      }))).flat()

      setModelOptions(nextOptions)
      setActiveModel((current) => {
        const configuredDefault = nextOptions.find((option) => option.isDefault)
        if (preferDefault) return configuredDefault ?? nextOptions[0] ?? null
        if (current && updatedProviderId === current.providerId) {
          return nextOptions.find((option) => option.providerId === current.providerId && option.isProviderDefault)
            ?? nextOptions.find((option) => option.providerId === current.providerId)
            ?? configuredDefault
            ?? null
        }
        if (current) {
          const unchanged = nextOptions.find((option) =>
            option.providerId === current.providerId && option.modelId === current.modelId)
          if (unchanged) return unchanged
        }
        return configuredDefault ?? nextOptions[0] ?? null
      })
      return nextOptions
    } catch (err) {
      console.error('Failed to load chat model options:', err)
      setModelOptions([])
      setActiveModel(null)
      return []
    }
  }, [])

  useEffect(() => {
    void loadConfiguredModels()
  }, [loadConfiguredModels])

  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ preferDefault?: boolean; updatedProviderId?: string }>).detail
      void loadConfiguredModels(detail?.preferDefault === true, detail?.updatedProviderId)
    }
    window.addEventListener('janus:llm-config-changed', refresh)
    return () => window.removeEventListener('janus:llm-config-changed', refresh)
  }, [loadConfiguredModels])

  useEffect(() => {
    if (!resourcesHydratedRef.current && availableWorkspaces.length === 0) return
    setResourceState((current) => {
      const restored = resourcesHydratedRef.current
        ? current
        : restoreJanusResourcePreferences(resourcePreferencesRef.current, availableWorkspaces)
      resourcesHydratedRef.current = true
      return reconcileWorkspaceResources(restored, availableWorkspaces)
    })
  }, [availableWorkspaces])

  useEffect(() => {
    if (!resourcesHydratedRef.current || typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(JANUS_RESOURCE_STORAGE_KEY, JSON.stringify(toJanusResourcePreferences(resourceState)))
    } catch {
      // Persistence is optional; the active in-memory resource remains usable.
    }
  }, [resourceState])

  useEffect(() => {
    resourcesRef.current = resources
    const resourceIds = new Set(resources.map((resource) => resource.workspaceId))
    for (const [workspaceId, session] of agentSessionsRef.current) {
      if (resourceIds.has(workspaceId)) continue
      agentSessionsRef.current.delete(workspaceId)
      void window.electron.agentRuntime.cancelSession(session.id).catch(() => undefined)
    }
    if (resourceIds.size === 0) setRuntimeState(EMPTY_JANUS_RUNTIME_STATE)
  }, [resources])

  useEffect(() => window.electron.agentRuntime.onEvent((event) => {
    const sessionId = runtimeEventSessionId(event)
    if (!sessionId || ![...agentSessionsRef.current.values()].some((session) => session.id === sessionId)) return
    setRuntimeState((current) => reduceJanusRuntimeState(current, event))
  }), [])

  useEffect(() => () => {
    const sessions = [...agentSessionsRef.current.values()]
    agentSessionsRef.current.clear()
    for (const session of sessions) {
      void window.electron.agentRuntime.cancelSession(session.id).catch(() => undefined)
    }
  }, [])

  const attachWorkspace = useCallback((workspaceId: string) => {
    const workspace = availableWorkspaces.find((item) => item.id === workspaceId)
    if (!workspace) return
    setResourceState((current) => attachWorkspaceResource(current, workspace))
  }, [availableWorkspaces])

  const detachWorkspace = useCallback((workspaceId: string) => {
    setResourceState((current) => detachWorkspaceResource(current, workspaceId))
  }, [])

  const resolveApproval = useCallback((approvalId: string, approved: boolean) => {
    const request = runtimeState.pendingApprovals.find((item) => item.id === approvalId)
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
      if (!resolved) setError('Workspace action approval is no longer active')
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Workspace action approval failed')
    })
  }, [runtimeState.pendingApprovals])

  const abortCurrentRequest = useCallback(() => {
    abortRef.current?.()
    abortRef.current = null
  }, [])

  const selectModel = useCallback((providerId: string, modelId: string) => {
    const next = modelOptions.find((option) => option.providerId === providerId && option.modelId === modelId)
    if (!next) return
    setActiveModel(next)
    setModelNotice(`Model switched: ${next.modelId}`)
  }, [modelOptions])

  const commitAssistantMessage = useCallback((content: string) => {
    if (!content.trim()) return
    setMessages((prev) => capMessages([
      ...prev,
      {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content,
        timestamp: Date.now()
      }
    ]))
  }, [])

  const ensureAgentSessions = useCallback(async (
    requestedResources: WorkspaceResource[],
  ): Promise<ChatWorkspaceResource[]> => {
    const resolved = await Promise.all(requestedResources.map(async (resource) => {
      let session = agentSessionsRef.current.get(resource.workspaceId)
      if (!session || session.status !== 'running') {
        session = await window.electron.agentRuntime.createSession({
          workspaceId: resource.workspaceId,
          workspaceRoot: resource.workspacePath,
        })
        agentSessionsRef.current.set(resource.workspaceId, session)
      }

      const current = resourcesRef.current.find((item) =>
        item.workspaceId === resource.workspaceId && item.workspacePath === resource.workspacePath)
      if (!current) {
        agentSessionsRef.current.delete(resource.workspaceId)
        await window.electron.agentRuntime.cancelSession(session.id).catch(() => undefined)
        return null
      }
      return {
        workspaceId: current.workspaceId,
        workspacePath: current.workspacePath,
        workspaceName: current.workspaceName,
        agentSessionId: session.id,
      }
    }))
    return resolved.filter((resource): resource is ChatWorkspaceResource => resource !== null)
  }, [])

  const stop = useCallback(() => {
    if (!isStreaming && !abortRef.current) return
    streamIdRef.current += 1
    abortCurrentRequest()
    const final = flushPrinter()
    resetPrinter()
    setIsStreaming(false)
    commitAssistantMessage(final)
  }, [abortCurrentRequest, commitAssistantMessage, flushPrinter, isStreaming, resetPrinter])

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isStreaming) return

      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp: Date.now()
      }

      setMessages((prev) => capMessages([...prev, userMessage]))
      const streamId = streamIdRef.current + 1
      streamIdRef.current = streamId
      resetPrinter()
      setIsStreaming(true)
      setError(null)

      const chatMessages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messagesRef.current.slice(-HISTORY_MESSAGE_LIMIT).map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        })),
        { role: 'user', content: trimmed }
      ]

      void (async () => {
        const workspaceResources = await ensureAgentSessions(resources)
        if (streamIdRef.current !== streamId) return
        const model = activeModelRef.current
        const { abort } = chatStream(
          chatMessages,
          (delta) => {
            if (streamIdRef.current === streamId) appendToPrinter(delta)
          },
          () => {
            if (streamIdRef.current !== streamId) return
            abortRef.current = null
            void completePrinter().then((final) => {
              if (streamIdRef.current !== streamId) return
              setIsStreaming(false)
              resetPrinter()
              commitAssistantMessage(final)
            })
          },
          (err) => {
            if (streamIdRef.current !== streamId) return
            abortRef.current = null
            setIsStreaming(false)
            const final = flushPrinter()
            resetPrinter()
            commitAssistantMessage(final)
            setError(err)
          },
          {
            ...(model ? { providerId: model.providerId, modelId: model.modelId } : {}),
            sourceTag: 'janus-chat',
            workspaceResources,
            toolTraces: toolTracesRef.current,
            onRecallTrace: setLatestRecallTrace,
            onToolTrace: (entries) => {
              toolTracesRef.current = [...toolTracesRef.current, ...entries].slice(-MAX_TOOL_TRACES)
            },
          },
        )
        abortRef.current = abort
      })().catch((reason: unknown) => {
        if (streamIdRef.current !== streamId) return
        setIsStreaming(false)
        resetPrinter()
        setError(reason instanceof Error ? reason.message : 'Workspace session failed')
      })
    },
    [
      appendToPrinter,
      commitAssistantMessage,
      completePrinter,
      ensureAgentSessions,
      flushPrinter,
      isStreaming,
      resetPrinter,
      resources,
    ]
  )

  const retry = useCallback(() => {
    const lastUser = [...messagesRef.current].reverse().find((m) => m.role === 'user')
    if (lastUser) {
      send(lastUser.content)
    }
  }, [send])

  const clear = useCallback(() => {
    streamIdRef.current += 1
    abortCurrentRequest()
    setMessages([])
    toolTracesRef.current = []
    resetPrinter()
    setIsStreaming(false)
    setError(null)
    setLatestRecallTrace(null)
  }, [abortCurrentRequest, resetPrinter])

  return {
    messages,
    pendingContent: printedContent,
    isStreaming,
    error,
    modelOptions,
    activeModel,
    modelNotice,
    latestRecallTrace,
    resourceController: {
      resources,
      availableWorkspaces,
      attachWorkspace,
      detachWorkspace,
      activities: runtimeState.activities,
      pendingApprovals: runtimeState.pendingApprovals,
      resolveApproval,
    },
    send,
    stop,
    retry,
    clear,
    selectModel,
    refreshModels: loadConfiguredModels,
  }
}
