/**
 * @file JanusChat �?虚幻模糊风格的对话组�?
 * @description �?Janus 数字形象风格一致的对话界面
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatModelOption, Message } from './useJanusChat'

/* ════════════════════════════════════════════════════════════
   类型定义
   ════════════════════════════════════════════════════════════ */

interface JanusChatProps {
  /** 是否显示 */
  visible: boolean
  /** 停靠态：作为右侧 flex 列，而非绝对浮层 */
  docked?: boolean
  /** Fill a central workspace pane instead of using Island geometry. */
  workspace?: boolean
  /** Only the focused presentation owns input focus and global shortcuts. */
  focused?: boolean
  /** 当前模式颜色 */
  modeColor: string
  /** 消息列表 */
  messages: Message[]
  /** 当前正在流式接收的内�?*/
  pendingContent: string
  /** 是否正在流式输出 */
  isStreaming: boolean
  /** 错误信息 */
  error: string | null
  modelOptions?: ChatModelOption[]
  activeModel?: ChatModelOption | null
  modelNotice?: string | null
  onCycleModel?: () => void
  onSelectModel?: (providerId: string) => void
  /** 发送一条用户消�?*/
  onSend: (text: string) => void
  /** 停止当前流式输出 */
  onStop: () => void
  /** 重试最后一条用户消�?*/
  onRetry: () => void
  /** 清空对话 */
  onClear: () => void
  /** 打开 LLM 配置面板 */
  onOpenLlmConfig: () => void
  onAddToWorkspace?: () => void
}

/* ════════════════════════════════════════════════════════════
   Markdown 渲染组件（内联代�?+ 代码块复制）
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

function StopIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  )
}

const PIXEL_WORDMARK = {
  J: ['0011', '0001', '0001', '1001', '0110'],
  A: ['0110', '1001', '1111', '1001', '1001'],
  N: ['1001', '1101', '1011', '1001', '1001'],
  U: ['1001', '1001', '1001', '1001', '0110'],
  S: ['0111', '1000', '0110', '0001', '1110'],
  X: ['10002', '01020', '00100', '02010', '20001'],
} as const

function PixelChar({ pattern, isX = false }: { pattern: readonly string[]; isX?: boolean }) {
  return (
    <span
      className={`janus-chat-pixel-char${isX ? ' janus-chat-pixel-char--x' : ''}`}
      data-cells={pattern[0]?.length ?? 4}
      aria-hidden="true"
    >
      {pattern.flatMap((row, rowIndex) =>
        [...row].map((cell, cellIndex) => {
          const className =
            cell === '0'
              ? ''
              : isX && cell === '1'
                ? 'x-orange'
                : isX && cell === '2'
                  ? 'x-gray'
                  : 'active'
          return <span key={`${rowIndex}-${cellIndex}`} className={className} />
        })
      )}
    </span>
  )
}

function JanusXTerminalBanner() {
  return (
    <div className="janus-chat-terminal-banner" role="img" aria-label="JanusX">
      <div className="janus-chat-terminal-logo">
        <PixelChar pattern={PIXEL_WORDMARK.J} />
        <PixelChar pattern={PIXEL_WORDMARK.A} />
        <PixelChar pattern={PIXEL_WORDMARK.N} />
        <PixelChar pattern={PIXEL_WORDMARK.U} />
        <PixelChar pattern={PIXEL_WORDMARK.S} />
        <PixelChar pattern={PIXEL_WORDMARK.X} isX />
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   JanusChat 组件
   ════════════════════════════════════════════════════════════ */

