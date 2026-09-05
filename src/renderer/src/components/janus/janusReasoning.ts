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
    return { text: combined, chars, truncated: current.truncated }
  }
  return { text: combined.slice(-MAX_REASONING_CHARS), chars, truncated: true }
}
