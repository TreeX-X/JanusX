/**
 * @file JanusChat — 虚幻模糊风格的对话组件
 * @description 与 Janus 数字形象风格一致的对话界面
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Message } from './useJanusChat'

/* ════════════════════════════════════════════════════════════
   类型定义
   ════════════════════════════════════════════════════════════ */

interface JanusChatProps {
  /** 是否显示 */
  visible: boolean
  /** 停靠态：作为右侧 flex 列，而非绝对浮层 */
  docked?: boolean
  /** 当前模式颜色 */
  modeColor: string
  /** 消息列表 */
  messages: Message[]
  /** 当前正在流式接收的内容 */
  pendingContent: string
  /** 是否正在流式输出 */
  isStreaming: boolean
  /** 错误信息 */
  error: string | null
  /** 发送一条用户消息 */
  onSend: (text: string) => void
  /** 停止当前流式输出 */
  onStop: () => void
  /** 重试最后一条用户消息 */
  onRetry: () => void
  /** 清空对话 */
  onClear: () => void
  /** 打开 LLM 配置面板 */
  onOpenLlmConfig: () => void
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

function StreamingText({ content }: { content: string }) {
  return (
    <div className="janus-chat-streaming-text">
      {content}
      <span className="janus-chat-streaming-cursor" aria-hidden="true" />
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   JanusChat 组件
   ════════════════════════════════════════════════════════════ */

export function JanusChat({
  visible,
  docked = false,
  modeColor,
  messages,
  pendingContent,
  isStreaming,
  error,
  onSend,
  onStop,
  onRetry,
  onClear,
  onOpenLlmConfig
}: JanusChatProps) {
  const [input, setInput] = useState('')
  const [rows, setRows] = useState(1)
  const [showNewMessageBadge, setShowNewMessageBadge] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLSpanElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isAtBottomRef = useRef(true)

  // 聚焦定时器句柄，effect 清理时清除，避免视图可见性变化打断流
  const focusTimerRef = useRef<number | null>(null)

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
      scrollToBottom(pendingContent ? 'auto' : 'smooth')
    } else {
      setShowNewMessageBadge(true)
    }
  }, [messages, pendingContent, scrollToBottom])

  // 聚焦输入框；流的实际生命周期由 useJanusChat 持有，视图可见性变化不应 abort 流
  useEffect(() => {
    if (visible) {
      focusTimerRef.current = window.setTimeout(() => inputRef.current?.focus(), 100)
    }
    return () => {
      if (focusTimerRef.current !== null) {
        window.clearTimeout(focusTimerRef.current)
        focusTimerRef.current = null
      }
    }
  }, [visible])

