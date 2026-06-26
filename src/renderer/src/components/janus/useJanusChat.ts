/**
 * @file useJanusChat — 持久化灵动岛对话状态
 * @description 将 JanusChat 状态提升到稳定父级（Titlebar），避免 Expanded 关闭时丢失消息。
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { chatStream, type ChatMessage } from '@/services/llm'
import { useStreamingPrinter } from './useStreamingPrinter'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface UseJanusChatReturn {
  messages: Message[]
  pendingContent: string
  isStreaming: boolean
  error: string | null
  send: (text: string) => void
  stop: () => void
  retry: () => void
  clear: () => void
}

const SYSTEM_PROMPT = window.electron.janusPersona

export function useJanusChat(): UseJanusChatReturn {
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  const abortCurrentRequest = useCallback(() => {
    abortRef.current?.()
    abortRef.current = null
  }, [])

  const commitAssistantMessage = useCallback((content: string) => {
    if (!content.trim()) return
    setMessages((prev) => [
      ...prev,
      {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content,
        timestamp: Date.now()
      }
    ])
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

      setMessages((prev) => [...prev, userMessage])
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
        }
      )

      abortRef.current = abort
    },
    [appendToPrinter, commitAssistantMessage, completePrinter, flushPrinter, isStreaming, resetPrinter]
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
  }, [abortCurrentRequest, resetPrinter])

  return { messages, pendingContent: printedContent, isStreaming, error, send, stop, retry, clear }
}
