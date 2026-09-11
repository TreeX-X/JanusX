import { stripVTControlCharacters } from 'node:util'
import { redactPolicyValue, type AgentStreamEvent } from '@janus-agent/agent-core'
import type { ChatAgentEvent } from '../../shared/ipc/llm'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function preview(value: unknown, limit: number): string {
  const safe = redactPolicyValue(value)
  const clean = (text: string) => stripVTControlCharacters(text).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
  const text = typeof safe === 'string' ? clean(safe)
    : JSON.stringify(safe, (_key, item) => typeof item === 'string' ? clean(item) : item, 2) ?? ''
  return text.length > limit ? `${text.slice(0, limit - 20)}\n[output truncated]` : text
}

/** Raw events stay in Main; only bounded, redacted display fields cross IPC. */
export function toChatStreamDisplay(event: AgentStreamEvent): ChatAgentEvent | undefined {
  if (event.type !== 'tool_call_ready' && event.type !== 'tool_execution_update' && event.type !== 'tool_execution_end') return
  const args = record(event.call.arguments)
  const target = Object.fromEntries(['path', 'query', 'program', 'args', 'cwd', 'command', 'projectId', 'message']
    .filter((key) => args[key] !== undefined).map((key) => [key, args[key]]))
  const display: Extract<ChatAgentEvent, { type: 'tool_display' }> = {
    type: 'tool_display', requestId: event.requestId, callId: event.call.id,
    toolName: event.call.name, argsDigest: Object.keys(target).length ? preview(target, 2000) : undefined,
  }
  if (event.type === 'tool_execution_update') display.resultDigest = preview(event.partialResult, 12000)
  if (event.type === 'tool_execution_end') {
    const details = record(event.result.details)
    const output = record(details.output)
    const failed = event.isError || output.ok === false || output.timedOut === true
      || (typeof output.exitCode === 'number' && output.exitCode !== 0)
    display.status = failed ? 'failed' : 'completed'
    display.resultDigest = preview(details.output ?? event.result.content, 12000)
    if (failed) display.errorDetail = preview(details.error ?? event.result.content, 2000)
    if (typeof details.summary === 'string') display.summary = preview(details.summary, 2000)
  }
  return display
}
