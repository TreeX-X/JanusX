/**
 * @file JanusChat �?虚幻模糊风格的对话组�?
 * @description �?Janus 数字形象风格一致的对话界面
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Check, ChevronDown, CircleCheck, CircleX, LoaderCircle, PanelRightOpen, Pencil, Plus, ShieldX, Trash2, X } from 'lucide-react'
import type { ChatModelOption, JanusResourceController, Message, UseJanusChatReturn } from './useJanusChat'
import { useOptionalJanusChatController } from './JanusChatProvider'
import { MarkdownContent, StreamingText } from '../chat/ChatContent'
import { Select } from '../ui/Select'

type SelectionMenu = 'provider' | 'model'

function getProviderMenuOptions(options: ChatModelOption[]): ChatModelOption[] {
  return [...new Set(options.map((option) => option.providerId))]
    .map((providerId) => options.find((option) => option.providerId === providerId && option.isProviderDefault)
      ?? options.find((option) => option.providerId === providerId))
    .filter((option): option is ChatModelOption => option !== undefined)
}

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
  resourceController?: JanusResourceController
  conversationController?: UseJanusChatReturn | null
  onSelectModel?: (providerId: string, modelId: string) => void
  /** 发送一条用户消�?*/
  onSend: (text: string) => void
  /** 重写历史用户消息并从该轮重新生成 */
  onRewrite: (messageId: string, text: string) => void
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
  resourceController,
  conversationController,
  onSelectModel = () => {},
  onSend,
  onRewrite,
  onStop,
  onRetry,
  onClear,
  onOpenLlmConfig,
  onAddToWorkspace,
}: JanusChatProps) {
  const [input, setInput] = useState('')
  const [rows, setRows] = useState(1)
  const [showNewMessageBadge, setShowNewMessageBadge] = useState(false)
  const [selectionMenu, setSelectionMenu] = useState<SelectionMenu | null>(null)
  const [menuIndex, setMenuIndex] = useState(0)
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [threadMenuOpen, setThreadMenuOpen] = useState(false)
  const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null)
  const [renamingTitle, setRenamingTitle] = useState('')
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLSpanElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const editInputRef = useRef<HTMLTextAreaElement>(null)
  const chatRootRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const historyDraftRef = useRef('')
  const contextConversations = useOptionalJanusChatController()
  const conversations = conversationController ?? contextConversations

  const inputHistory = messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
  const providerOptions = getProviderMenuOptions(modelOptions)
  const activeProviderModels = activeModel
    ? modelOptions.filter((option) => option.providerId === activeModel.providerId)
    : modelOptions
  const menuOptions = selectionMenu === 'provider' ? providerOptions : activeProviderModels

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
      setHistoryIndex(null)
      historyDraftRef.current = ''
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
    setHistoryIndex(null)
    const lineCount = (value.match(/\n/g) || []).length + 1
    setRows(Math.min(4, Math.max(1, lineCount)))
  }, [])

  const openSelectionMenu = useCallback((menu: SelectionMenu) => {
    const options = menu === 'provider'
      ? getProviderMenuOptions(modelOptions)
      : activeModel
        ? modelOptions.filter((option) => option.providerId === activeModel.providerId)
        : modelOptions
    const activeIndex = options.findIndex((option) => menu === 'provider'
      ? option.providerId === activeModel?.providerId
      : option.providerId === activeModel?.providerId && option.modelId === activeModel?.modelId)
    setSelectionMenu(menu)
    setMenuIndex(activeIndex >= 0 ? activeIndex : 0)
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [activeModel, modelOptions])

  const selectMenuOption = useCallback((option: ChatModelOption) => {
    if (selectionMenu === 'provider') {
      const providerModel = modelOptions.find((candidate) =>
        candidate.providerId === option.providerId && candidate.isProviderDefault)
        ?? modelOptions.find((candidate) => candidate.providerId === option.providerId)
      if (providerModel) onSelectModel(providerModel.providerId, providerModel.modelId)
    } else {
      onSelectModel(option.providerId, option.modelId)
    }
    setSelectionMenu(null)
  }, [modelOptions, onSelectModel, selectionMenu])

  const handleMenuKey = useCallback((key: string): boolean => {
    if (!selectionMenu) return false
    if (key === 'Escape') {
      setSelectionMenu(null)
      return true
    }
    if (['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(key)) {
      const direction = key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1
      setMenuIndex((current) => menuOptions.length
        ? (current + direction + menuOptions.length) % menuOptions.length
        : 0)
      return true
    }
    if (key === 'Enter') {
      const option = menuOptions[menuIndex]
      if (option) selectMenuOption(option)
      return true
    }
    return false
  }, [menuIndex, menuOptions, selectMenuOption, selectionMenu])

  const replaceInput = useCallback((value: string) => {
    setInput(value)
    setRows(Math.min(4, Math.max(1, (value.match(/\n/g) || []).length + 1)))
    window.requestAnimationFrame(() => inputRef.current?.setSelectionRange(value.length, value.length))
  }, [])

  const handleEditMessage = useCallback((message: Message) => {
    setEditingMessageId(message.id)
    setEditingContent(message.content)
  }, [])

  const cancelMessageEdit = useCallback(() => {
    setEditingMessageId(null)
    setEditingContent('')
  }, [])

  const confirmMessageEdit = useCallback((messageId: string) => {
    const text = editingContent.trim()
    if (!text || isStreaming) return
    onRewrite(messageId, text)
    cancelMessageEdit()
  }, [cancelMessageEdit, editingContent, isStreaming, onRewrite])

  useEffect(() => {
    if (!editingMessageId) return
    if (!messages.some((message) => message.id === editingMessageId)) {
      cancelMessageEdit()
      return
    }
    window.requestAnimationFrame(() => {
      const editor = editInputRef.current
      editor?.focus()
      editor?.setSelectionRange(editor.value.length, editor.value.length)
    })
  }, [cancelMessageEdit, editingMessageId, messages])

  const handleChatKeyDownCapture = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault()
      e.stopPropagation()
      openSelectionMenu('model')
      return
    }
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      openSelectionMenu('provider')
      return
    }
    if (handleMenuKey(e.key)) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
  }, [handleMenuKey, openSelectionMenu])

  const handleChatPointerDownCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('button, input, textarea, select, a, [contenteditable="true"]')) return
    chatRootRef.current?.focus({ preventScroll: true })
  }, [])

  // 快捷键：Enter 发送，Shift+Enter 换行
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.nativeEvent.isComposing) {
      const textarea = e.currentTarget
      const caret = textarea.selectionStart
      const selectionCollapsed = caret === textarea.selectionEnd
      const firstLineEnd = input.indexOf('\n') < 0 ? input.length : input.indexOf('\n')
      const lastLineStart = input.lastIndexOf('\n') + 1
      if (e.key === 'ArrowUp' && selectionCollapsed && caret <= firstLineEnd && inputHistory.length) {
        e.preventDefault()
        if (historyIndex === null) historyDraftRef.current = input
        const nextIndex = historyIndex === null
          ? inputHistory.length - 1
          : Math.max(0, historyIndex - 1)
        setHistoryIndex(nextIndex)
        replaceInput(inputHistory[nextIndex])
        return
      }
      if (e.key === 'ArrowDown' && selectionCollapsed && caret >= lastLineStart && historyIndex !== null) {
        e.preventDefault()
        const nextIndex = historyIndex + 1
        if (nextIndex >= inputHistory.length) {
          setHistoryIndex(null)
          replaceInput(historyDraftRef.current)
        } else {
          setHistoryIndex(nextIndex)
          replaceInput(inputHistory[nextIndex])
        }
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend, historyIndex, input, inputHistory, replaceInput])

  useEffect(() => {
    if (!visible) return
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const chatRoot = chatRootRef.current
      if (!chatRoot?.contains(document.activeElement)) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        event.stopPropagation()
        openSelectionMenu('model')
        return
      }
      if (!selectionMenu || event.target === inputRef.current) return
      if (handleMenuKey(event.key)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown, true)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true)
  }, [handleMenuKey, openSelectionMenu, selectionMenu, visible])

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
    setHistoryIndex(null)
    historyDraftRef.current = ''
  }, [onClear])

  if (!visible) return null

  const isNoProviderError = error === '未配置默�?LLM Provider'
  const canClear = messages.length > 0 || !!pendingContent || !!error
  const hasConversation = messages.length > 0 || !!pendingContent || isStreaming || !!error
  const activeModelLabel = activeModel?.modelId ?? 'No model configured'
  const attachedWorkspaceIds = new Set(resourceController?.resources.map((resource) => resource.workspaceId) ?? [])
  const attachableWorkspaces = resourceController?.availableWorkspaces.filter((workspace) =>
    !attachedWorkspaceIds.has(workspace.id)) ?? []

  return (
    <div
      ref={chatRootRef}
      tabIndex={-1}
      className={`janus-chat${docked ? ' janus-chat--docked' : ''}${workspace ? ' janus-chat--workspace' : ''}${hasConversation ? ' janus-chat--active' : ' janus-chat--empty'}`}
      onKeyDownCapture={handleChatKeyDownCapture}
      onPointerDownCapture={handleChatPointerDownCapture}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="janus-chat-toolbar">
        <div className="janus-chat-thread-selector">
          <button
            type="button"
            className="janus-chat-thread-trigger"
            aria-label="Select conversation"
            aria-expanded={threadMenuOpen}
            onClick={() => setThreadMenuOpen((open) => !open)}
            disabled={workspace || !conversations || isStreaming}
          >
            <span>
              <span className="janus-chat-toolbar-kicker">Thread</span>
              <strong>{conversations?.conversationTitle ?? 'Janus'}</strong>
            </span>
            {!workspace && conversations && <ChevronDown size={13} aria-hidden="true" />}
          </button>
          {threadMenuOpen && !workspace && conversations && (
            <div className="janus-chat-thread-menu" role="menu" aria-label="Conversations">
              <div className="janus-chat-thread-menu-header">
                <span>Conversations</span>
                <button
                  type="button"
                  aria-label="New conversation"
                  title="New conversation"
                  onClick={() => {
                    conversations.createConversation()
                    setRenamingConversationId(null)
                  }}
                >
                  <Plus size={13} aria-hidden="true" />
                </button>
              </div>
              <div className="janus-chat-thread-list">
                {conversations.conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className="janus-chat-thread-row"
                    data-active={conversation.id === conversations.conversationId}
                  >
                    {renamingConversationId === conversation.id ? (
                      <input
                        autoFocus
                        value={renamingTitle}
                        aria-label="Conversation title"
                        onChange={(event) => setRenamingTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') setRenamingConversationId(null)
                          if (event.key === 'Enter') {
                            conversations.renameConversation(conversation.id, renamingTitle)
                            setRenamingConversationId(null)
                          }
                        }}
                        onBlur={() => {
                          conversations.renameConversation(conversation.id, renamingTitle)
                          setRenamingConversationId(null)
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="janus-chat-thread-main"
                        onClick={() => {
                          conversations.selectConversation(conversation.id)
                          setThreadMenuOpen(false)
                        }}
                      >
                        <strong>
                          {conversation.isStreaming && (
                            <LoaderCircle size={11} className="janus-runtime-tool-spinner" aria-label="Generating" />
                          )}
                          {!conversation.isStreaming && conversation.hasError && (
                            <CircleX size={11} aria-label="Conversation error" />
                          )}
                          {conversation.title}
                        </strong>
                        <span>{conversation.messageCount} messages</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="janus-chat-thread-action"
                      aria-label={`Rename ${conversation.title}`}
                      title="Rename conversation"
                      onClick={() => {
                        setRenamingConversationId(conversation.id)
                        setRenamingTitle(conversation.title)
                      }}
                    >
                      <Pencil size={12} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="janus-chat-thread-action danger"
                      aria-label={`Delete ${conversation.title}`}
                      title="Delete conversation"
                      onClick={() => {
                        if (window.confirm(`Delete conversation "${conversation.title}"?`)) {
                          conversations.deleteConversation(conversation.id)
                        }
                      }}
                    >
                      <Trash2 size={12} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
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
        </div>
      </div>

      {resourceController && (
        <>
        <div className="janus-resource-scope" aria-label="Workspace resources">
          <div className="janus-resource-list">
            {resourceController.resources.map((resource) => (
                <div
                  key={resource.workspaceId}
                  className="janus-resource-chip"
                >
                  <span className="janus-resource-label" title={resource.workspacePath}>
                    <span>{resource.workspaceName}</span>
                  </span>
                  <button
                    type="button"
                    className="janus-resource-remove"
                    aria-label={`Remove ${resource.workspaceName}`}
                    title={`Remove ${resource.workspaceName}`}
                    onClick={() => resourceController.detachWorkspace(resource.workspaceId)}
                  >
                    <X size={11} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </div>
            ))}
          </div>
          {attachableWorkspaces.length > 0 && (
            <div className="janus-resource-attach" title="Attach workspace">
              <Plus size={12} strokeWidth={1.8} aria-hidden="true" />
              <Select
                ariaLabel="Attach workspace"
                value=""
                placeholder="Add workspace"
                options={attachableWorkspaces.map((workspace) => ({
                  value: workspace.id,
                  label: workspace.name,
                }))}
                className="janus-resource-attach-select"
                dropdownClassName="janus-resource-attach-dropdown"
                onChange={(workspaceId) => {
                  if (workspaceId) resourceController.attachWorkspace(workspaceId)
                }}
              />
            </div>
          )}
          {onAddToWorkspace && (
            <button
              type="button"
              className="janus-chat-workspace-action"
              onClick={onAddToWorkspace}
              aria-label="Embed Chat in current workspace"
              title="Embed Chat in current workspace"
            >
              <PanelRightOpen size={13} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </div>
        {resourceController.pendingApprovals[0] ? (() => {
          const approval = resourceController.pendingApprovals[0]
          return (
            <div
              className="janus-runtime-approval"
              aria-label="Workspace edit approval"
              aria-live="polite"
              role="region"
            >
              <div className="janus-runtime-approval-header">
                <div className="janus-runtime-approval-heading">
                  <span>Workspace action</span>
                  <strong>Approval required</strong>
                </div>
                <span className="janus-runtime-approval-tool" title={approval.toolName}>
                  {approval.toolName} / {approval.actionRisk}
                </span>
              </div>
              {approval.preview && (
                <div className="janus-runtime-approval-preview">
                  <strong>{approval.preview.summary}</strong>
                  {approval.preview.paths.length > 0 && <span>{approval.preview.paths.join(', ')}</span>}
                  {approval.preview.detail && <pre>{approval.preview.detail}</pre>}
                </div>
              )}
              <div className="janus-runtime-approval-actions">
                <button
                  type="button"
                  className="janus-runtime-approval-reject"
                  onClick={() => resourceController.resolveApproval(approval.id, false)}
                  title="Reject workspace action"
                  aria-label="Reject workspace action"
                >
                  <ShieldX size={13} aria-hidden="true" />
                  <span>Reject</span>
                </button>
                <button
                  type="button"
                  className="janus-runtime-approval-approve"
                  onClick={() => resourceController.resolveApproval(approval.id, true)}
                  title="Approve workspace action"
                  aria-label="Approve workspace action"
                >
                  <Check size={13} aria-hidden="true" />
                  <span>Approve</span>
                </button>
              </div>
            </div>
          )
        })() : resourceController.activities.length > 0 && (
          <div className="janus-runtime-activity" aria-label="Workspace tool activity">
            {(() => {
              const activity = resourceController.activities.at(-1)!
              const pending = activity.status === 'requested' || activity.status === 'running'
              return (
                <>
                  {pending
                    ? <LoaderCircle size={11} className="janus-runtime-tool-spinner" aria-hidden="true" />
                    : activity.status === 'completed'
                      ? <CircleCheck size={11} aria-hidden="true" />
                      : <CircleX size={11} aria-hidden="true" />}
                  <span className="janus-runtime-tool-name">{activity.toolName}</span>
                  <span className="janus-runtime-tool-state">{activity.status}</span>
                </>
              )
            })()}
          </div>
        )}
        </>
      )}

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
            <div className="janus-chat-message-meta">
              <div className="janus-chat-message-author">
                {msg.role === 'user' ? 'You' : 'JANUSX'}
              </div>
              {msg.role === 'user' && editingMessageId === msg.id ? (
                <div className="janus-chat-message-edit-actions">
                  <button
                    className="janus-chat-message-edit"
                    type="button"
                    title="取消修改"
                    aria-label="取消修改"
                    onClick={cancelMessageEdit}
                  >
                    <X size={13} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                  <button
                    className="janus-chat-message-edit"
                    type="button"
                    title="确认修改并重新生成"
                    aria-label="确认修改并重新生成"
                    onClick={() => confirmMessageEdit(msg.id)}
                    disabled={!editingContent.trim() || isStreaming}
                  >
                    <Check size={13} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </div>
              ) : msg.role === 'user' ? (
                <button
                  className="janus-chat-message-edit"
                  type="button"
                  title="编辑并重新提问"
                  aria-label="编辑并重新提问"
                  onClick={() => handleEditMessage(msg)}
                  disabled={isStreaming}
                >
                  <Pencil size={13} strokeWidth={1.8} aria-hidden="true" />
                </button>
              ) : null}
            </div>
            {editingMessageId === msg.id ? (
              <textarea
                ref={editInputRef}
                className="janus-chat-inline-editor"
                value={editingContent}
                onChange={(event) => setEditingContent(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    cancelMessageEdit()
                  } else if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    confirmMessageEdit(msg.id)
                  }
                }}
                aria-label="编辑历史问题"
                rows={Math.min(6, Math.max(2, (editingContent.match(/\n/g) || []).length + 1))}
              />
            ) : (
              <div className="janus-chat-message-content">
                <MarkdownContent content={msg.content} />
              </div>
            )}
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
          新消息
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
            onClick={() => openSelectionMenu('model')}
            title="Ctrl+P open model menu"
          >
            <span>Model:</span>
            <strong>{activeModelLabel}</strong>
          </button>
          <div className="janus-chat-status-actions">
            <div className="janus-chat-shortcuts">
              <span>JANUS.md</span>
              <span><kbd>tab</kbd> providers</span>
              <span><kbd>ctrl+p</kbd> models</span>
            </div>
            <button
              className="janus-chat-clear-button"
              onClick={handleClear}
              disabled={!canClear}
              title="清空当前对话"
              aria-label="清空当前对话"
              type="button"
            >
              <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
          {selectionMenu && (
            <div className="janus-chat-model-menu" role="listbox" aria-label={`${selectionMenu} selection`}>
              <div className="janus-chat-model-menu-heading">
                <strong>{selectionMenu === 'provider' ? 'Providers' : 'Models'}</strong>
                <span>↑ ↓ ← → · Enter</span>
              </div>
              {menuOptions.map((option, index) => (
                <button
                  key={`${option.providerId}:${option.modelId}`}
                  type="button"
                  role="option"
                  aria-selected={index === menuIndex}
                  data-active={selectionMenu === 'provider'
                    ? activeModel?.providerId === option.providerId
                    : activeModel?.providerId === option.providerId && activeModel.modelId === option.modelId}
                  data-highlighted={index === menuIndex}
                  onMouseEnter={() => setMenuIndex(index)}
                  onClick={() => selectMenuOption(option)}
                >
                  <span>{option.providerName}</span>
                  <strong>{option.modelId}</strong>
                </button>
              ))}
              {menuOptions.length === 0 && (
                <div className="janus-chat-model-menu-empty">
                  No configured {selectionMenu}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {modelNotice && <div className="janus-chat-model-notice">{modelNotice}</div>}
    </div>
  )
}