  // 发送消息（支持重试传入指定文本）
  const handleSend = useCallback(
    (textOverride?: string) => {
      const text = (textOverride ?? input).trim()
      if (!text || isStreaming) return

      setInput('')
      setRows(1)
      setShowNewMessageBadge(false)
      isAtBottomRef.current = true
      scrollToBottom('auto')
      onSend(text)
    },
    [input, isStreaming, onSend, scrollToBottom]
  )

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
    onStop()
  }, [onStop])

  // 重试：重新发送最后一条用户消息
  const handleRetry = useCallback(() => {
    onRetry()
  }, [onRetry])

  // 打开 LLM 配置面板（由 Titlebar 透传回调控制）
  const handleOpenLlmConfig = useCallback(() => {
    onOpenLlmConfig()
  }, [onOpenLlmConfig])

  // 清空对话
  const handleClear = useCallback(() => {
    onClear()
    setInput('')
    setRows(1)
  }, [onClear])

  if (!visible) return null

  const isNoProviderError = error === '未配置默认 LLM Provider'
  const canClear = messages.length > 0 || !!pendingContent || !!error
  const hasConversation = messages.length > 0 || !!pendingContent || isStreaming || !!error
  const suggestions = [
    '当前节点',
    '运行状态',
    '下一步'
  ]

  return (
    <div
      className={`janus-chat${docked ? ' janus-chat--docked' : ''}`}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="janus-chat-toolbar">
        <div>
          <span className="janus-chat-toolbar-kicker">Thread</span>
          <strong>Janus</strong>
        </div>
        <div className="janus-chat-toolbar-actions">
          <button
            className="janus-chat-tool-button"
            onClick={handleOpenLlmConfig}
            title="配置 LLM"
            type="button"
          >
            模型
          </button>
          <button
            className="janus-chat-tool-button danger"
            onClick={handleClear}
            disabled={!canClear}
            title="清空对话"
            type="button"
          >
            清空
          </button>
        </div>
      </div>

      {/* 消息区域 */}
      <div
        ref={messagesContainerRef}
        className="janus-chat-messages"
        onScroll={handleScroll}
      >
        {messages.length === 0 && (
          <div className="janus-chat-empty">
            <div className="janus-chat-wordmark" aria-label="JanusX">
              <span className="janus-chat-wordmark-main">Janus</span>
              <span className="janus-chat-wordmark-x" aria-hidden="true">
                <svg
                  className="janus-chat-pixel-x"
                  viewBox="0 0 7 7"
                  shapeRendering="crispEdges"
                  preserveAspectRatio="xMidYMid meet"
                >
                  {/* 左上 → 右下：白 */}
                  <rect x="0" y="0" width="1" height="1" fill="#f6f3ea" />
                  <rect x="1" y="1" width="1" height="1" fill="#f6f3ea" />
                  <rect x="2" y="2" width="1" height="1" fill="#f6f3ea" />
                  <rect x="3" y="3" width="1" height="1" fill="#f6f3ea" />
                  <rect x="4" y="4" width="1" height="1" fill="#f6f3ea" />
                  <rect x="5" y="5" width="1" height="1" fill="#f6f3ea" />
                  <rect x="6" y="6" width="1" height="1" fill="#f6f3ea" />
                  {/* 右上 → 左下：橙（避开中心，让白线穿过交叉点） */}
                  <rect x="6" y="0" width="1" height="1" fill="#ff7a1a" />
                  <rect x="5" y="1" width="1" height="1" fill="#ff7a1a" />
                  <rect x="4" y="2" width="1" height="1" fill="#ff7a1a" />
                  <rect x="2" y="4" width="1" height="1" fill="#ff7a1a" />
                  <rect x="1" y="5" width="1" height="1" fill="#ff7a1a" />
                  <rect x="0" y="6" width="1" height="1" fill="#ff7a1a" />
                </svg>
              </span>
            </div>
            <div className="janus-chat-empty-hint">从当前上下文开始</div>
            <div className="janus-chat-suggestions">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSend(suggestion)}
                  disabled={isStreaming}
                >
                  {suggestion}
                </button>
              ))}
            </div>
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
          <div className="janus-chat-message assistant streaming">
            <div className="janus-chat-message-content">
              {pendingContent ? (
                <StreamingText content={pendingContent} />
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

        <span ref={messagesEndRef} className="janus-chat-end-anchor" />
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

      {/* 输入区域 — opencode 风格方框 composer：row 在上，meta footer 在下 */}
      <div className="janus-chat-input-wrapper">
        <div className="janus-chat-composer-row">
          <span className="janus-chat-prompt-prefix" aria-hidden="true">janusx&gt;</span>
          <textarea
            ref={inputRef}
            className="janus-chat-input"
            rows={rows}
            placeholder="Message JanusX or type /"
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
              aria-label="停止生成"
              type="button"
            >
              ■
            </button>
          ) : (
            <button
              className="janus-chat-send"
              onClick={() => handleSend()}
              disabled={!input.trim() || isStreaming}
              style={{ '--accent-color': modeColor } as React.CSSProperties}
              title="发送"
              aria-label="发送"
              type="button"
            >
              ↑
            </button>
          )}
        </div>
        <div className="janus-chat-composer-meta">
          <span className="janus-chat-composer-chip">JanusX · {isStreaming ? 'STREAMING' : hasConversation ? 'FOLLOW-UP' : 'READY'}</span>
          <span className="janus-chat-composer-hint">⏎ send · ⇧⏎ newline</span>
        </div>
      </div>
    </div>
  )
}
