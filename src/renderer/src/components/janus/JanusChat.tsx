/**
 * @file JanusChat �?虚幻模糊风格的对话组�?
 * @description �?Janus 数字形象风格一致的对话界面
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Check, ChevronDown, CircleCheck, CircleX, Copy, LoaderCircle, PanelRightOpen, Pencil, Plus, RotateCcw, ShieldX, Trash2, X } from 'lucide-react'
import type { ChatModelOption, JanusResourceController, Message, UseJanusChatReturn } from './useJanusChat'
import type { ChatToolTraceEntry } from '../../../../shared/ipc/llm'
import { useOptionalJanusChatController } from './JanusChatProvider'
import { MarkdownContent, StreamingText } from '../chat/ChatContent'
import { Select } from '../ui/Select'
import { useI18n } from '@/i18n/useI18n'
import { ToolCallGroup } from './ToolCallCard'

type SelectionMenu = 'provider' | 'model'

function getProviderMenuOptions(options: ChatModelOption[]): ChatModelOption[] {
  return [...new Set(options.map((option) => option.providerId))]
    .map((providerId) => options.find((option) => option.providerId === providerId && option.isProviderDefault)
      ?? options.find((option) => option.providerId === providerId))
    .filter((option): option is ChatModelOption => option !== undefined)
}

function formatMessageTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(timestamp)
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
  toolTraces?: ChatToolTraceEntry[]
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
  toolTraces = [],
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
  const { t } = useI18n('janus')
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

  const copyMessage = useCallback((content: string) => {
    if (!navigator.clipboard) return
    void navigator.clipboard.writeText(content).catch(() => undefined)
  }, [])

  const inputHistory = messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
  const providerOptions = getProviderMenuOptions(modelOptions)
  const activeProviderModels = activeModel
    ? modelOptions.filter((option) => option.providerId === activeModel.providerId)
    : modelOptions
  const menuOptions = selectionMenu === 'provider' ? providerOptions : activeProviderModels
  const workspaceNames = new Map((resourceController?.resources ?? []).map((resource) => [resource.workspaceId, resource.workspaceName]))
  const lastAssistantMessageId = [...messages].reverse().find((message) => message.role === 'assistant')?.id
  const liveToolTraces: ChatToolTraceEntry[] = (resourceController?.activities ?? [])
    .filter((activity) => activity.status === 'requested' || activity.status === 'running' || activity.status === 'approval')
    .map((activity) => ({
      toolName: activity.toolName,
      workspaceId: '',
      status: activity.status,
      summary: activity.summary ?? activity.toolName,
      turnId: 'live',
    }))

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

  const isNoProviderError = error === t('janus:chat.model.notice.noProviderError')
  const canClear = messages.length > 0 || !!pendingContent || !!error
  const hasConversation = messages.length > 0 || !!pendingContent || isStreaming || !!error
  const activeModelLabel = activeModel?.modelId ?? t('janus:chat.model.noneConfigured')
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
            aria-label={t('janus:chat.thread.selectAria')}
            aria-expanded={threadMenuOpen}
            onClick={() => setThreadMenuOpen((open) => !open)}
            disabled={workspace || !conversations}
          >
            <span>
              <span className="janus-chat-toolbar-kicker">{t('janus:chat.thread.kicker')}</span>
              <strong>{conversations?.conversationTitle ?? t('janus:chat.thread.fallbackTitle')}</strong>
            </span>
            {!workspace && conversations && <ChevronDown size={13} aria-hidden="true" />}
          </button>
          {threadMenuOpen && !workspace && conversations && (
            <div className="janus-chat-thread-menu" role="menu" aria-label={t('janus:chat.thread.menuHeader')}>
              <div className="janus-chat-thread-menu-header">
                <span>{t('janus:chat.thread.menuHeader')}</span>
                <button
                  type="button"
                  aria-label={t('janus:chat.thread.newAria')}
                  title={t('janus:chat.thread.newTitle')}
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
                        aria-label={t('janus:chat.thread.titleAria')}
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
                             <LoaderCircle size={11} className="janus-runtime-tool-spinner" aria-label={t('janus:chat.thread.generatingAria')} />
                           )}
                           {!conversation.isStreaming && conversation.hasError && (
                             <CircleX size={11} aria-label={t('janus:chat.thread.errorAria')} />
                           )}
                           {conversation.title}
                         </strong>
                         <span>{t('janus:chat.thread.messagesCount', { count: conversation.messageCount })}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="janus-chat-thread-action"
                      aria-label={t('janus:chat.thread.renameAria', { title: conversation.title })}
                      title={t('janus:chat.thread.renameTitle')}
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
                      aria-label={t('janus:chat.thread.deleteAria', { title: conversation.title })}
                      title={t('janus:chat.thread.deleteTitle')}
                      onClick={() => {
                        if (window.confirm(t('janus:chat.thread.deleteConfirm', { title: conversation.title }))) {
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
            title={t('janus:chat.model.openLlmTitle')}
            type="button"
          >
            {t('janus:chat.model.openLlmButton')}
          </button>
        </div>
      </div>

      {resourceController && (
        <>
        <div className="janus-resource-scope" aria-label={t('janus:chat.resource.scopeAria')}>
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
                    aria-label={t('janus:chat.resource.removeAria', { name: resource.workspaceName })}
                    title={t('janus:chat.resource.removeTitle', { name: resource.workspaceName })}
                    onClick={() => resourceController.detachWorkspace(resource.workspaceId)}
                  >
                    <X size={11} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </div>
            ))}
          </div>
          {attachableWorkspaces.length > 0 && (
            <div className="janus-resource-attach" title={t('janus:chat.resource.attachTitle')}>
              <Select
                ariaLabel={t('janus:chat.resource.attachAria')}
                value=""
                placeholder={t('janus:chat.resource.attachPlaceholder')}
                prefix={<Plus size={12} strokeWidth={1.8} aria-hidden="true" />}
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
              aria-label={t('janus:chat.resource.embedAria')}
              title={t('janus:chat.resource.embedTitle')}
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
              aria-label={t('janus:chat.approval.regionAria')}
              aria-live="polite"
              role="region"
            >
              <div className="janus-runtime-approval-header">
                <div className="janus-runtime-approval-heading">
                  <span>{t('janus:chat.approval.heading')}</span>
                  <strong>{t('janus:chat.approval.headingStrong')}</strong>
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
                  title={t('janus:chat.approval.rejectTitle')}
                  aria-label={t('janus:chat.approval.rejectAria')}
                >
                  <ShieldX size={13} aria-hidden="true" />
                  <span>{t('janus:chat.approval.reject')}</span>
                </button>
                <button
                  type="button"
                  className="janus-runtime-approval-approve"
                  onClick={() => resourceController.resolveApproval(approval.id, true)}
                  title={t('janus:chat.approval.approveTitle')}
                  aria-label={t('janus:chat.approval.approveAria')}
                >
                  <Check size={13} aria-hidden="true" />
                  <span>{t('janus:chat.approval.approve')}</span>
                </button>
              </div>
            </div>
          )
        })() : resourceController.activities.length > 0 && (
          <div className="janus-runtime-activity" aria-label={t('janus:chat.activity.aria')}>
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
              {msg.role === 'assistant' && (
                <div className="janus-chat-message-author">
                  {t('janus:chat.author.assistant')}
                </div>
              )}
              <time className="janus-chat-message-time" dateTime={new Date(msg.timestamp).toISOString()}>
                {formatMessageTime(msg.timestamp)}
              </time>
              <div className="janus-chat-message-edit-actions">
                <button
                  className="janus-chat-message-edit"
                  type="button"
                  title={t('janus:chat.message.copyTitle')}
                  aria-label={t('janus:chat.message.copyAria')}
                  onClick={() => copyMessage(msg.content)}
                >
                  <Copy size={13} strokeWidth={1.8} aria-hidden="true" />
                </button>
              {msg.role === 'user' && editingMessageId === msg.id ? (
                <>
                  <button
                    className="janus-chat-message-edit"
                    type="button"
                    title={t('janus:chat.edit.cancelTitle')}
                    aria-label={t('janus:chat.edit.cancelAria')}
                    onClick={cancelMessageEdit}
                  >
                    <X size={13} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                  <button
                    className="janus-chat-message-edit"
                    type="button"
                    title={t('janus:chat.edit.confirmTitle')}
                    aria-label={t('janus:chat.edit.confirmAria')}
                    onClick={() => confirmMessageEdit(msg.id)}
                    disabled={!editingContent.trim() || isStreaming}
                  >
                    <Check size={13} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </>
              ) : msg.role === 'user' ? (
                <button
                  className="janus-chat-message-edit"
                  type="button"
                  title={t('janus:chat.edit.editTitle')}
                  aria-label={t('janus:chat.edit.editAria')}
                  onClick={() => handleEditMessage(msg)}
                  disabled={isStreaming}
                >
                  <Pencil size={13} strokeWidth={1.8} aria-hidden="true" />
                </button>
              ) : msg.id === lastAssistantMessageId ? (
                <button
                  className="janus-chat-message-edit"
                  type="button"
                  title={t('janus:chat.message.retryTitle')}
                  aria-label={t('janus:chat.message.retryAria')}
                  onClick={onRetry}
                  disabled={isStreaming}
                >
                  <RotateCcw size={13} strokeWidth={1.8} aria-hidden="true" />
                </button>
              ) : null}
              </div>
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
                aria-label={t('janus:chat.edit.historyAria')}
                rows={Math.min(6, Math.max(2, (editingContent.match(/\n/g) || []).length + 1))}
              />
            ) : (
              <div className="janus-chat-message-content">
                <MarkdownContent content={msg.content} />
                {msg.role === 'assistant' && (
                  <ToolCallGroup
                    entries={toolTraces.filter((entry) => entry.turnId === msg.id || (entry.turnId !== msg.id && msg.id === lastAssistantMessageId))}
                    workspaceNames={workspaceNames}
                  />
                )}
              </div>
            )}
          </div>
        ))}

        {(isStreaming || pendingContent) && (
          <div className="janus-chat-message assistant streaming">
            <div className="janus-chat-message-author">{t('janus:chat.author.assistant')}</div>
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
              <ToolCallGroup entries={liveToolTraces} workspaceNames={workspaceNames} />
            </div>
          </div>
        )}

        {error && (
          <div className="janus-chat-error-card">
            <div className="janus-chat-error-text">{error}</div>
            <div className="janus-chat-error-actions">
              <button className="janus-chat-retry" onClick={handleRetry}>
                {t('common:action.retry')}
              </button>
              {isNoProviderError && (
                <button className="janus-chat-config-llm" onClick={handleOpenLlmConfig}>
                  {t('janus:chat.error.configureLlm')}
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
          {t('janus:chat.newMessage')}
        </button>
      )}

      {/* 输入区域 �?opencode 风格方框 composer：单�?prompt + textarea + 按钮 */}
      <div className="janus-chat-input-wrapper" data-has-input={input.length > 0}>
        <div className="janus-chat-composer-row">
          <textarea
            ref={inputRef}
            className="janus-chat-input"
            rows={rows}
            placeholder={t('janus:chat.inputPlaceholder')}
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
              title={t('janus:chat.stop.title')}
              aria-label={t('janus:chat.stop.aria')}
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
            title={t('janus:chat.model.menuShortcutTitle')}
          >
            <span>{t('janus:chat.model.tagLabel')}</span>
            <strong>{activeModelLabel}</strong>
          </button>
          <div className="janus-chat-status-actions">
            <div className="janus-chat-shortcuts">
              <span>{t('janus:chat.shortcuts.janusMd')}</span>
              <span><kbd>tab</kbd> {t('janus:chat.shortcuts.providers')}</span>
              <span><kbd>ctrl+p</kbd> {t('janus:chat.shortcuts.models')}</span>
            </div>
            <button
              className="janus-chat-clear-button"
              onClick={handleClear}
              disabled={!canClear}
              title={t('janus:chat.clear.title')}
              aria-label={t('janus:chat.clear.aria')}
              type="button"
            >
              <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
          {selectionMenu && (
            <div className="janus-chat-model-menu" role="listbox" aria-label={t('janus:chat.selectionMenu.aria', { kind: selectionMenu })}>
              <div className="janus-chat-model-menu-heading">
                <strong>{selectionMenu === 'provider' ? t('janus:chat.model.providersHeading') : t('janus:chat.model.modelsHeading')}</strong>
                <span>{t('janus:chat.model.menuNavHint')}</span>
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
                  {t('janus:chat.model.noConfigured', { kind: selectionMenu })}
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
