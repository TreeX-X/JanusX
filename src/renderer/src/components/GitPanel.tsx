import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useGitStore } from '@/stores/git'
import { useWorkspaceStore } from '@/stores/workspace'
import { useI18n } from '@/i18n/useI18n'
import type { TFunction } from 'i18next'
import type { GitFileChange } from '@/types'
import { ModalCloseButton } from './ModalCloseButton'

type GitRemoteAction = 'push' | 'pull'
const GIT_HISTORY_LIMIT = 100

export function GitPanel({ active = true }: { active?: boolean }) {
  const { status, commits, loading, error, fetchLog, stageFiles, unstageFiles, commitChanges, pushChanges, pullChanges } = useGitStore()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const { t } = useI18n('git')
  const [commitMsg, setCommitMsg] = useState('')
  const [confirmAction, setConfirmAction] = useState<GitRemoteAction | null>(null)

  useEffect(() => {
    if (!active) setConfirmAction(null)
  }, [active])

  const cwd = workspaces.find((w) => w.id === activeWorkspaceId)?.path
  const refreshGitData = useCallback(async () => {
    if (!cwd) return
    await fetchLog(cwd, GIT_HISTORY_LIMIT)
  }, [cwd, fetchLog])

  useEffect(() => {
    if (!cwd) return
    void refreshGitData()
  }, [cwd, refreshGitData])

  const handleStageAll = useCallback(async () => {
    if (!cwd || !status) return
    const unstaged = status.changes.filter((c) => !c.staged).map((c) => c.path)
    if (unstaged.length > 0) await stageFiles(cwd, unstaged)
  }, [cwd, status, stageFiles])

  const handleUnstageAll = useCallback(async () => {
    if (!cwd || !status) return
    const staged = status.changes.filter((c) => c.staged).map((c) => c.path)
    if (staged.length > 0) await unstageFiles(cwd, staged)
  }, [cwd, status, unstageFiles])

  const handleCommit = useCallback(async () => {
    if (!cwd || !commitMsg.trim()) return
    const committed = await commitChanges(cwd, commitMsg.trim())
    if (!committed) return
    await fetchLog(cwd, GIT_HISTORY_LIMIT)
    setCommitMsg('')
  }, [cwd, commitMsg, commitChanges, fetchLog])

  const handlePush = useCallback(() => {
    if (!cwd || loading) return
    setConfirmAction('push')
  }, [cwd, loading])

  const handlePull = useCallback(() => {
    if (!cwd || loading) return
    setConfirmAction('pull')
  }, [cwd, loading])

  const handleConfirmRemoteAction = useCallback(async () => {
    if (!cwd || !confirmAction) return

    const succeeded = confirmAction === 'push'
      ? await pushChanges(cwd)
      : await pullChanges(cwd)
    if (!succeeded) return
    await fetchLog(cwd, GIT_HISTORY_LIMIT)
    setConfirmAction(null)
  }, [confirmAction, cwd, fetchLog, pullChanges, pushChanges])

  const handleToggleStage = useCallback(
    async (file: GitFileChange) => {
      if (!cwd) return
      if (file.staged) {
        await unstageFiles(cwd, [file.path])
      } else {
        await stageFiles(cwd, [file.path])
      }
    },
    [cwd, stageFiles, unstageFiles]
  )

  if (!cwd) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-[#555]">
        {t('git:noWorkspace')}
      </div>
    )
  }

  const stagedChanges = status?.changes.filter((c) => c.staged) ?? []
  const unstagedChanges = status?.changes.filter((c) => !c.staged) ?? []
  const modifiedCount = status?.changes.filter((c) => c.status === 'M').length ?? 0
  const addedCount = status?.changes.filter((c) => c.status === 'A' || c.status === '??').length ?? 0
  const deletedCount = status?.changes.filter((c) => c.status === 'D').length ?? 0

  const remoteMeta = confirmAction
    ? {
        title: t(`git:remote.${confirmAction}.title`),
        actionLabel: t(`git:remote.${confirmAction}.actionLabel`),
        description: t(`git:remote.${confirmAction}.description`),
        hint: t(`git:remote.${confirmAction}.hint`),
      }
    : null
  const branchName = status?.branch.name ?? t('git:branch.currentFallback')
  const upstreamName = status?.branch.upstream ?? t('git:branch.upstreamUnset')

  return (
    <>
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden text-xs" aria-busy={loading}>
      {/* Branch bar */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ border: '1.5px solid #ff7830' }}
          />
          <span className="text-[#d4d4d4] font-medium truncate">
            {status?.branch.name ?? '...'}
          </span>
          {status?.branch.upstream && (
            <span className="text-[#555] truncate">
              {status.branch.upstream}
            </span>
          )}
        </div>
        {(status?.branch.ahead ?? 0) > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(78, 201, 176, 0.15)', color: '#4ec9b0' }}>
            ↑{status?.branch.ahead}
          </span>
        )}
        {(status?.branch.behind ?? 0) > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(224, 108, 117, 0.15)', color: '#e06c75' }}>
            ↓{status?.branch.behind}
          </span>
        )}
      </div>

      {/* Status summary */}
      <div className="flex gap-3 px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#e5c07b' }} />
          <span className="text-[#888]">{t('git:statusSummary.modified', { count: modifiedCount })}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#4ec9b0' }} />
          <span className="text-[#888]">{t('git:statusSummary.added', { count: addedCount })}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#e06c75' }} />
          <span className="text-[#888]">{t('git:statusSummary.deleted', { count: deletedCount })}</span>
        </div>
      </div>

      {/* Changed files */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="git-scroll-region">
        {error && (
          <div className="px-3 py-2 text-[10px]" style={{ color: '#e06c75' }}>
            {error}
          </div>
        )}

        {/* Staged files */}
        {stagedChanges.length > 0 && (
          <div>
            <div
              className="px-3 py-1.5 text-[10px] font-semibold tracking-wider uppercase flex justify-between items-center"
              style={{ color: '#555', background: 'rgba(255, 255, 255, 0.02)' }}
            >
              <span>{t('git:staged.title')}</span>
              <button
                onClick={handleUnstageAll}
                className="text-[10px] normal-case tracking-normal font-normal transition-colors hover:text-[#ff7830]"
                style={{ color: '#666' }}
              >
                {t('git:staged.unstageAll')}
              </button>
            </div>
            {stagedChanges.map((file) => (
              <GitFileItem key={`staged-${file.path}`} file={file} onToggle={handleToggleStage} />
            ))}
          </div>
        )}

        {/* Unstaged files */}
        {unstagedChanges.length > 0 && (
          <div>
            <div
              className="px-3 py-1.5 text-[10px] font-semibold tracking-wider uppercase flex justify-between items-center"
              style={{ color: '#555', background: 'rgba(255, 255, 255, 0.02)' }}
            >
              <span>{t('git:changes.title')}</span>
              <button
                onClick={handleStageAll}
                className="text-[10px] normal-case tracking-normal font-normal transition-colors hover:text-[#ff7830]"
                style={{ color: '#666' }}
              >
                {t('git:changes.stageAll')}
              </button>
            </div>
            {unstagedChanges.map((file) => (
              <GitFileItem key={`unstaged-${file.path}`} file={file} onToggle={handleToggleStage} />
            ))}
          </div>
        )}

        {status?.clean && (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-[#555]">
            <div className="w-5 h-5 rounded-full border border-[#333] flex items-center justify-center text-[10px]">✓</div>
            <span>{t('git:clean')}</span>
          </div>
        )}

        {/* Commit history */}
        {commits.length > 0 && (
          <div>
            <div
              className="px-3 py-1.5 text-[10px] font-semibold tracking-wider uppercase"
              style={{ color: '#555', background: 'rgba(255, 255, 255, 0.02)' }}
            >
              {t('git:history.title')}
            </div>
            {commits.map((commit) => (
              <div
                key={commit.hash}
                className="px-3 py-2 flex items-start gap-2 transition-colors hover:bg-[rgba(255,255,255,0.02)]"
              >
                <div
                  className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                  style={{ background: '#ff7830' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[#d4d4d4] truncate">{commit.message}</div>
                  <div className="flex gap-2 mt-0.5 text-[10px] text-[#555]">
                    <span>{commit.shortHash}</span>
                    <span>{commit.author}</span>
                    <span>{formatDate(commit.date, t)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Commit input */}
      <div
        className="shrink-0 p-2"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <div className="flex gap-1.5">
          <input
            type="text"
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCommit()}
            placeholder={t('git:commit.placeholder')}
            className="flex-1 h-7 rounded px-2.5 text-xs transition-colors focus:outline-none focus:bg-[rgba(255,255,255,0.05)] focus:border-[rgba(255,120,48,0.4)]"
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#d4d4d4',
            }}
          />
          <button
            onClick={handleCommit}
            disabled={!commitMsg.trim() || loading}
            className="px-3 h-7 rounded text-[11px] transition-colors disabled:opacity-30"
            style={{
              background: 'rgba(255, 120, 48, 0.08)',
              border: '1px solid rgba(255, 120, 48, 0.2)',
              color: '#ff7830',
            }}
          >
            {t('git:commit.button')}
          </button>
        </div>
        <div className="flex gap-1.5 mt-1.5">
          <button
            type="button"
            onClick={handlePush}
            disabled={loading}
            className="flex-1 h-7 rounded border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] text-[10px] font-medium text-[#888] cursor-pointer transition-[background,border-color,color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-[rgba(255,120,48,0.26)] hover:bg-[rgba(255,120,48,0.08)] hover:text-[#ffb27d] hover:shadow-[0_0_0_1px_rgba(255,120,48,0.08)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 disabled:hover:border-[rgba(255,255,255,0.06)] disabled:hover:bg-[rgba(255,255,255,0.03)] disabled:hover:text-[#888] disabled:hover:shadow-none"
          >
            {t('git:remote.pushButton')}
          </button>
          <button
            type="button"
            onClick={handlePull}
            disabled={loading}
            className="flex-1 h-7 rounded border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] text-[10px] font-medium text-[#888] cursor-pointer transition-[background,border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-[rgba(255,120,48,0.26)] hover:bg-[rgba(255,120,48,0.08)] hover:text-[#ffb27d] hover:shadow-[0_0_0_1px_rgba(255,120,48,0.08)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 disabled:hover:border-[rgba(255,255,255,0.06)] disabled:hover:bg-[rgba(255,255,255,0.03)] disabled:hover:text-[#888] disabled:hover:shadow-none"
          >
            {t('git:remote.pullButton')}
          </button>
        </div>
      </div>
    </div>
    {active && remoteMeta && createPortal(
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(10px)',
          zIndex: 1000,
        }}
      >
        <div
          className="overflow-hidden"
          style={{
            width: 390,
            background: 'rgba(22,22,22,0.98)',
            border: '1px solid rgba(255,120,48,0.25)',
            borderRadius: 8,
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
            animation: 'island-expand-modal 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          }}
        >
          <div
            className="flex justify-between items-center"
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div
              className="font-semibold flex items-center"
              style={{ fontSize: 13, color: '#fff', gap: 6 }}
            >
              <span style={{ color: '#ff7830' }}>{confirmAction === 'push' ? '↑' : '↓'}</span>
              {remoteMeta.title}
            </div>
            <ModalCloseButton onClose={() => setConfirmAction(null)} />
          </div>

          <div style={{ padding: '16px 16px 18px' }}>
            <div style={{ fontSize: 12, color: '#999', lineHeight: 1.6 }}>
              {remoteMeta.description}
            </div>
            <div
              style={{
                marginTop: 12,
                padding: '9px 10px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 5,
                fontSize: 11,
                color: '#777',
                lineHeight: 1.6,
              }}
            >
              <div>
                <span>{t('git:remote.branchLabel')} </span><strong style={{ color: '#d4d4d4', fontWeight: 600 }}>{branchName}</strong>
              </div>
              <div>
                <span>{t('git:remote.remoteLabel')} </span><strong style={{ color: '#d4d4d4', fontWeight: 600 }}>{upstreamName}</strong>
              </div>
            </div>
            <div
              style={{
                marginTop: 12,
                padding: '8px 10px',
                background: 'rgba(255,120,48,0.06)',
                border: '1px solid rgba(255,120,48,0.12)',
                borderRadius: 4,
                fontSize: 11,
                color: '#b8896d',
                lineHeight: 1.5,
              }}
            >
              {remoteMeta.hint}
            </div>
          </div>

          <div
            className="flex justify-end"
            style={{
              padding: '10px 16px',
              borderTop: '1px solid var(--border)',
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              className="rounded cursor-pointer transition-colors"
              style={{
                height: 28,
                padding: '0 14px',
                fontSize: 11,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#999',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                e.currentTarget.style.color = '#ccc'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                e.currentTarget.style.color = '#999'
              }}
            >
              {t('common:action.cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirmRemoteAction}
              disabled={loading}
              className="rounded cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-45"
              style={{
                height: 28,
                padding: '0 16px',
                fontSize: 11,
                background: 'rgba(255,120,48,0.12)',
                border: '1px solid rgba(255,120,48,0.3)',
                color: '#ff7830',
              }}
              onMouseEnter={(e) => {
                if (loading) return
                e.currentTarget.style.background = 'rgba(255,120,48,0.2)'
                e.currentTarget.style.borderColor = 'rgba(255,120,48,0.5)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,120,48,0.12)'
                e.currentTarget.style.borderColor = 'rgba(255,120,48,0.3)'
              }}
            >
              {loading ? t('git:remote.executing') : remoteMeta.actionLabel}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )}
    </>
  )
}

function GitFileItem({ file, onToggle }: { file: GitFileChange; onToggle: (file: GitFileChange) => void }) {
  const statusColors: Record<string, { bg: string; fg: string }> = {
    M: { bg: 'rgba(229, 192, 123, 0.15)', fg: '#e5c07b' },
    A: { bg: 'rgba(78, 201, 176, 0.15)', fg: '#4ec9b0' },
    D: { bg: 'rgba(224, 108, 117, 0.15)', fg: '#e06c75' },
    R: { bg: 'rgba(198, 160, 246, 0.15)', fg: '#c6a0f6' },
    '??': { bg: 'rgba(136, 136, 136, 0.15)', fg: '#888' },
    UU: { bg: 'rgba(224, 108, 117, 0.15)', fg: '#e06c75' },
  }
  const colors = statusColors[file.status] ?? statusColors['??']

  return (
    <div
      onClick={() => onToggle(file)}
      className="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.03)]"
    >
      <span
        className="w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-bold shrink-0"
        style={{ background: colors.bg, color: colors.fg }}
      >
        {file.status === '??' ? '?' : file.status}
      </span>
      <span className="flex-1 truncate text-[#999]">{file.path}</span>
      {file.staged && (
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#4ec9b0' }} />
      )}
    </div>
  )
}

function formatDate(dateStr: string, t: TFunction): string {
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return t('git:time.justNow')
    if (diffMins < 60) return t('git:time.minutesAgo', { count: diffMins })
    if (diffHours < 24) return t('git:time.hoursAgo', { count: diffHours })
    if (diffDays < 7) return t('git:time.daysAgo', { count: diffDays })
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}
