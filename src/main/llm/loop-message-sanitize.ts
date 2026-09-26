/**
 * @file Loop message sanitize — provider-safe role normalization.
 * @description
 *  Strict providers accept `system` only at the beginning of the
 *  conversation and reject mid-conversation `system` follow-ups with
 *  `system messages are only supported at the beginning of the conversation`.
 *  The agent loop appends such follow-ups (recovery / todo / repair nudges)
 *  after tool results, and `toVercelMessages` forwards roles verbatim, so the
 *  second provider call of a tool-using turn fails on those models.
 *  This module demotes every non-leading `system` message to `user`,
 *  preserving order and content; leading `system` messages pass through
 *  untouched. Nothing is dropped or merged, so tool-call pairing stays intact.
 */

// Note: mid-loop system follow-ups break strict providers — see .agents/notes/2026-09-26-chat-system-mid-conversation--e373dd26.md

export interface LoopMessage {
  role: string
  [key: string]: unknown
}

/**
 * Demote non-leading `system` messages to `user`.
 * The first run of `system` messages (the conversation has not started yet)
 * passes through; any `system` after the first non-`system` message is
 * relabelled. Vercel-shaped payloads (`tool` / assistant tool-call parts)
 * flow through untouched apart from the relabel.
 */
export function sanitizeLoopMessages<T extends LoopMessage>(messages: T[]): T[] {
  let started = false
  return messages.map((message) => {
    if (message.role !== 'system') {
      started = true
      return message
    }
    if (!started) return message
    return { ...message, role: 'user' }
  })
}
