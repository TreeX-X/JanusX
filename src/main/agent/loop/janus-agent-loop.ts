import type { AgentUsage, NormalizedProviderError } from '../stream/types'

/**
 * Policy-free agent loop shared by chat, project configuration, and blueprint tools.
 *
 * The loop owns turn and tool-call sequencing only. Approval, knowledge, tracing,
 * and persistence stay in hooks or the session layer.
 */

export interface JanusAgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCallId?: string
  toolName?: string
  toolCalls?: JanusToolCall[]
}

export interface JanusToolCall {
  id: string
  name: string
  arguments: unknown
}

export interface JanusAgentToolResult {
  content: string
  details?: unknown
  isError?: boolean
  terminate?: boolean
}

export interface JanusAgentTool {
  name: string
  executionMode?: 'sequential' | 'parallel'
  execute: (call: JanusToolCall, signal: AbortSignal, onUpdate?: (partialResult: unknown) => void) => Promise<JanusAgentToolResult>
}

export interface JanusAgentStreamResult {
  message: JanusAgentMessage
  toolCalls?: JanusToolCall[]
}

export type JanusAgentEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end'; messages: JanusAgentMessage[] }
  | { type: 'turn_start'; turn: number }
  | { type: 'turn_end'; turn: number; message: JanusAgentMessage; toolResults: JanusAgentMessage[] }
  | { type: 'message_start'; message: JanusAgentMessage }
  | { type: 'message_update'; delta: string }
  | { type: 'reasoning_update'; delta: string }
  | { type: 'message_end'; message: JanusAgentMessage }
  | { type: 'tool_call_start'; callId: string; name?: string }
  | { type: 'tool_call_update'; callId: string; name?: string; argumentsDelta: string }
  | { type: 'tool_call_ready'; call: JanusToolCall }
  | { type: 'model_finish'; reason: 'stop' | 'tool_calls' | 'length' | 'unknown'; usage?: AgentUsage }
  | { type: 'model_error'; error: NormalizedProviderError }
  | { type: 'tool_execution_start'; call: JanusToolCall }
  | { type: 'tool_execution_update'; call: JanusToolCall; partialResult: unknown }
  | { type: 'tool_execution_end'; call: JanusToolCall; result: JanusAgentToolResult; isError: boolean }

export interface JanusBeforeToolCallContext {
  call: JanusToolCall
  tool: JanusAgentTool
  turn: number
}

export interface JanusBeforeToolCallResult {
  block?: boolean
  reason?: string
  terminate?: boolean
}

export interface JanusAfterToolCallContext extends JanusBeforeToolCallContext {
  result: JanusAgentToolResult
}

export interface JanusShouldStopAfterTurnContext {
  turn: number
  message: JanusAgentMessage
  toolResults: JanusAgentMessage[]
  messages: JanusAgentMessage[]
}

export interface JanusAgentLoopConfig {
  tools: JanusAgentTool[]
  stream: (messages: JanusAgentMessage[], signal: AbortSignal, emit: (event: JanusAgentEvent) => void) => Promise<JanusAgentStreamResult>
  transformContext?: (messages: JanusAgentMessage[], signal: AbortSignal) => Promise<JanusAgentMessage[]>
  beforeToolCall?: (context: JanusBeforeToolCallContext, signal: AbortSignal) => Promise<JanusBeforeToolCallResult | undefined>
  afterToolCall?: (context: JanusAfterToolCallContext, signal: AbortSignal) => Promise<JanusAgentToolResult | undefined>
  getSteeringMessages?: (context: { turn: number; messages: JanusAgentMessage[] }) => Promise<JanusAgentMessage[]>
  getFollowUpMessages?: (context: { turn: number; messages: JanusAgentMessage[] }) => Promise<JanusAgentMessage[]>
  /** pi parity: graceful stop after a completed turn, before steering/follow-up queues. */
  shouldStopAfterTurn?: (context: JanusShouldStopAfterTurnContext, signal: AbortSignal) => Promise<boolean>
  maxTurns?: number
  onEvent?: (event: JanusAgentEvent) => void
}

function errorResult(error: unknown): JanusAgentToolResult {
  return {
    content: error instanceof Error ? error.message : String(error),
    isError: true,
  }
}

