import { streamText } from '../../llm/ai-runtime'
import type {
  JanusAgentEvent,
  JanusAgentMessage,
  JanusAgentStreamResult,
  JanusAgentTool,
  JanusToolCall,
} from './janus-agent-loop'

interface VercelTool {
  description?: string
  parameters: unknown
  execute?: (input: any) => Promise<unknown> | unknown
}

interface VercelStreamResult {
  textStream: AsyncIterable<string>
  toolCalls?: Promise<Array<{ toolCallId: string; toolName: string; args: unknown }>>
}

type StreamTextFn = (options: Record<string, unknown>) => VercelStreamResult | Promise<VercelStreamResult>

function parseToolResult(content: string): unknown {
  try { return JSON.parse(content) } catch { return content }
}

export function toVercelMessages(messages: JanusAgentMessage[]): unknown[] {
  return messages.map((message) => {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        content: [{
          type: 'tool-result',
          toolCallId: message.toolCallId ?? '',
          toolName: message.toolName ?? '',
          result: parseToolResult(message.content),
        }],
      }
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
      return {
        role: 'assistant',
        content: [
          ...(message.content ? [{ type: 'text', text: message.content }] : []),
          ...message.toolCalls.map((call) => ({
            type: 'tool-call', toolCallId: call.id, toolName: call.name, args: call.arguments,
          })),
        ],
      }
    }
    return { role: message.role, content: message.content }
  })
}

export function createVercelModelTools(tools: Record<string, VercelTool>): Record<string, Omit<VercelTool, 'execute'>> {
  return Object.fromEntries(Object.entries(tools).map(([name, { execute: _execute, ...tool }]) => [name, tool]))
}

export function createLoopToolsFromVercel(tools: Record<string, VercelTool>): JanusAgentTool[] {
  return Object.entries(tools).map(([name, tool]) => ({
    name,
    executionMode: 'sequential',
    execute: async (call, signal) => {
      if (signal.aborted) return { content: 'Tool execution cancelled', isError: true }
      if (!tool.execute) return { content: `Tool has no executor: ${name}`, isError: true }
      try {
        const output = await tool.execute(
          call.arguments && typeof call.arguments === 'object' && !Array.isArray(call.arguments)
            ? call.arguments as Record<string, unknown>
            : {},
        )
        return { content: typeof output === 'string' ? output : JSON.stringify(output) }
      } catch (error) {
        return { content: error instanceof Error ? error.message : String(error), isError: true }
      }
    },
  }))
}

export function createVercelStream(options: {
  model: unknown
  tools?: Record<string, VercelTool>
  streamTextFn?: StreamTextFn
}) {
  const modelTools = options.tools ? createVercelModelTools(options.tools) : undefined
  const streamTextFn = options.streamTextFn ?? streamText as unknown as StreamTextFn
  return async (
    messages: JanusAgentMessage[],
    signal: AbortSignal,
    emit: (event: JanusAgentEvent) => void,
  ): Promise<JanusAgentStreamResult> => {
    const assistant: JanusAgentMessage = { role: 'assistant', content: '' }
    emit({ type: 'message_start', message: assistant })
    const result = await streamTextFn({
      model: options.model,
      messages: toVercelMessages(messages),
      abortSignal: signal,
      ...(modelTools ? { tools: modelTools } : {}),
      maxSteps: 1,
    })
    for await (const delta of result.textStream) {
      if (signal.aborted) break
      assistant.content += delta
      emit({ type: 'message_update', delta })
    }
    const calls = await (result.toolCalls ?? Promise.resolve([]))
    const toolCalls: JanusToolCall[] = calls.map((call) => ({
      id: call.toolCallId,
      name: call.toolName,
      arguments: call.args,
    }))
    if (toolCalls.length) assistant.toolCalls = toolCalls
    return { message: assistant, toolCalls }
  }
}