export function JanusChat({
  visible,
  docked = false,
  workspace = false,
  focused = true,
  modeColor,
  messages,
  pendingContent,
  isStreaming,
  error,
  modelOptions = [],
  activeModel = null,
  modelNotice = null,
  onCycleModel = () => {},
  onSelectModel = () => {},
  onSend,
  onStop,
  onRetry,
  onClear,
  onOpenLlmConfig,
  onAddToWorkspace,
}: JanusChatProps) {
  const [input, setInput] = useState('')
  const [rows, setRows] = useState(1)
  const [showNewMessageBadge, setShowNewMessageBadge] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLSpanElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isAtBottomRef = useRef(true)

  // 聚焦定时器句柄，effect 清理时清除，避免视图可见性变化打断流
  const focusTimerRef = useRef<number | null>(null)

  // 滚动到底�?
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

  // 消息/流式内容变化时自动滚动（仅当用户已在底部�?
  useEffect(() => {
    if (isAtBottomRef.current) {
      scrollToBottom(pendingContent ? 'auto' : 'smooth')
    } else {
      setShowNewMessageBadge(true)
    }
  }, [messages, pendingContent, scrollToBottom])

  // 聚焦输入框；流的实际生命周期�?useJanusChat 持有，视图可见性变化不�?abort �?
  useEffect(() => {
    if (visible && focused) {
      focusTimerRef.current = window.setTimeout(() => inputRef.current?.focus(), 100)
    }
    return () => {
      if (focusTimerRef.current !== null) {
        window.clearTimeout(focusTimerRef.current)
        focusTimerRef.current = null
      }
    }
  }, [focused, visible])

  // 发送消息（支持重试传入指定文本�?
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

  // 输入变化与自动增高（最�?4 行）
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInput(value)
    const lineCount = (value.match(/\n/g) || []).length + 1
    setRows(Math.min(4, Math.max(1, lineCount)))
  }, [])

  // 快捷键：Enter 发送，Shift+Enter 换行
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault()
      e.stopPropagation()
      onCycleModel()
      setShowModelMenu(false)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend, onCycleModel])

  useEffect(() => {
    if (!visible || !focused) return
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'p') return
      event.preventDefault()
      onCycleModel()
      setShowModelMenu(false)
    }
    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [focused, onCycleModel, visible])

  // 停止生成
  const handleStop = useCallback(() => {
    onStop()
  }, [onStop])

  // 重试：重新发送最后一条用户消�?
  const handleRetry = useCallback(() => {
    onRetry()
  }, [onRetry])

  // 打开 LLM 配置面板（由 Titlebar 透传回调控制�?
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

  const isNoProviderError = error === '未配置默�?LLM Provider'
  const canClear = messages.length > 0 || !!pendingContent || !!error
  const hasConversation = messages.length > 0 || !!pendingContent || isStreaming || !!error
  const activeModelLabel = activeModel?.modelId ?? 'No model configured'

  return (
    <div
      className={`janus-chat${docked ? ' janus-chat--docked' : ''}${workspace ? ' janus-chat--workspace' : ''}${hasConversation ? ' janus-chat--active' : ' janus-chat--empty'}`}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {onAddToWorkspace && (
        <button
          className="janus-chat-workspace-action"
          onClick={onAddToWorkspace}
          aria-label="Add Chat to workspace"
          title="Add Chat to workspace"
          type="button"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
            <path d="M14 10h5M16.5 7.5 19 10l-2.5 2.5" />
          </svg>
        </button>
      )}
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
            <JanusXTerminalBanner />
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className={`janus-chat-message ${msg.role}`}
          >
            <div className="janus-chat-message-author">
              {msg.role === 'user' ? 'You' : 'JANUSX'}
            </div>
            <div className="janus-chat-message-content">
              <MarkdownContent content={msg.content} />
            </div>
          </div>
        ))}

        {(isStreaming || pendingContent) && (
          <div className="janus-chat-message assistant streaming">
            <div className="janus-chat-message-author">JANUSX</div>
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
          �?新消�?
        </button>
      )}

      {/* 输入区域 �?opencode 风格方框 composer：单�?prompt + textarea + 按钮 */}
      <div className="janus-chat-input-wrapper" data-has-input={input.length > 0}>
        <div className="janus-chat-composer-row">
          <textarea
            ref={inputRef}
            className="janus-chat-input"
            rows={rows}
            placeholder="Message Janus or execute command..."
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            style={{ '--accent-color': modeColor } as React.CSSProperties}
          />
          {isStreaming && (
            <button
              className="janus-chat-stop"
              onClick={handleStop}
              style={{ '--accent-color': modeColor } as React.CSSProperties}
              title="停止生成"
              aria-label="停止生成"
              type="button"
            >
              <StopIcon />
            </button>
          )}
        </div>
        <div className="janus-chat-status-bar">
          <button
            type="button"
            className="janus-chat-model-tag"
            onClick={() => {
              if (modelOptions.length > 1) {
                setShowModelMenu((current) => !current)
                return
              }
              onCycleModel()
            }}
            title="Ctrl+P switch configured model"
          >
            <span>Model:</span>
            <strong>{activeModelLabel}</strong>
          </button>
          <div className="janus-chat-shortcuts">
            <span>JANUS.md</span>
            <span><kbd>tab</kbd> agents</span>
            <span><kbd>ctrl+p</kbd> models</span>
          </div>
          {showModelMenu && modelOptions.length > 1 && (
            <div className="janus-chat-model-menu">
              {modelOptions.map((option) => (
                <button
                  key={option.providerId}
                  type="button"
                  data-active={activeModel?.providerId === option.providerId}
                  onClick={() => {
                    onSelectModel(option.providerId)
                    setShowModelMenu(false)
                  }}
                >
                  <span>{option.providerName}</span>
                  <strong>{option.modelId}</strong>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {modelNotice && <div className="janus-chat-model-notice">{modelNotice}</div>}
    </div>
  )
}
