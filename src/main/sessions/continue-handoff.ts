/**
 * Focused handoff text for Continue in New Session.
 *
 * Pure and dependency-free so the wording is pinned by tests: the handoff is
 * the only thing the new session receives, so its shape is a contract.
 */

export type HandoffSource = {
  /** Imported provider transcript row: no turns or checkpoints of ours. */
  external?: boolean
  firstPrompt: string
  lastPrompt: string
  transcriptPath?: string
  checkpointIds: string[]
}

export function truncateHandoffText(value: string, max: number): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length > max ? `${compact.slice(0, max)}…` : compact
}

/** Inline code span long enough to survive backticks inside the value. */
export function inlineCode(value: string): string {
  const longest = value.match(/`+/g)?.reduce((length, run) => Math.max(length, run.length), 0) ?? 0
  const fence = '`'.repeat(Math.max(1, longest + 1))
  return `${fence}${value}${fence}`
}

export function buildContinueHandoff(source: HandoffSource): string {
  const title = source.firstPrompt ? truncateHandoffText(source.firstPrompt, 120) : '未命名任务'
  const progress = source.lastPrompt ? truncateHandoffText(source.lastPrompt, 300) : '（暂无进展记录）'
  const parts = [`继续任务「${title}」。`, `最近进展：${progress}。`]
  // An external row owns no turns or checkpoints of ours: its whole context is
  // the provider transcript, so hand that over as a path the new session reads
  // on demand instead of a summary we have no turns to summarize.
  if (source.external === true) {
    if (source.transcriptPath) {
      parts.push(
        `完整原始转录在 ${inlineCode(source.transcriptPath)}，新会话可按需读取该文件，勿修改它。以当前仓库状态为准。`,
      )
    } else {
      parts.push('无原始转录路径，以当前仓库状态为准。')
    }
    return parts.join('')
  }
  if (source.transcriptPath) {
    parts.push(`历史 transcript 仅作只读参考（${source.transcriptPath}），以当前仓库状态为准。`)
  }
  const lastCheckpoint = source.checkpointIds.at(-1)
  if (lastCheckpoint) parts.push(`还原点：${lastCheckpoint.slice(0, 8)}。`)
  return parts.join('')
}
