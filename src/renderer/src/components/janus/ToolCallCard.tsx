/**
 * @file 工具调用卡片 —— 内联到消息流，替代原顶部孤立 activity chip。
 * @description 一张卡片对应一条 ChatToolTraceEntry。卡片可折叠/展开，
 *              显示状态图标、工具名、参数摘要、结果摘要、错误详情、耗时。
 *              流式期间正在执行的工具也用本卡片渲染（status === 'running'|'requested'|'approval'）。
 */

import { useState, useCallback } from 'react'
import { Check, ChevronDown, ChevronRight, CircleX, Clock, LoaderCircle, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { ChatToolTraceEntry } from '../../../../shared/ipc/llm'
import { useI18n } from '@/i18n/useI18n'

export interface ToolCallCardProps {
  entry: ChatToolTraceEntry
  /** 已附加工作区名表，用于把 workspaceId 解析为可读名。 */
  workspaceNames: Map<string, string>
}

function statusIcon(entry: ChatToolTraceEntry, statusLabels: { requested: string; approval: string; running: string; completed: string; failed: string; cancelled: string }) {
  switch (entry.status) {
    case 'approval':
      return <ShieldAlert size={12} className="janus-tool-card-icon janus-tool-card-icon--approval" aria-label={statusLabels.approval} />
    case 'requested':
    case 'running':
      return <LoaderCircle size={12} className="janus-tool-card-icon janus-tool-card-icon--running" aria-label={statusLabels.running} />
    case 'completed':
      return <ShieldCheck size={12} className="janus-tool-card-icon janus-tool-card-icon--completed" aria-label={statusLabels.completed} />
    case 'failed':
      return <CircleX size={12} className="janus-tool-card-icon janus-tool-card-icon--failed" aria-label={statusLabels.failed} />
    case 'cancelled':
      return <CircleX size={12} className="janus-tool-card-icon janus-tool-card-icon--cancelled" aria-label={statusLabels.cancelled} />
    default:
      return <Check size={12} className="janus-tool-card-icon" aria-label={statusLabels.completed} />
  }
}

function formatDuration(entry: ChatToolTraceEntry): number | null {
  if (typeof entry.startedAt !== 'number') return null
  const end = typeof entry.completedAt === 'number' ? entry.completedAt : Date.now()
  const ms = Math.max(0, end - entry.startedAt)
  return ms < 100 ? null : ms
}

export function ToolCallCard({ entry, workspaceNames }: ToolCallCardProps) {
  const { t } = useI18n('janus')
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const statusLabels = {
    requested: t('janus:chat.tool.status.requested'),
    approval: t('janus:chat.tool.status.approval'),
    running: t('janus:chat.tool.status.running'),
    completed: t('janus:chat.tool.status.completed'),
    failed: t('janus:chat.tool.status.failed'),
    cancelled: t('janus:chat.tool.status.cancelled'),
  }
  const hasDetail = Boolean(entry.argsDigest || entry.resultDigest || entry.errorDetail)
  const duration = formatDuration(entry)
  const workspaceName = workspaceNames.get(entry.workspaceId)
  const Icon = expanded ? ChevronDown : ChevronRight
  const statusKey = entry.status in statusLabels ? (entry.status as keyof typeof statusLabels) : 'completed'

  const handleCopy = useCallback(() => {
    const text = [entry.toolName, entry.workspaceId, entry.status, entry.summary].filter(Boolean).join(' · ')
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    })
  }, [entry])

  return (
    <div className={`janus-tool-card janus-tool-card--${entry.status}`} data-turn={entry.turnId ?? ''}>
      <div className="janus-tool-card-head">
        <button
          type="button"
          className="janus-tool-card-toggle"
          onClick={() => setExpanded((open) => !open)}
          disabled={!hasDetail}
          aria-expanded={expanded}
          aria-label={expanded ? t('janus:chat.tool.collapseTitle') : t('janus:chat.tool.expandTitle')}
          title={hasDetail ? (expanded ? t('janus:chat.tool.collapseTitle') : t('janus:chat.tool.expandTitle')) : undefined}
        >
          {hasDetail ? <Icon size={11} aria-hidden="true" /> : <span className="janus-tool-card-toggle-spacer" />}
        </button>
        {statusIcon(entry, statusLabels)}
        <span className="janus-tool-card-name" title={entry.toolName}>{entry.toolName}</span>
        {workspaceName && (
          <span className="janus-tool-card-workspace">{t('janus:chat.tool.workspaceAt', { name: workspaceName })}</span>
        )}
        <span className={`janus-tool-card-status janus-tool-card-status--${entry.status}`}>{statusLabels[statusKey]}</span>
        {duration !== null && (
          <span className="janus-tool-card-duration" title={t('janus:chat.tool.duration', { ms: duration })}>
            <Clock size={10} aria-hidden="true" />
            <span>{t('janus:chat.tool.duration', { ms: duration })}</span>
          </span>
        )}
        <button
          type="button"
          className="janus-tool-card-copy"
          onClick={handleCopy}
          title={t('janus:chat.tool.copySummaryTitle')}
          aria-label={t('janus:chat.tool.copySummaryAria')}
        >
          {copied ? t('janus:chat.tool.copied') : ''}
        </button>
      </div>
      {expanded && hasDetail && (
        <div className="janus-tool-card-body">
          {entry.argsDigest && (
            <div className="janus-tool-card-section">
              <strong className="janus-tool-card-section-label">{t('janus:chat.tool.argsLabel')}</strong>
              <code className="janus-tool-card-code">{entry.argsDigest}</code>
            </div>
          )}
          {entry.resultDigest && entry.status === 'completed' && (
            <div className="janus-tool-card-section">
              <strong className="janus-tool-card-section-label">{t('janus:chat.tool.resultLabel')}</strong>
              <code className="janus-tool-card-code">{entry.resultDigest}</code>
            </div>
          )}
          {entry.errorDetail && entry.status !== 'completed' && (
            <div className="janus-tool-card-section janus-tool-card-section--error">
              <strong className="janus-tool-card-section-label">{t('janus:chat.tool.errorLabel')}</strong>
              <pre className="janus-tool-card-error">{entry.errorDetail}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export interface ToolCallGroupProps {
  entries: ChatToolTraceEntry[]
  workspaceNames: Map<string, string>
}

export function ToolCallGroup({ entries, workspaceNames }: ToolCallGroupProps) {
  const { t } = useI18n('janus')
  if (entries.length === 0) return null
  return (
    <div className="janus-tool-call-group" role="group" aria-label={t('janus:chat.tool.groupAria')}>
      {entries.map((entry, index) => (
        <ToolCallCard key={`${entry.toolName}-${index}`} entry={entry} workspaceNames={workspaceNames} />
      ))}
    </div>
  )
}
