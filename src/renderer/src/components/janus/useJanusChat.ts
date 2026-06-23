/**
 * @file useJanusChat — 持久化灵动岛对话状态
 * @description 将 JanusChat 状态提升到稳定父级（Titlebar），避免 Expanded 关闭时丢失消息。
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { chatStream, type ChatMessage } from '@/services/llm'

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
  const [pendingContent, setPendingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const messagesRef = useRef(messages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    console.log('[JanusChat] messages updated, count:', messages.length)
  }, [messages])

  const abortRef = useRef<(() => void) | null>(null)
  // 流式文本的唯一累积真值源；pendingContent 只是它的渲染镜像
  const streamAccRef = useRef('')

  const stop = useCallback(() => {
    abortRef.current?.()
    abortRef.current = null
  }, [])

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
      setPendingContent('')
      setIsStreaming(true)
      setError(null)
      streamAccRef.current = ''

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
          // 写入唯一真值源，再镜像到 state 供渲染预览
          streamAccRef.current += delta
          setPendingContent(streamAccRef.current)
          console.log(
            '[JanusChat] delta len:',
            delta.length,
            'total:',
            streamAccRef.current.length,
            'preview:',
            delta.slice(0, 50)
          )
        },
        () => {
          abortRef.current = null
          setIsStreaming(false)
          // 从稳定 ref 读取最终文本，避免闭包局部变量在批处理/重渲染下失步
          const final = streamAccRef.current
          streamAccRef.current = ''
          setPendingContent('')
          console.log(
            '[JanusChat] stream done, final length:',
            final.length,
            'trimmed:',
            final.trim().length
          )
          console.log('[JanusChat] pendingContent cleared/reason: stream done')
          if (final.trim()) {
            setMessages((prev) => [
              ...prev,
              {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: final,
                timestamp: Date.now()
              }
            ])
          }
        },
        (err) => {
          abortRef.current = null
          setIsStreaming(false)
          const final = streamAccRef.current
          streamAccRef.current = ''
          setPendingContent('')
          console.error('[JanusChat] pendingContent cleared/reason: error', err)
          if (final.trim()) {
            setMessages((prev) => [
              ...prev,
              {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: final,
                timestamp: Date.now()
              }
            ])
          }
          setError(err)
        }
      )

      abortRef.current = abort
    },
    [isStreaming]
  )

  const retry = useCallback(() => {
    const lastUser = [...messagesRef.current].reverse().find((m) => m.role === 'user')
    if (lastUser) {
      send(lastUser.content)
    }
  }, [send])

  const clear = useCallback(() => {
    stop()
    setMessages([])
    setPendingContent('')
    streamAccRef.current = ''
    setIsStreaming(false)
    setError(null)
    console.log('[JanusChat] pendingContent cleared/reason: clear chat')
  }, [stop])

  return { messages, pendingContent, isStreaming, error, send, stop, retry, clear }
}
