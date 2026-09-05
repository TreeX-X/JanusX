import type { Message } from './useJanusChat'

/**
 * R6-full 渲染侧 steering 小件（纯函数，可单测）。
 *
 * 模型：send-during-stream 时渲染端乐观追加用户消息（随会话落盘即 durable），
 * 主侧队列只负责“何时注入本轮”。两边以 entryId（= 消息 id）对账：
 * - steering_consumed 到达 → 清 badge（消息早已在历史中，无需搬运）。
 * - 请求结束时未消费 → badge 清除，文本留历史，下次发送自然带上。
 * - 撤销成功 → 从历史移除该消息；已消费则撤销失败，消息保留。
 */

/** steering_consumed 到达：badge 清除（幂等，未知 id 直接忽略）。 */
export function consumeSteeredIds(pending: string[], keys: string[]): string[] {
  if (keys.length === 0 || pending.length === 0) return pending
  const consumed = new Set(keys)
  const next = pending.filter((id) => !consumed.has(id))
  return next.length === pending.length ? pending : next
}

/** 撤销成功：从历史移除该乐观消息（调用方保证幂等：缺席返回原引用）。 */
export function removeMessageById(messages: Message[], id: string): Message[] {
  return messages.some((message) => message.id === id)
    ? messages.filter((message) => message.id !== id)
    : messages
}
