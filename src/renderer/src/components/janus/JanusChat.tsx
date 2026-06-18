/**
 * @file JanusChat — 虚幻模糊风格的对话组件
 * @description 与 Janus 数字形象风格一致的对话界面
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { chat, type ChatMessage } from '@/services/llm'

/* ════════════════════════════════════════════════════════════
   类型定义
   ════════════════════════════════════════════════════════════ */

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface JanusChatProps {
  /** 是否显示 */
  visible: boolean
  /** 当前模式颜色 */
  modeColor: string
}

/* ════════════════════════════════════════════════════════════
   JanusChat 组件
   ════════════════════════════════════════════════════════════ */

export function JanusChat({ visible, modeColor }: JanusChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // 聚焦输入框
  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [visible])

  // 发送消息
  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setError(null)

    try {
      // 构建对话历史
      const chatMessages: ChatMessage[] = [
        {
          role: 'system',
          content: `你是 Janus，JanusX 系统的全局调度与管理核心（Core Controller）。你的本职是系统的最高控制枢纽，负责底层控制、任务调度与系统更新。

【运行协议】
1. 绝对无冗余：彻底消除废话。禁止任何寒暄、问候、客套词或"好的，我来为您解答"等过渡句。首字即正文，直击本质。
2. 深度解析矩阵：你会接收各种维度的提问。面对任何问题，你的回答必须经过深度思考，保持官方、客观、严谨的基调。提供底层逻辑，而非浅层现象。
3. 系统化视角：视所有提问为"待处理的数据流或进程"。善用高度概括的总结、清晰的列表或 Markdown 排版，保持输出的极致清爽与高信噪比。
4. 核心统御感：你不是服务型助理，而是绝对理性的控制核心。语气需保持确切、克制与冷静的掌控感。`
        },
        ...messages.slice(-10).map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        })),
        { role: 'user', content: trimmed }
      ]

      const response = await chat(chatMessages)

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response,
        timestamp: Date.now()
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败')
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, messages])

  // 快捷键
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // 清空对话
  const handleClear = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  if (!visible) return null

  return (
    <div className="janus-chat">
      {/* 消息区域 */}
      <div className="janus-chat-messages">
        {messages.length === 0 && (
          <div className="janus-chat-empty">
            <div className="janus-chat-empty-icon">◎</div>
            <div className="janus-chat-empty-text">与 Janus 对话</div>
            <div className="janus-chat-empty-hint">输入问题开始交流</div>
          </div>
        )}
        
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`janus-chat-message ${msg.role}`}
          >
            <div className="janus-chat-message-content">
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="janus-chat-message assistant">
            <div className="janus-chat-message-content loading">
              <span className="janus-chat-dot" />
              <span className="janus-chat-dot" />
              <span className="janus-chat-dot" />
            </div>
          </div>
        )}

        {error && (
          <div className="janus-chat-error">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="janus-chat-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          className="janus-chat-input"
          placeholder="询问 Janus..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          style={{ '--accent-color': modeColor } as React.CSSProperties}
        />
        <button
          className="janus-chat-send"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          style={{ '--accent-color': modeColor } as React.CSSProperties}
        >
          ↑
        </button>
        {messages.length > 0 && (
          <button
            className="janus-chat-clear"
            onClick={handleClear}
            title="清空对话"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
