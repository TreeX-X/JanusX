/**
 * @file useJanusChat — 持久化灵动岛对话状态
 * @description 将 JanusChat 状态提升到稳定父级（Titlebar），避免 Expanded 关闭时丢失消息。
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { chatStream, getDefaultProvider, getProviders, type ChatMessage } from '@/services/llm'
import { useWorkspaceStore } from '@/stores/workspace'
import { useStreamingPrinter } from './useStreamingPrinter'
import type { KnowledgeRecallTrace } from '../../../../shared/knowledge'

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

export interface UseJanusChatReturn {
  messages: Message[]
  pendingContent: string
  isStreaming: boolean
  error: string | null
  modelOptions: ChatModelOption[]
  activeModel: ChatModelOption | null
  modelNotice: string | null
  latestRecallTrace: KnowledgeRecallTrace | null
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
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId)
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modelOptions, setModelOptions] = useState<ChatModelOption[]>([])
  const [activeModel, setActiveModel] = useState<ChatModelOption | null>(null)
  const [modelNotice, setModelNotice] = useState<string | null>(null)
  const [latestRecallTrace, setLatestRecallTrace] = useState<KnowledgeRecallTrace | null>(null)
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
              workspaceId: activeWorkspace?.id,
              workspacePath: activeWorkspace?.path,
              onRecallTrace: setLatestRecallTrace,
            }
          : {
              sourceTag: 'janus-chat',
              workspaceId: activeWorkspace?.id,
              workspacePath: activeWorkspace?.path,
              onRecallTrace: setLatestRecallTrace,
            }
      )

      abortRef.current = abort
    },
    [
      activeWorkspace?.id,
      activeWorkspace?.path,
      appendToPrinter,
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
    send,
    stop,
    retry,
    clear,
    cycleModel,
    selectModel,
    refreshModels: loadConfiguredModels,
  }
}
