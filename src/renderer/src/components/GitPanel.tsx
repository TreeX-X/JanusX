import { useState, useEffect, useCallback } from 'react'
import { useGitStore } from '@/stores/git'
import { useWorkspaceStore } from '@/stores/workspace'
import type { GitFileChange } from '@/types'

export function GitPanel() {
  const { status, commits, loading, error, fetchStatus, fetchLog, stageFiles, unstageFiles, commitChanges, pushChanges, pullChanges } = useGitStore()
  const { activeWorkspaceId, workspaces } = useWorkspaceStore()
  const [commitMsg, setCommitMsg] = useState('')

  const cwd = workspaces.find((w) => w.id === activeWorkspaceId)?.path

  useEffect(() => {
    if (!cwd) return
    fetchStatus(cwd)
    fetchLog(cwd, 20)
  }, [cwd])

  const handleStageAll = useCallback(() => {
    if (!cwd || !status) return
    const unstaged = status.changes.filter((c) => !c.staged).map((c) => c.path)
    if (unstaged.length > 0) stageFiles(cwd, unstaged)
  }, [cwd, status, stageFiles])

  const handleUnstageAll = useCallback(() => {
    if (!cwd || !status) return
    const staged = status.changes.filter((c) => c.staged).map((c) => c.path)
    if (staged.length > 0) unstageFiles(cwd, staged)
  }, [cwd, status, unstageFiles])

  const handleCommit = useCallback(() => {
    if (!cwd || !commitMsg.trim()) return
    commitChanges(cwd, commitMsg.trim())
    setCommitMsg('')
  }, [cwd, commitMsg, commitChanges])

  const handlePush = useCallback(() => {
    if (!cwd) return
    pushChanges(cwd)
  }, [cwd, pushChanges])

  const handlePull = useCallback(() => {
    if (!cwd) return
    pullChanges(cwd)
  }, [cwd, pullChanges])

  const handleToggleStage = useCallback(
    (file: GitFileChange) => {
      if (!cwd) return
      if (file.staged) {
        unstageFiles(cwd, [file.path])
      } else {
        stageFiles(cwd, [file.path])
      }
    },
    [cwd, stageFiles, unstageFiles]
  )

  if (!cwd) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-[#555]">
        未加载工作区
      </div>
    )
  }

  const stagedChanges = status?.changes.filter((c) => c.staged) ?? []
  const unstagedChanges = status?.changes.filter((c) => !c.staged) ?? []
  const modifiedCount = status?.changes.filter((c) => c.status === 'M').length ?? 0
  const addedCount = status?.changes.filter((c) => c.status === 'A' || c.status === '??').length ?? 0
  const deletedCount = status?.changes.filter((c) => c.status === 'D').length ?? 0

  return (
    <div className="flex-1 flex flex-col overflow-hidden text-xs">
      {/* Branch bar */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
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
        <button
          onClick={() => cwd && fetchStatus(cwd)}
          className="w-[18px] h-[18px] rounded-[3px] flex items-center justify-center transition-colors hover:bg-[rgba(255,120,48,0.12)]"
          style={{ background: 'rgba(255, 120, 48, 0.06)', border: '1px solid rgba(255, 120, 48, 0.15)', color: '#ff7830' }}
          title="刷新"
        >
          ↻
        </button>
      </div>

      {/* Status summary */}
      <div className="flex gap-3 px-3 py-2" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#e5c07b' }} />
          <span className="text-[#888]">{modifiedCount} 修改</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#4ec9b0' }} />
          <span className="text-[#888]">{addedCount} 添加</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#e06c75' }} />
          <span className="text-[#888]">{deletedCount} 删除</span>
        </div>
      </div>

      {/* Changed files */}
      <div className="flex-1 overflow-y-auto">
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
              <span>暂存区</span>
              <button
                onClick={handleUnstageAll}
                className="text-[10px] normal-case tracking-normal font-normal transition-colors hover:text-[#ff7830]"
                style={{ color: '#666' }}
              >
                全部取消暂存
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
              <span>更改</span>
              <button
                onClick={handleStageAll}
                className="text-[10px] normal-case tracking-normal font-normal transition-colors hover:text-[#ff7830]"
                style={{ color: '#666' }}
              >
                全部暂存
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
            <span>工作区干净</span>
          </div>
        )}

        {/* Commit history */}
        {commits.length > 0 && (
          <div>
            <div
              className="px-3 py-1.5 text-[10px] font-semibold tracking-wider uppercase"
              style={{ color: '#555', background: 'rgba(255, 255, 255, 0.02)' }}
            >
              提交历史
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
                    <span>{formatDate(commit.date)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Commit input */}
      <div
        className="p-2"
        style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}
      >
        <div className="flex gap-1.5">
          <input
            type="text"
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCommit()}
            placeholder="提交消息..."
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
            提交
          </button>
        </div>
        <div className="flex gap-1.5 mt-1.5">
          <button
            onClick={handlePush}
            disabled={loading}
            className="flex-1 h-6 rounded text-[10px] transition-colors disabled:opacity-30"
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              color: '#888',
            }}
          >
            Push
          </button>
          <button
            onClick={handlePull}
            disabled={loading}
            className="flex-1 h-6 rounded text-[10px] transition-colors disabled:opacity-30"
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              color: '#888',
            }}
          >
            Pull
          </button>
        </div>
      </div>
    </div>
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

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins}分钟前`
    if (diffHours < 24) return `${diffHours}小时前`
    if (diffDays < 7) return `${diffDays}天前`
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}
