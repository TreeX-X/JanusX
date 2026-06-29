import { useState, useEffect, useCallback } from 'react'
import { useCheckpointStore, type CheckpointSummary } from '@/stores/checkpoint'
import { useWorkspaceStore } from '@/stores/workspace'
import { ModalCloseButton } from './ModalCloseButton'
import { Select } from './ui/Select'

const ENGINE_LABELS: Record<string, string> = {
  manual: '手动',
  shell: 'Shell',
  claude: 'Claude Code',
  codex: 'Codex',
  opencode: 'OpenCode',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} 小时前`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

/** Color config for engine tags */
const ENGINE_TAG_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  manual: {
    color: '#d4d4d4',
    bg: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,255,255,0.14)',
  },
  shell: {
    color: '#58a6ff',
    bg: 'rgba(88,166,255,0.08)',
    border: 'rgba(88,166,255,0.2)',
  },
  claude: {
    color: '#4ec9b0',
    bg: 'rgba(78,201,176,0.08)',
    border: 'rgba(78,201,176,0.2)',
  },
  codex: {
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.08)',
    border: 'rgba(167,139,250,0.2)',
  },
  opencode: {
    color: '#ff7830',
    bg: 'rgba(255,120,48,0.08)',
    border: 'rgba(255,120,48,0.2)',
  },
}

export function CheckpointPanel() {
  const {
    checkpoints,
    loading,
    error,
    fetchCheckpoints,
    createCheckpoint,
    restoreCheckpoint,
    deleteCheckpoint,
    diffs,
    fetchAllDiffs,
    conflicts,
    clearConflicts,
  } = useCheckpointStore()
  const { activeWorkspaceId, workspaces } = useWorkspaceStore()
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const [filter, setFilter] = useState('all')
  const [expandedDiffId, setExpandedDiffId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<CheckpointSummary | null>(null)
  const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null)

  useEffect(() => {
    fetchCheckpoints(activeWorkspace?.path ? { cwd: activeWorkspace.path } : undefined)
  }, [fetchCheckpoints, activeWorkspace?.path])

  const filteredCheckpoints =
    filter === 'all' ? checkpoints : checkpoints.filter((cp) => cp.engine === filter)
  const restorePruneCount = restoreTarget
    ? checkpoints.filter((cp) => cp.conversationIndex > restoreTarget.conversationIndex).length
    : 0

  const handleRestore = useCallback(async () => {
    if (!restoreTarget) return
    const cwd = activeWorkspace?.path ?? ''
    await restoreCheckpoint(restoreTarget.id, cwd)
    setShowModal(false)
    setRestoreTarget(null)
  }, [restoreTarget, restoreCheckpoint, activeWorkspace?.path])

  const handleToggleDiff = useCallback(
    (cpId: string) => {
      const cwd = activeWorkspace?.path ?? ''
      const key = `${cpId}:`
      if (expandedDiffId === key) {
        setExpandedDiffId(null)
      } else {
        if (!(key in diffs)) {
          fetchAllDiffs(cpId, cwd)
        }
        setExpandedDiffId(key)
      }
    },
    [activeWorkspace?.path, diffs, fetchAllDiffs, expandedDiffId],
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filter bar */}
      <div
        className="px-3 py-2 flex items-center gap-2 shrink-0"
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'rgba(255,255,255,0.01)',
        }}
      >
        <span
          className="uppercase font-semibold"
          style={{ fontSize: 10, color: '#555' }}
        >
          过滤来源
        </span>
        <Select
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: '工作区全部来源' },
            { value: 'manual', label: '手动' },
            { value: 'shell', label: 'Shell' },
            { value: 'claude', label: 'Claude Code' },
            { value: 'codex', label: 'Codex' },
            { value: 'opencode', label: 'OpenCode' }
          ]}
          className="flex-1 rounded"
          style={{
            height: 24,
            fontSize: 11,
            color: '#bbb'
          }}
        />
        <button
          onClick={async () => {
            if (!activeWorkspace?.path) return
            await createCheckpoint({
              terminalId: 'manual',
              engine: 'manual',
              prompt: '手动还原点',
              cwd: activeWorkspace.path,
            })
          }}
          className="h-6 px-2 rounded text-[10px] transition-colors shrink-0"
          style={{
            background: 'rgba(255,120,48,0.08)',
            border: '1px solid rgba(255,120,48,0.2)',
            color: '#ff7830',
          }}
        >
          + 创建还原点
        </button>
      </div>

      {/* Timeline container */}
      <div
        className="flex-1 flex flex-col relative"
        style={{
          gap: 16,
          padding: 12,
          overflowY: 'auto',
        }}
      >
        {/* Vertical axis line */}
        <div
          className="absolute w-px"
          style={{
            left: 19,
            top: 16,
            bottom: 16,
            background: 'rgba(255,255,255,0.05)',
          }}
        />

        {loading && (
          <div className="pointer-events-none absolute right-3 top-3 z-[2] text-[#555] text-xs">
            加载中...
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full text-[#e06c75] text-xs">
            {error}
          </div>
        )}

        {!loading && filteredCheckpoints.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <div className="text-[#555] text-xs">暂无还原点</div>
          </div>
        )}

        {filteredCheckpoints.map((cp) => {
          const isDiffExpanded = expandedDiffId === `${cp.id}:`
          const tagStyle = ENGINE_TAG_STYLES[cp.engine] ?? ENGINE_TAG_STYLES.opencode
          const isActive = cp.status === 'ready'

          return (
            <div key={cp.id} className="flex gap-3 relative">
              {/* Timeline node */}
              <div
                className="rounded-full flex items-center justify-center shrink-0 z-[1]"
                style={{
                  width: 15,
                  height: 15,
                  background: 'rgba(18,18,20,0.85)',
                  border: `2px solid ${isActive ? '#ff7830' : '#555'}`,
                  boxShadow: isActive ? '0 0 8px rgba(255,120,48,0.4)' : 'none',
                  marginTop: 2,
                }}
              >
                {isActive && (
                  <div
                    className="rounded-full"
                    style={{ width: 5, height: 5, background: '#ff7830' }}
                  />
                )}
              </div>

              {/* Card body */}
              <div
                className="flex-1 min-w-0 transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.04)',
                  borderRadius: 6,
                  padding: 10,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                  e.currentTarget.style.borderColor = 'rgba(255,120,48,0.2)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)'
                }}
              >
                {/* Header */}
                <div className="flex justify-between items-center" style={{ marginBottom: 4 }}>
                  <span
                    className="font-bold rounded"
                    style={{
                      fontSize: 10,
                      color: tagStyle.color,
                      background: tagStyle.bg,
                      border: `1px solid ${tagStyle.border}`,
                      padding: '1px 6px',
                    }}
                  >
                    {ENGINE_LABELS[cp.engine] ?? cp.engine}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: '#666',
                      fontFamily: "'SF Mono', monospace",
                    }}
                  >
                    #{cp.conversationIndex}
                  </span>
                </div>

                {/* Prompt / Terminal conversation content */}
                <div
                  style={{
                    fontSize: 12,
                    color: '#d4d4d4',
                    lineHeight: 1.4,
                    marginBottom: 6,
                    wordBreak: 'break-all',
                    whiteSpace: 'pre-wrap',
                    maxHeight: expandedPromptId === cp.id ? 'none' : 42,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  {cp.prompt}
                  {cp.prompt.length > 80 && expandedPromptId !== cp.id && (
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        paddingLeft: 16,
                        background: 'linear-gradient(90deg, transparent, rgba(18,18,18,0.95) 40%)',
                      }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandedPromptId(cp.id)
                        }}
                        style={{
                          fontSize: 10,
                          color: '#ff7830',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        展开
                      </button>
                    </span>
                  )}
                </div>
                {cp.prompt.length > 80 && expandedPromptId === cp.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setExpandedPromptId(null)
                    }}
                    style={{
                      fontSize: 10,
                      color: '#ff7830',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      marginBottom: 4,
                      padding: 0,
                    }}
                  >
                    收起
                  </button>
                )}

                {/* Files summary */}
                <div
                  className="flex flex-col"
                  style={{
                    fontFamily: "'SF Mono', monospace",
                    fontSize: 10,
                    color: '#777',
                    gap: 3,
                    marginBottom: 8,
                  }}
                >
                  <div className="flex justify-between">
                    <span className="overflow-hidden overflow-ellipsis whitespace-nowrap">
                      {cp.changedFileCount} 个差异文件
                    </span>
                    {cp.changedFileCount > 0 && (
                      <span style={{ color: '#4ec9b0' }}>+{cp.changedFileCount}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div
                  className="flex"
                  style={{
                    gap: 6,
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                    paddingTop: 8,
                    marginTop: 4,
                  }}
                >
                  <button
                    onClick={() => handleToggleDiff(cp.id)}
                    className="flex-1 rounded flex items-center justify-center cursor-pointer transition-colors"
                    style={{
                      height: 22,
                      fontSize: 10,
                      border: '1px solid rgba(255,255,255,0.06)',
                      background: 'rgba(255,255,255,0.03)',
                      color: '#888',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,120,48,0.08)'
                      e.currentTarget.style.borderColor = 'rgba(255,120,48,0.3)'
                      e.currentTarget.style.color = '#ff7830'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                      e.currentTarget.style.color = '#888'
                    }}
                  >
                    对比 Diff
                  </button>
                  <button
                    onClick={() => {
                      setRestoreTarget(cp)
                      setShowModal(true)
                    }}
                    className="flex-1 rounded flex items-center justify-center cursor-pointer transition-colors"
                    style={{
                      height: 22,
                      fontSize: 10,
                      border: '1px solid rgba(255,120,48,0.2)',
                      background: 'rgba(255,120,48,0.08)',
                      color: '#ff7830',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,120,48,0.15)'
                      e.currentTarget.style.borderColor = 'rgba(255,120,48,0.4)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,120,48,0.08)'
                      e.currentTarget.style.borderColor = 'rgba(255,120,48,0.2)'
                    }}
                  >
                    还原到此处
                  </button>
                </div>

                {/* Inline diff drawer */}
                {isDiffExpanded && (
                  <div
                    className="overflow-hidden"
                    style={{
                      marginTop: 6,
                      background: 'rgba(10,10,10,0.6)',
                      border: '1px solid rgba(255,255,255,0.04)',
                      borderRadius: 4,
                    }}
                  >
                    <div
                      style={{
                        padding: '4px 8px',
                        fontSize: 10,
                        color: '#555',
                        background: 'rgba(255,255,255,0.02)',
                      }}
                    >
                      Diff 预览
                    </div>
                    <pre
                      className="overflow-x-auto m-0"
                      style={{
                        padding: 8,
                        fontSize: 10,
                        fontFamily: "'SF Mono', monospace",
                        lineHeight: 1.5,
                      }}
                    >
                      {`${cp.id}:` in diffs ? (
                        diffs[`${cp.id}:`] ? (
                          diffs[`${cp.id}:`]
                            .split('\n')
                            .map((line, i) => (
                              <div
                                key={i}
                                style={{
                                  color: line.startsWith('-')
                                    ? '#e06c75'
                                    : line.startsWith('+')
                                      ? '#4ec9b0'
                                      : '#888',
                                }}
                              >
                                {line}
                              </div>
                            ))
                        ) : (
                          <div style={{ color: '#666' }}>没有差异文件</div>
                        )
                      ) : (
                        <div style={{ color: '#555' }}>加载差异...</div>
                      )}
                    </pre>
                  </div>
                )}

                {/* Meta */}
                <div
                  className="flex justify-between"
                  style={{ fontSize: 9, color: '#444', marginTop: 6 }}
                >
                  <span>branch: {cp.branch}</span>
                  <span>
                    {formatDate(cp.createdAt)} · {cp.branch}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Restore confirmation modal */}
      {showModal && restoreTarget && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{
            background: 'rgba(0,0,0,0.64)',
            backdropFilter: 'blur(12px)',
            zIndex: 1000,
          }}
        >
          <div
            className="overflow-hidden"
            style={{
              width: 460,
              background: 'rgba(18,18,18,0.98)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              boxShadow: '0 24px 60px rgba(0,0,0,0.72)',
            }}
          >
            {/* Modal header */}
            <div
              className="flex justify-between items-center"
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div
                className="font-semibold"
                style={{ fontSize: 13, color: '#fff' }}
              >
                确认还原
              </div>
              <ModalCloseButton
                onClose={() => {
                  setShowModal(false)
                  setRestoreTarget(null)
                  clearConflicts()
                }}
              />
            </div>

            {/* Modal body */}
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: '#999', marginBottom: 12, lineHeight: 1.6 }}>
                将工作区恢复到 #{restoreTarget.conversationIndex}。编号更大的还原点会从列表中移除。
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: '#d4d4d4',
                  marginBottom: 16,
                  padding: '8px 10px',
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 6,
                  lineHeight: 1.4,
                }}
              >
                &ldquo;{restoreTarget.prompt}&rdquo;
              </div>

              <div className="flex flex-col" style={{ gap: 8, marginBottom: 12 }}>
                <div
                  style={{
                    padding: '10px 12px',
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 6,
                  }}
                >
                  <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                    <span
                      style={{
                        fontFamily: "'SF Mono', monospace",
                        fontSize: 11,
                        color: '#d4d4d4',
                      }}
                    >
                      {restoreTarget.changedFileCount} 个差异文件
                    </span>
                    <span
                      className="rounded"
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#d4d4d4',
                        background: 'rgba(255,255,255,0.07)',
                        padding: '2px 6px',
                      }}
                    >
                      目标状态
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#666' }}>
                    当前工作区将被替换为该还原点记录的文件状态
                  </div>
                </div>

                {restorePruneCount > 0 && (
                  <div
                    style={{
                      padding: '10px 12px',
                      background: 'rgba(255,120,48,0.03)',
                      border: '1px solid rgba(255,120,48,0.18)',
                      borderRadius: 6,
                      fontSize: 11,
                      color: '#999',
                    }}
                  >
                    将移除 {restorePruneCount} 个后续还原点，保留当前还原点及之前的历史。
                  </div>
                )}

                {conflicts.length > 0 && (
                  <div
                    style={{
                      padding: '10px 12px',
                      background: 'rgba(224,108,117,0.02)',
                      border: '1px solid rgba(224,108,117,0.3)',
                      borderRadius: 6,
                    }}
                  >
                    <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                      <span
                        style={{
                          fontFamily: "'SF Mono', monospace",
                          fontSize: 11,
                          color: '#d4d4d4',
                        }}
                      >
                        {conflicts.length} 个冲突文件
                      </span>
                      <span
                        className="rounded"
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: '#e06c75',
                          background: 'rgba(224,108,117,0.1)',
                          padding: '2px 6px',
                        }}
                      >
                        存在冲突
                      </span>
                    </div>
                    {conflicts.map((c) => (
                      <div
                        key={c.filePath}
                        style={{
                          fontFamily: "'SF Mono', monospace",
                          fontSize: 11,
                          color: '#999',
                          marginTop: 4,
                        }}
                      >
                        {c.filePath}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ fontSize: 11, color: '#666', lineHeight: 1.5 }}>
                {conflicts.length > 0
                  ? '冲突文件需要手动处理。'
                  : '还原完成后，右侧列表会自动刷新。'}
              </div>
            </div>

            {/* Modal footer */}
            <div
              className="flex justify-end"
              style={{
                padding: '12px 16px',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                gap: 8,
              }}
            >
              <button
                onClick={() => {
                  setShowModal(false)
                  setRestoreTarget(null)
                  clearConflicts()
                }}
                className="rounded cursor-pointer transition-colors"
                style={{
                  height: 28,
                  padding: '0 16px',
                  fontSize: 11,
                  border: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(255,255,255,0.03)',
                  color: '#888',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                  e.currentTarget.style.color = '#fff'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                  e.currentTarget.style.color = '#888'
                }}
              >
                取消
              </button>
              <button
                onClick={handleRestore}
                className="rounded cursor-pointer transition-colors"
                style={{
                  height: 28,
                  padding: '0 16px',
                  fontSize: 11,
                  border: '1px solid rgba(255,120,48,0.28)',
                  background: 'rgba(255,120,48,0.1)',
                  color: '#ff7830',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,120,48,0.2)'
                  e.currentTarget.style.borderColor = 'rgba(255,120,48,0.5)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,120,48,0.12)'
                  e.currentTarget.style.borderColor = 'rgba(255,120,48,0.3)'
                }}
              >
                确认还原
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