function toolMessage(call: JanusToolCall, result: JanusAgentToolResult): JanusAgentMessage {
  return { role: 'tool', content: result.content, toolCallId: call.id, toolName: call.name }
}

export async function runJanusAgentLoop(
  initialMessages: JanusAgentMessage[],
  config: JanusAgentLoopConfig,
  signal: AbortSignal = new AbortController().signal,
): Promise<JanusAgentMessage[]> {
  const tools = new Map(config.tools.map((tool) => [tool.name, tool]))
  const messages = [...initialMessages]
  const emit = (event: JanusAgentEvent) => config.onEvent?.(event)
  const maxTurns = Math.max(1, config.maxTurns ?? 20)

  emit({ type: 'agent_start' })
  try {
    for (let turn = 0; turn < maxTurns; turn += 1) {
      if (signal.aborted) break
      emit({ type: 'turn_start', turn })
      const context = config.transformContext
        ? await config.transformContext([...messages], signal)
        : [...messages]
      const streamed = await config.stream(context, signal, emit)
      messages.push(streamed.message)
      emit({ type: 'message_end', message: streamed.message })

      const toolCalls = streamed.toolCalls ?? []
      if (toolCalls.length === 0) {
        emit({ type: 'turn_end', turn, message: streamed.message, toolResults: [] })
        if (config.shouldStopAfterTurn
          && await config.shouldStopAfterTurn({ turn, message: streamed.message, toolResults: [], messages: [...messages] }, signal)) break
        const followUp = config.getFollowUpMessages ? await config.getFollowUpMessages({ turn, messages: [...messages] }) : []
        if (followUp.length === 0) break
        messages.push(...followUp)
        continue
      }

      const toolResults: JanusAgentMessage[] = []
      // pi parity: stop only when EVERY finalized result in the batch sets
      // terminate:true; mixed batches continue normally.
      const terminateFlags: boolean[] = []
      const execute = async (call: JanusToolCall): Promise<JanusAgentMessage> => {
        emit({ type: 'tool_execution_start', call })
        const tool = tools.get(call.name)
        if (!tool) {
          const result = errorResult(`Unknown tool: ${call.name}`)
          emit({ type: 'tool_execution_end', call, result, isError: true })
          terminateFlags.push(false)
          return toolMessage(call, result)
        }
        const before = config.beforeToolCall ? await config.beforeToolCall({ call, tool, turn }, signal) : undefined
        if (before?.block) {
          const result = { content: before.reason ?? 'Tool call blocked', isError: true, terminate: before.terminate }
          emit({ type: 'tool_execution_end', call, result, isError: true })
          terminateFlags.push(before.terminate === true)
          return toolMessage(call, result)
        }

        let result: JanusAgentToolResult
        try {
          result = await tool.execute(call, signal, (partialResult) => emit({ type: 'tool_execution_update', call, partialResult }))
        } catch (error) {
          result = errorResult(error)
        }
        const overridden = config.afterToolCall
          ? await config.afterToolCall({ call, tool, turn, result }, signal)
          : undefined
        result = overridden ?? result
        emit({ type: 'tool_execution_end', call, result, isError: result.isError === true })
        terminateFlags.push(result.terminate === true)
        return toolMessage(call, result)
      }

      const parallelCalls = toolCalls.filter((call) => tools.get(call.name)?.executionMode === 'parallel')
      const sequentialCalls = toolCalls.filter((call) => tools.get(call.name)?.executionMode !== 'parallel')
      toolResults.push(...await Promise.all(parallelCalls.map(execute)))
      for (const call of sequentialCalls) toolResults.push(await execute(call))
      messages.push(...toolResults)
      emit({ type: 'turn_end', turn, message: streamed.message, toolResults })
      if (terminateFlags.length > 0 && terminateFlags.every(Boolean)) break
      if (config.shouldStopAfterTurn
        && await config.shouldStopAfterTurn({ turn, message: streamed.message, toolResults, messages: [...messages] }, signal)) break

      const steering = config.getSteeringMessages ? await config.getSteeringMessages({ turn, messages: [...messages] }) : []
      if (steering.length > 0) messages.push(...steering)
    }
  } finally {
    emit({ type: 'agent_end', messages: [...messages] })
  }
  return messages
}
