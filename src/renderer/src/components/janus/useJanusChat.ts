/**
 * @file useJanusChat — 持久化灵动岛对话状态
 * @description 将 JanusChat 状态提升到稳定父级（Titlebar），避免 Expanded 关闭时丢失消息。
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { chatStream, getDefaultProvider, getProviders, type ChatMessage } from '@/services/llm'
import { useWorkspaceStore } from '@/stores/workspace'
import { useStreamingPrinter } from './useStreamingPrinter'
import type { KnowledgeRecallTrace } from '../../../../shared/knowledge'
import type { AgentSession, ToolResult } from '../../../../shared/ipc/agent-runtime'
import type { LaunchConfig, ValidationResult } from '../../../../shared/ipc/project'
import type { Workspace } from '@/types'
import {
  attachWorkspaceResource,
  detachWorkspaceResource,
  ensureEmbeddedWorkspaceResource,
  reconcileWorkspaceResources,
  selectWorkspaceResource,
  type JanusResourceState,
  type WorkspaceResource,
} from './janusResources'
import {
  JANUS_PROJECT_CANDIDATE_EVENT,
  joinWorkspacePath,
  type JanusProjectCandidate,
} from './janusProjectCandidate'

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
}

export type { WorkspaceResource } from './janusResources'

export interface JanusResourceController {
  resources: WorkspaceResource[]
  availableWorkspaces: Workspace[]
  activeResourceId: string | null
  attachWorkspace: (workspaceId: string) => void
  ensureEmbeddedWorkspace: (workspaceId: string) => void
  detachWorkspace: (workspaceId: string) => void
  selectResource: (workspaceId: string) => void
  analysisStatus: 'idle' | 'running' | 'done' | 'error'
  analyzeActiveResource: () => void
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
  cycleModel: () => void
  selectModel: (providerId: string) => void
  refreshModels: () => Promise<ChatModelOption[]>
}

const SYSTEM_PROMPT = (window as Partial<Window>).electron?.janusPersona ?? ''

/*-- 灵动岛对话消息上限：超出从头部裁剪，防止长对话消息数组无界增长 --*/
const MAX_CHAT_MESSAGES = 200

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
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [resourceState, setResourceState] = useState<JanusResourceState>({
    resources: [],
    activeResourceId: null,
  })
  const { resources, activeResourceId } = resourceState
  const activeResource = resources.find((resource) => resource.workspaceId === activeResourceId) ?? null
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
  const activeModelRef = useRef<ChatModelOption | null>(activeModel)
  const agentSessionRef = useRef<AgentSession | null>(null)
  const agentSessionGenerationRef = useRef(0)

  useEffect(() => {
    activeModelRef.current = activeModel
  }, [activeModel])

  useEffect(() => {
    if (!modelNotice) return
    const timer = window.setTimeout(() => setModelNotice(null), 1800)
    return () => window.clearTimeout(timer)
  }, [modelNotice])

  const loadConfiguredModels = useCallback(async (): Promise<ChatModelOption[]> => {
    try {
      const [providers, defaultProvider] = await Promise.all([getProviders(), getDefaultProvider()])
      const options = providers
        .filter((provider) => provider.enabled !== false)
        .map((provider) => {
          const modelId =
            provider.modelId ||
            (defaultProvider?.provider.id === provider.id ? defaultProvider.modelId : '')
          return modelId
            ? {
                providerId: provider.id,
                providerName: provider.name,
                modelId,
                label: `${provider.name} / ${modelId}`,
                isDefault: defaultProvider?.provider.id === provider.id,
              }
            : null
        })
        .filter((option): option is ChatModelOption => option !== null)

      const fallback =
        options.length === 0 && defaultProvider
          ? [{
              providerId: defaultProvider.provider.id,
              providerName: defaultProvider.provider.name,
              modelId: defaultProvider.modelId,
              label: `${defaultProvider.provider.name} / ${defaultProvider.modelId}`,
              isDefault: true,
            }]
          : []
      const nextOptions = options.length > 0 ? options : fallback

      setModelOptions(nextOptions)
      setActiveModel((current) => {
        if (current && nextOptions.some((option) => option.providerId === current.providerId)) {
          return nextOptions.find((option) => option.providerId === current.providerId) ?? current
        }
        return nextOptions.find((option) => option.isDefault) ?? nextOptions[0] ?? null
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
    setResourceState((current) => reconcileWorkspaceResources(current, availableWorkspaces))
  }, [availableWorkspaces])

  useEffect(() => {
    const session = agentSessionRef.current
    if (!session || session.workspace.workspaceId === activeResource?.workspaceId) return
    agentSessionRef.current = null
    agentSessionGenerationRef.current += 1
    void window.electron.agentRuntime.cancelSession(session.id).catch(() => undefined)
    setAnalysisStatus('idle')
  }, [activeResource?.workspaceId])

  useEffect(() => () => {
    const session = agentSessionRef.current
    agentSessionRef.current = null
    agentSessionGenerationRef.current += 1
    if (session) void window.electron.agentRuntime.cancelSession(session.id).catch(() => undefined)
  }, [])

  const attachWorkspace = useCallback((workspaceId: string) => {
    const workspace = availableWorkspaces.find((item) => item.id === workspaceId)
    if (!workspace) return
    setResourceState((current) => attachWorkspaceResource(current, workspace))
  }, [availableWorkspaces])

  const ensureEmbeddedWorkspace = useCallback((workspaceId: string) => {
    const workspace = availableWorkspaces.find((item) => item.id === workspaceId)
    if (!workspace) return
    setResourceState((current) => ensureEmbeddedWorkspaceResource(current, workspace))
  }, [availableWorkspaces])

  const detachWorkspace = useCallback((workspaceId: string) => {
    setResourceState((current) => detachWorkspaceResource(current, workspaceId))
  }, [])

  const selectResource = useCallback((workspaceId: string) => {
    setResourceState((current) => selectWorkspaceResource(current, workspaceId))
  }, [])

  const abortCurrentRequest = useCallback(() => {
    abortRef.current?.()
    abortRef.current = null
  }, [])

  const selectModel = useCallback((providerId: string) => {
    const next = modelOptions.find((option) => option.providerId === providerId)
    if (!next) return
    setActiveModel(next)
    setModelNotice(`Model switched: ${next.modelId}`)
  }, [modelOptions])

  const cycleModel = useCallback(() => {
    const switchFrom = (options: ChatModelOption[]) => {
      if (options.length === 0) {
        setModelNotice('No configured model')
        return
      }
      const current = activeModelRef.current
      const currentIndex = current
        ? options.findIndex((option) => option.providerId === current.providerId)
        : -1
      const next = options[(currentIndex + 1) % options.length] ?? options[0]
      setActiveModel(next)
      setModelNotice(`Model switched: ${next.modelId}`)
    }

    if (modelOptions.length > 0) {
      switchFrom(modelOptions)
      return
    }

    void loadConfiguredModels().then(switchFrom)
  }, [loadConfiguredModels, modelOptions])

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

  const ensureAgentSession = useCallback(async (resource: WorkspaceResource): Promise<AgentSession> => {
    const current = agentSessionRef.current
    if (current?.workspace.workspaceId === resource.workspaceId && current.status === 'running') return current
    if (current) await window.electron.agentRuntime.cancelSession(current.id).catch(() => undefined)
    const generation = ++agentSessionGenerationRef.current
    const session = await window.electron.agentRuntime.createSession({
      workspaceId: resource.workspaceId,
      workspaceRoot: resource.workspacePath,
    })
    if (generation !== agentSessionGenerationRef.current) {
      await window.electron.agentRuntime.cancelSession(session.id).catch(() => undefined)
      throw new Error('Workspace resource changed during analysis')
    }
    agentSessionRef.current = session
    return session
  }, [])

  const requireCompletedOutput = useCallback(<T,>(result: ToolResult): T => {
    if (result.status !== 'completed') throw new Error(result.error || `${result.toolName} ${result.status}`)
    return result.output as T
  }, [])

  const analyzeActiveResource = useCallback(() => {
    if (!activeResource || analysisStatus === 'running') return
    const resource = activeResource
    setAnalysisStatus('running')
    setError(null)
    setMessages((prev) => capMessages([...prev, {
      id: `user-analysis-${Date.now()}`,
      role: 'user',
      content: `Analyze workspace: ${resource.workspaceName}`,
      timestamp: Date.now(),
    }]))

    void (async () => {
      const session = await ensureAgentSession(resource)
      const listed = requireCompletedOutput<{ entries: Array<{ path: string; type: 'file' | 'directory' }>; truncated: boolean }>(
        await window.electron.agentRuntime.executePlannerStep({
          sessionId: session.id,
          call: { toolName: 'workspace.list', input: { workspaceId: resource.workspaceId, depth: 3, maxEntries: 500 } },
        }),
      )
      const detection = requireCompletedOutput<JanusProjectCandidate['detection']>(
        await window.electron.agentRuntime.executePlannerStep({
          sessionId: session.id,
          call: { toolName: 'project.detect', input: { workspaceId: resource.workspaceId, depth: 3, maxDirectories: 100 } },
        }),
      )
      const primary = detection.candidates[0]
      const relativePath = primary?.path ?? ''
      const manifest = listed.entries.find((entry) => entry.type === 'file'
        && entry.path.startsWith(relativePath)
        && /(^|\/)(package\.json|pyproject\.toml|cargo\.toml|go\.mod|cmakelists\.txt)$/i.test(entry.path))
      if (manifest) {
        requireCompletedOutput(await window.electron.agentRuntime.executeFunctionCall({
          sessionId: session.id,
          call: { toolName: 'workspace.read', input: { workspaceId: resource.workspaceId, path: manifest.path, maxBytes: 64 * 1024 } },
        }))
      }
      const generated = requireCompletedOutput<{ config: LaunchConfig; validation: ValidationResult }>(
        await window.electron.agentRuntime.executePlannerStep({
          sessionId: session.id,
          call: {
            toolName: 'project.generate-config',
            input: {
              workspaceId: resource.workspaceId,
              path: relativePath,
              projectType: primary?.type ?? detection.type,
            },
          },
        }),
      )
      const detail: JanusProjectCandidate = {
        workspaceId: resource.workspaceId,
        workspacePath: resource.workspacePath,
        projectPath: joinWorkspacePath(resource.workspacePath, relativePath),
        relativePath,
        config: generated.config,
        validation: generated.validation,
        detection,
      }
      window.dispatchEvent(new CustomEvent(JANUS_PROJECT_CANDIDATE_EVENT, { detail }))
      const evidence = primary?.evidence ?? detection.evidence
      commitAssistantMessage([
        `Analyzed **${resource.workspaceName}** through the workspace Agent Runtime.`,
        '',
        `- Project: \`${primary?.type ?? detection.type}\` (${Math.round((primary?.confidence ?? detection.confidence) * 100)}% confidence)`,
        `- Directory: \`${relativePath || '.'}\``,
        `- Evidence: ${evidence.length > 0 ? evidence.map((item) => `\`${item}\``).join(', ') : 'none'}`,
        `- Files inspected: ${listed.entries.length}${listed.truncated ? '+' : ''}`,
        `- Candidate config: ${generated.validation.valid ? 'validated and opened for review' : 'requires correction'}`,
      ].join('\n'))
      setAnalysisStatus('done')
    })().catch((reason: unknown) => {
      setAnalysisStatus('error')
      setError(reason instanceof Error ? reason.message : 'Workspace analysis failed')
    })
  }, [activeResource, analysisStatus, commitAssistantMessage, ensureAgentSession, requireCompletedOutput])

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
        ...messagesRef.current.slice(-10).map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        })),
        { role: 'user', content: trimmed }
      ]

      const { abort } = chatStream(
        chatMessages,
        (delta) => {
          appendToPrinter(delta)
        },
        () => {
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
        activeModelRef.current
          ? {
              providerId: activeModelRef.current.providerId,
              modelId: activeModelRef.current.modelId,
              sourceTag: 'janus-chat',
              workspaceId: activeResource?.workspaceId,
              workspacePath: activeResource?.workspacePath,
              onRecallTrace: setLatestRecallTrace,
            }
          : {
              sourceTag: 'janus-chat',
              workspaceId: activeResource?.workspaceId,
              workspacePath: activeResource?.workspacePath,
              onRecallTrace: setLatestRecallTrace,
            }
      )

      abortRef.current = abort
    },
    [
      appendToPrinter,
      activeResource,
      commitAssistantMessage,
      completePrinter,
      flushPrinter,
      isStreaming,
      resetPrinter,
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
      activeResourceId,
      attachWorkspace,
      ensureEmbeddedWorkspace,
      detachWorkspace,
      selectResource,
      analysisStatus,
      analyzeActiveResource,
    },
    send,
    stop,
    retry,
    clear,
    cycleModel,
    selectModel,
    refreshModels: loadConfiguredModels,
  }
}
