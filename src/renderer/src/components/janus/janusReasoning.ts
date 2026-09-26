/**
 * @file 思维链收纳展示的纯函数：有界缓冲、截断方向与展示文案。
 * @description reasoning 与正文严格隔离：永不计入 streamedText，只做 UI 展示。
 *              超限截头部留尾部（尾部通常是最新推理方向），并标记 truncated。
 */

export const MAX_REASONING_CHARS = 4_000

export interface ReasoningSnapshot {
  text: string
  /** 本轮实际收到的总字符数（含被截掉的部分），用于“已思考 N 字”。 */
  chars: number
  truncated: boolean
  /** 本轮思考耗时（毫秒，落库时由 turnStartedAt 结算；流式中为空，用 startedAt 实时计算）。 */
  durationMs?: number
}

export function emptyReasoning(): ReasoningSnapshot {
  return { text: '', chars: 0, truncated: false }
}

/** 追加增量并执行有界截断（截头留尾）。 */
export function appendReasoningDelta(current: ReasoningSnapshot, delta: string): ReasoningSnapshot {
  if (!delta) return current
  const chars = current.chars + delta.length
  const combined = current.text + delta
  if (combined.length <= MAX_REASONING_CHARS) {
    return { ...current, text: combined, chars }
  }
  return { ...current, text: combined.slice(-MAX_REASONING_CHARS), chars, truncated: true }
}

/**
 * agentX Activity parity：思考耗时文案（<60s 取一位小数秒，否则 Xm Ys）。
 * 纯函数，JanusChat 状态行与 ThinkingRegion 共用。
 */
export function formatThinkingDuration(ms: number): string {
  const safe = Math.max(0, ms)
  const seconds = safe / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`
}

function firstNonEmptyLine(text: string): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed) return trimmed
  }
  return ''
}

function lastNonEmptyLine(text: string): string {
  const lines = text.split('\n')
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const trimmed = (lines[index] ?? '').trim()
    if (trimmed) return trimmed
  }
  return ''
}

function stripMarkdownInline(text: string): string {
  return text.replace(/^#+\s+|\*\*/g, '').trim()
}

function truncateRun(text: string, maxChars: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxChars) return trimmed
  return `${trimmed.slice(0, Math.max(0, maxChars - 1))}…`
}

/** agentX collapsed thinking parity：首个有效行的摘要（去 markdown 符号）。 */
export function extractThinkingGist(text: string, maxChars = 80): string {
  const first = firstNonEmptyLine(text)
  if (!first) return ''
  return truncateRun(stripMarkdownInline(first), maxChars)
}

/** agentX live parity：流式中 collapsed 仍可见的尾行（带光标）。 */
export function extractThinkingLiveTail(text: string, maxChars = 120): string {
  const last = lastNonEmptyLine(text)
  if (!last) return ''
  return truncateRun(stripMarkdownInline(last), maxChars)
}
