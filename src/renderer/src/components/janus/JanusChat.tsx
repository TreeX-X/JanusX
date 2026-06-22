/**
 * @file JanusChat — 虚幻模糊风格的对话组件
 * @description 与 Janus 数字形象风格一致的对话界面
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { chatStream, type ChatMessage } from '@/services/llm'

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
   Markdown 渲染组件（内联代码 + 代码块复制）
   ════════════════════════════════════════════════════════════ */

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code: ({ className, children }) => {
          const isInline = !className
          const codeText = String(children).replace(/\n$/, '')
          if (isInline) {
            return <code className="janus-chat-inline-code">{children}</code>
          }
          return (
            <div className="janus-chat-code-block">
              <button
                className="janus-chat-copy-code"
                onClick={() => {
                  navigator.clipboard.writeText(codeText).catch(() => {})
                }}
                title="复制"
              >
                复制
              </button>
              <code>{children}</code>
            </div>
          )
        },
        pre: ({ children }) => <pre className="janus-chat-pre">{children}</pre>
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

/* ════════════════════════════════════════════════════════════
   JanusChat 组件
   ════════════════════════════════════════════════════════════ */

export function JanusChat({ visible, modeColor }: JanusChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [rows, setRows] = useState(1)
  const [isStreaming, setIsStreaming] = useState(false)
  const [pendingContent, setPendingContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showNewMessageBadge, setShowNewMessageBadge] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<(() => void) | null>(null)
  const isAtBottomRef = useRef(true)
  const hasReceivedDeltaRef = useRef(false)

  // 滚动到底部
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }, [])

  // 监听滚动，判断用户是否在底部
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const threshold = 20
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= threshold
    isAtBottomRef.current = atBottom
    if (atBottom) {
      setShowNewMessageBadge(false)
    }
  }, [])

  // 消息/流式内容变化时自动滚动（仅当用户已在底部）
  useEffect(() => {
    if (isAtBottomRef.current) {
      scrollToBottom('smooth')
    } else {
      setShowNewMessageBadge(true)
    }
  }, [messages, pendingContent, scrollToBottom])

  // 聚焦输入框；清理未结束的流
  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
    return () => {
      abortRef.current?.()
    }
  }, [visible])

  // 发送消息（支持重试传入指定文本）
  const handleSend = useCallback(async (textOverride?: string) => {
    const text = (textOverride ?? input).trim()
    if (!text || isStreaming) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setRows(1)
    setIsStreaming(true)
    setPendingContent('')
    setError(null)
    setShowNewMessageBadge(false)
    isAtBottomRef.current = true
    hasReceivedDeltaRef.current = false
    scrollToBottom('auto')

    // 构建对话历史（系统提示 + 最近 10 轮 + 当前用户输入）
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
      { role: 'user', content: text }
    ]

    let streamedBuffer = ''

    const { abort } = chatStream(
      chatMessages,
      (delta) => {
        streamedBuffer += delta
        if (!hasReceivedDeltaRef.current) {
          hasReceivedDeltaRef.current = true
        }
        setPendingContent(prev => prev + delta)
      },
      () => {
        abortRef.current = null
        setIsStreaming(false)
        setPendingContent('')
        if (streamedBuffer.trim()) {
          setMessages(prev => [
            ...prev,
            {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: streamedBuffer,
              timestamp: Date.now()
            }
          ])
        }
        streamedBuffer = ''
      },
      (err) => {
        abortRef.current = null
        setIsStreaming(false)
        setPendingContent('')
        streamedBuffer = ''
        setError(err)
      }
    )

    abortRef.current = abort
  }, [input, isStreaming, messages, scrollToBottom])

  // 输入变化与自动增高（最多 4 行）
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInput(value)
    const lineCount = (value.match(/\n/g) || []).length + 1
    setRows(Math.min(4, Math.max(1, lineCount)))
  }, [])

  // 快捷键：Enter 发送，Shift+Enter 换行
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // 停止生成
  const handleStop = useCallback(() => {
    abortRef.current?.()
  }, [])

  // 重试：重新发送最后一条用户消息
  const handleRetry = useCallback(() => {
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    if (lastUser) {
      handleSend(lastUser.content)
    }
  }, [messages, handleSend])

  // 打开 LLM 配置提示
  const handleOpenLlmConfig = useCallback(() => {
    window.alert('请通过左上角 JanusX 触发器打开 LLM 配置面板。')
    console.log('[JanusChat] 打开 LLM 配置面板（由 Titlebar 的 LLM_CFG 触发器控制）')
  }, [])

  // 清空对话
  const handleClear = useCallback(() => {
    setMessages([])
    setInput('')
    setRows(1)
    setError(null)
    setPendingContent('')
    abortRef.current?.()
  }, [])

  if (!visible) return null

  const isNoProviderError = error === '未配置默认 LLM Provider'

  return (
    <div className="janus-chat">
      {/* 消息区域 */}
      <div
        ref={messagesContainerRef}
        className="janus-chat-messages"
        onScroll={handleScroll}
      >
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
              <MarkdownContent content={msg.content} />
            </div>
          </div>
        ))}

        {(isStreaming || pendingContent) && (
          <div className="janus-chat-message assistant">
            <div className="janus-chat-message-content">
              {pendingContent ? (
                <MarkdownContent content={pendingContent} />
              ) : (
                <div className="janus-chat-loading">
                  <span className="janus-chat-dot" />
                  <span className="janus-chat-dot" />
                  <span className="janus-chat-dot" />
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="janus-chat-error-card">
            <div className="janus-chat-error-text">{error}</div>
            <div className="janus-chat-error-actions">
              <button className="janus-chat-retry" onClick={handleRetry}>
                重试
              </button>
              {isNoProviderError && (
                <button className="janus-chat-config-llm" onClick={handleOpenLlmConfig}>
                  配置 LLM
                </button>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {showNewMessageBadge && (
        <button
          className="janus-chat-new-message-badge"
          onClick={() => {
            isAtBottomRef.current = true
            setShowNewMessageBadge(false)
            scrollToBottom('smooth')
          }}
        >
          ↓ 新消息
        </button>
      )}

      {/* 输入区域 */}
      <div className="janus-chat-input-wrapper">
        <textarea
          ref={inputRef}
          className="janus-chat-input"
          rows={rows}
          placeholder="询问 Janus..."
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          style={{ '--accent-color': modeColor } as React.CSSProperties}
        />
        {isStreaming ? (
          <button
            className="janus-chat-stop"
            onClick={handleStop}
            style={{ '--accent-color': modeColor } as React.CSSProperties}
            title="停止生成"
          >
            ■
          </button>
        ) : (
          <button
            className="janus-chat-send"
            onClick={() => handleSend()}
            disabled={!input.trim() || isStreaming}
            style={{ '--accent-color': modeColor } as React.CSSProperties}
          >
            ↑
          </button>
        )}
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
