// Note: diff 计数徽标与会话侧同源 — .agents/notes/workbench/preview-editor-display-style.md
/** +N/−N 计数徽标：零变更隐藏，绿加红减。会话流改动卡、TurnChangeIsland 与文件窗口共用此呈现。 */
export function DiffCounts({ additions, deletions }: { additions: number; deletions: number }) {
  if (additions <= 0 && deletions <= 0) return null
  return <span className="diff-counts">
    {additions > 0 && <span style={{ color: 'var(--shell-diff-add)' }}>+{additions.toLocaleString()}</span>}
    {deletions > 0 && <span style={{ color: 'var(--shell-diff-del)' }}>−{deletions.toLocaleString()}</span>}
  </span>
}
