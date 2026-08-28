import type { ModelInfo } from '@janusx/llm-core'
import type { ToolResult } from '../../shared/ipc/agent-runtime'
import type { JanusAgentMessage } from '../agent/loop'

const DEFAULT_CONTEXT_WINDOW = 16_384
const DEFAULT_RESERVED_OUTPUT_TOKENS = 2_048
const SAFETY_MARGIN_TOKENS = 512
const MAX_LOADED_FILES = 3
const MAX_LOADED_FILE_CHARS = 6_000
const MAX_TOOL_CONTENT_CHARS = 6_000
const MAX_TOOL_MESSAGE_CHARS = 4_000

interface LoadedContextEntry {
  workspaceId: string
  path: string
  offset: number
  bytes: number
  truncated: boolean
  sha256: string
  content: string
  size: number
  loadedAt: number
  stale: boolean
}

interface ToolOutput {
  workspaceId?: unknown
  path?: unknown
  sha256?: unknown
  size?: unknown
  content?: unknown
  offset?: unknown
  bytes?: unknown
  truncated?: unknown
  changedPaths?: unknown
}

function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4)
}

function bounded(value: string, maxChars: number): { value: string; truncated: boolean } {
  if (value.length <= maxChars) return { value, truncated: false }
  return { value: `${value.slice(0, maxChars)}\n[truncated]`, truncated: true }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function toolOutput(result: ToolResult): ToolOutput | undefined {
  return asRecord(result.output) as ToolOutput | undefined
}

export class LoadedContextIndex {
  private readonly entries = new Map<string, LoadedContextEntry>()

  record(result: ToolResult): void {
    const output = toolOutput(result)
    if (!output) return
    if (result.toolName === 'workspace.read' && result.status === 'completed'
      && typeof output.workspaceId === 'string' && typeof output.path === 'string'
      && typeof output.sha256 === 'string' && typeof output.content === 'string') {
      const content = bounded(output.content, MAX_LOADED_FILE_CHARS)
      const offset = typeof output.offset === 'number' ? output.offset : 0
      const bytes = typeof output.bytes === 'number' ? output.bytes : output.content.length
      const key = `${output.workspaceId}:${output.path}:${offset}`
      this.entries.set(key, {
        workspaceId: output.workspaceId,
        path: output.path,
        offset,
        bytes,
        truncated: output.truncated === true || content.truncated,
        sha256: output.sha256,
        content: content.value,
        size: typeof output.size === 'number' ? output.size : output.content.length,
        loadedAt: Date.now(),
        stale: false,
      })
      return
    }

    if (result.status !== 'completed') return
    const changedPaths = Array.isArray(output.changedPaths) ? output.changedPaths : []
    const workspaceId = typeof output.workspaceId === 'string' ? output.workspaceId : result.workspaceId
    for (const path of changedPaths) {
      if (typeof path !== 'string') continue
      for (const entry of this.entries.values()) {
        if (entry.workspaceId === workspaceId && entry.path === path) entry.stale = true
      }
    }
  }

  asSystemMessage(remainingTokens: number): JanusAgentMessage | undefined {
    const eligible = [...this.entries.values()]
      .filter((entry) => !entry.stale)
      .sort((left, right) => right.loadedAt - left.loadedAt)
      .slice(0, MAX_LOADED_FILES)
    if (eligible.length === 0 || remainingTokens < 64) return undefined

    const sections: string[] = []
    let usedTokens = 0
    for (const entry of eligible) {
      const header = [
        `Loaded workspace evidence: ${entry.workspaceId}/${entry.path}`,
        `range=${entry.offset}-${entry.offset + entry.bytes}; sha256=${entry.sha256}; size=${entry.size};${entry.truncated ? ' truncated;' : ''} read again when a newer range is needed.`,
      ].join('\n')
      const availableChars = Math.max(0, (remainingTokens - usedTokens) * 4 - header.length - 1)
      if (availableChars < 128) continue
      const content = bounded(entry.content, Math.min(MAX_LOADED_FILE_CHARS, availableChars)).value
      const section = `${header}\n${content}`
      const cost = estimateTokens(section)
      if (usedTokens + cost > remainingTokens) continue
      sections.push(section)
      usedTokens += cost
    }
    return sections.length ? { role: 'system', content: sections.join('\n\n') } : undefined
  }
}

function compactToolMessage(message: JanusAgentMessage): JanusAgentMessage {
  if (message.role !== 'tool') return message
  try {
    const value = JSON.parse(message.content) as unknown
    const output = asRecord(value)
    if (output && typeof output.content === 'string') {
      const content = bounded(output.content, MAX_TOOL_CONTENT_CHARS)
      return {
        ...message,
        content: JSON.stringify({
          ...output,
          content: content.value,
          ...(content.truncated ? { truncated: true, guidance: 'Use workspace.read again for another range.' } : {}),
        }),
      }
    }
  } catch {
    // Non-JSON tool output is still bounded below.
  }
  return { ...message, content: bounded(message.content, MAX_TOOL_MESSAGE_CHARS).value }
}

function agentTurnUnits(messages: JanusAgentMessage[]): JanusAgentMessage[][] {
  const units: JanusAgentMessage[][] = []
  for (let index = messages.length - 1; index >= 0;) {
    if (messages[index].role !== 'tool') {
      units.push([messages[index]])
      index -= 1
      continue
    }
    const end = index + 1
    while (index >= 0 && messages[index].role === 'tool') index -= 1
    const start = index >= 0 && messages[index].role === 'assistant' && messages[index].toolCalls?.length
      ? index
      : index + 1
    units.push(messages.slice(start, end))
    index = start - 1
  }
  return units
}

export interface ChatContextBuildOptions {
  model?: Pick<ModelInfo, 'contextWindow' | 'maxOutputTokens'>
}

/** Builds a model context view without mutating the persisted conversation history. */
export class ChatSessionRuntime {
  readonly loadedContext = new LoadedContextIndex()

  recordToolResult(result: ToolResult): void {
    this.loadedContext.record(result)
  }

  buildContext(messages: JanusAgentMessage[], options: ChatContextBuildOptions = {}): JanusAgentMessage[] {
    const contextWindow = options.model?.contextWindow ?? DEFAULT_CONTEXT_WINDOW
    const reservedOutput = Math.min(options.model?.maxOutputTokens ?? DEFAULT_RESERVED_OUTPUT_TOKENS, DEFAULT_RESERVED_OUTPUT_TOKENS)
    const budget = contextWindow - reservedOutput - SAFETY_MARGIN_TOKENS
    const systems = messages.filter((message) => message.role === 'system')
    const systemTokens = systems.reduce((total, message) => total + estimateTokens(message.content), 0)
    if (systemTokens >= budget) throw new Error('SYSTEM_CONTEXT_EXCEEDS_BUDGET')

    const context = [...systems]
    let usedTokens = systemTokens
    const evidence = this.loadedContext.asSystemMessage(Math.max(0, budget - usedTokens))
    if (evidence) {
      context.push(evidence)
      usedTokens += estimateTokens(evidence.content)
    }

    for (const unit of agentTurnUnits(messages.filter((message) => message.role !== 'system'))) {
      const compacted = unit.map(compactToolMessage)
      const unitTokens = compacted.reduce((total, message) => total + estimateTokens(message.content), 0)
      if (usedTokens + unitTokens > budget) {
        if (context.length === systems.length + (evidence ? 1 : 0)) throw new Error('CURRENT_TURN_EXCEEDS_CONTEXT_BUDGET')
        break
      }
      context.splice(systems.length + (evidence ? 1 : 0), 0, ...compacted)
      usedTokens += unitTokens
    }
    return context
  }
}
