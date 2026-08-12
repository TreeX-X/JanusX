import type { LanguageModelV1 } from '../core/types'

type StreamChunk = Record<string, any>

function mapTool(tool: Record<string, any>): Record<string, any> {
  if (tool.type === 'provider-defined') {
    return { ...tool, type: 'provider' }
  }
  const { parameters, ...rest } = tool
  return {
    ...rest,
    inputSchema: tool.inputSchema ?? parameters,
  }
}

function mapProviderOptions(value: Record<string, any>): Record<string, any> {
  const { providerMetadata, experimental_providerMetadata, ...rest } = value
  const metadata = providerMetadata ?? experimental_providerMetadata
  return {
    ...rest,
    ...(metadata !== undefined ? { providerOptions: metadata } : {}),
  }
}

function mapToolResultOutput(part: Record<string, any>): Record<string, any> {
  if (part.content) {
    return {
      type: 'content',
      value: part.content.map((item: Record<string, any>) => item.type === 'image'
        ? { type: 'file-data', data: item.data, mediaType: item.mimeType ?? 'application/octet-stream' }
        : item),
    }
  }
  if (part.isError) {
    return typeof part.result === 'string'
      ? { type: 'error-text', value: part.result }
      : { type: 'error-json', value: part.result ?? null }
  }
  return typeof part.result === 'string'
    ? { type: 'text', value: part.result }
    : { type: 'json', value: part.result ?? null }
}

function mapPromptPart(
  part: Record<string, any>,
  toolProviderMetadata?: Map<string, Record<string, any>>,
): Record<string, any> {
  const mapped = mapProviderOptions(part)
  if (part.type === 'tool-call') {
    const { args: _args, providerOptions, ...rest } = mapped
    const metadata = providerOptions ?? toolProviderMetadata?.get(part.toolCallId)
    return {
      ...rest,
      input: part.input ?? part.args,
      ...(metadata !== undefined ? { providerOptions: metadata } : {}),
    }
  }
  if (part.type === 'tool-result') {
    const { result: _result, isError: _isError, content: _content, ...rest } = mapped
    return { ...rest, output: part.output ?? mapToolResultOutput(part) }
  }
  if (part.type === 'image') {
    const { image: _image, mimeType: _mimeType, ...rest } = mapped
    return {
      ...rest,
      type: 'file',
      data: part.image,
      mediaType: part.mimeType ?? 'image/jpeg',
    }
  }
  if (part.type === 'file' && part.mimeType !== undefined) {
    const { mimeType: _mimeType, ...rest } = mapped
    return { ...rest, mediaType: part.mimeType }
  }
  return mapped
}

function mapPrompt(prompt: unknown, toolProviderMetadata?: Map<string, Record<string, any>>): unknown {
  if (!Array.isArray(prompt)) return prompt
  return prompt.map((message) => {
    if (!message || typeof message !== 'object') return message
    const mapped = mapProviderOptions(message as Record<string, any>)
    return Array.isArray(mapped.content)
      ? { ...mapped, content: mapped.content.map((part: Record<string, any>) => mapPromptPart(part, toolProviderMetadata)) }
      : mapped
  })
}

function toV3CallOptions(
  options: Record<string, any>,
  toolProviderMetadata?: Map<string, Record<string, any>>,
): Record<string, any> {
  const { inputFormat: _inputFormat, mode, maxTokens, providerMetadata, prompt, ...rest } = options
  const mapped: Record<string, any> = {
    ...rest,
    prompt: mapPrompt(prompt, toolProviderMetadata),
    ...(maxTokens !== undefined ? { maxOutputTokens: maxTokens } : {}),
    ...(providerMetadata !== undefined ? { providerOptions: providerMetadata } : {}),
  }

  if (mode?.type === 'regular') {
    if (mode.tools) mapped.tools = mode.tools.map(mapTool)
    if (mode.toolChoice) mapped.toolChoice = mode.toolChoice
  } else if (mode?.type === 'object-json') {
    mapped.responseFormat = {
      type: 'json',
      schema: mode.schema,
      name: mode.name,
      description: mode.description,
    }
  } else if (mode?.type === 'object-tool') {
    mapped.tools = [mapTool(mode.tool)]
    mapped.toolChoice = { type: 'tool', toolName: mode.tool.name }
  }

  return mapped
}

const LEGACY_JANUSX_TOOL_NAMES: Record<string, string> = {
  'janusx_workspace_tools:list_dir': 'workspace_list',
  'janusx_workspace_tools:read_file': 'workspace_read',
  'janusx_workspace_tools:edit_file': 'workspace_edit',
  'janusx_workspace_tools:detect_project': 'project_detect',
  'janusx_workspace_tools:generate_config': 'project_generate_config'
}

function normalizeToolName(name: unknown): unknown {
  return typeof name === 'string' ? LEGACY_JANUSX_TOOL_NAMES[name] ?? name : name
}

const IGNORED_CHUNK_TYPES = new Set([
  'stream-start',
  'text-start',
  'text-end',
  'reasoning-start',
  'reasoning-delta',
  'reasoning-end',
  'tool-input-start',
  'tool-input-end',
  'tool-result',
  'tool-approval-request',
  'file',
  'source',
  'raw'
])

function normalizeFinishReason(reason: unknown): string {
  if (typeof reason === 'string') return reason
  if (reason && typeof reason === 'object' && typeof (reason as any).unified === 'string') {
    return (reason as any).unified
  }
  return 'unknown'
}

function tokenTotal(value: unknown): number {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof (value as any).total === 'number') {
    return (value as any).total
  }
  return 0
}

function normalizeUsage(usage: any): { promptTokens: number; completionTokens: number } {
  return {
    promptTokens: tokenTotal(usage?.promptTokens ?? usage?.inputTokens),
    completionTokens: tokenTotal(usage?.completionTokens ?? usage?.outputTokens)
  }
}

function normalizeGenerateResult(result: Record<string, any>): Record<string, any> {
  if (!Array.isArray(result.content)) return result

  const text = result.content
    .filter((part: Record<string, any>) => part.type === 'text' && typeof part.text === 'string')
    .map((part: Record<string, any>) => part.text)
    .join('')
  const toolCalls = result.content
    .filter((part: Record<string, any>) => part.type === 'tool-call')
    .map((part: Record<string, any>) => ({
      toolCallType: 'function',
      toolCallId: part.toolCallId,
      toolName: normalizeToolName(part.toolName),
      args: typeof part.input === 'string' ? part.input : JSON.stringify(part.input ?? {}),
      ...(part.providerMetadata !== undefined
        ? { experimental_providerMetadata: part.providerMetadata }
        : {}),
    }))

  return {
    ...result,
    text: text || result.text,
    toolCalls: toolCalls.length ? toolCalls : result.toolCalls,
    finishReason: normalizeFinishReason(result.finishReason),
    usage: normalizeUsage(result.usage),
  }
}

function normalizeStreamChunk(
  chunk: StreamChunk,
  toolProviderMetadata?: Map<string, Record<string, any>>,
): StreamChunk | null {
  switch (chunk.type) {
    case 'text-delta': {
      return {
        type: 'text-delta',
        textDelta: chunk.textDelta ?? chunk.delta ?? ''
      }
    }
    case 'tool-call': {
      if (chunk.providerMetadata !== undefined && typeof chunk.toolCallId === 'string') {
        toolProviderMetadata?.set(chunk.toolCallId, chunk.providerMetadata)
        if (toolProviderMetadata && toolProviderMetadata.size > 256) {
          toolProviderMetadata.delete(toolProviderMetadata.keys().next().value!)
        }
      }
      return {
        type: 'tool-call',
        toolCallType: 'function',
        toolCallId: chunk.toolCallId,
        toolName: normalizeToolName(chunk.toolName),
        args: chunk.args ?? chunk.input ?? '{}',
        ...(chunk.providerMetadata !== undefined
          ? { experimental_providerMetadata: chunk.providerMetadata }
          : {}),
      }
    }
    case 'tool-call-delta':
    case 'tool-input-delta': {
      return {
        type: 'tool-call-delta',
        toolCallType: 'function',
        toolCallId: chunk.toolCallId ?? chunk.id,
        toolName: normalizeToolName(chunk.toolName),
        argsTextDelta: chunk.argsTextDelta ?? chunk.delta ?? ''
      }
    }
    case 'response-metadata': {
      return {
        type: 'response-metadata',
        id: chunk.id,
        timestamp: chunk.timestamp,
        modelId: chunk.modelId
      }
    }
    case 'finish': {
      return {
        type: 'finish',
        finishReason: normalizeFinishReason(chunk.finishReason),
        usage: normalizeUsage(chunk.usage),
        providerMetadata: chunk.providerMetadata,
        logprobs: chunk.logprobs
      }
    }
    case 'error':
      return chunk
    default:
      return IGNORED_CHUNK_TYPES.has(chunk.type) ? null : chunk
  }
}

export function withAiSdkV1StreamCompatibility(model: LanguageModelV1): LanguageModelV1 {
  const source = model as any
  if (source.__janusxAiSdkV1StreamCompat) return model
  const toolProviderMetadata = new Map<string, Record<string, any>>()
  const callOptions = (options: Record<string, any>) =>
    source.specificationVersion === 'v3' ? toV3CallOptions(options, toolProviderMetadata) : options

  const wrapped = {
    specificationVersion: 'v1',
    provider: source.provider,
    modelId: source.modelId,
    defaultObjectGenerationMode: source.defaultObjectGenerationMode,
    supportsImageUrls: source.supportsImageUrls,
    supportsStructuredOutputs: source.supportsStructuredOutputs,
    supportedUrls: source.supportedUrls,
    supportsUrl: source.supportsUrl?.bind(source),
    async doGenerate(options: any) {
      const result = await source.doGenerate(callOptions(options))
      return source.specificationVersion === 'v3' ? normalizeGenerateResult(result) : result
    },
    async doStream(options: any) {
      const result = await source.doStream(callOptions(options))
      return {
        ...result,
        stream: result.stream.pipeThrough(
          new TransformStream<StreamChunk, StreamChunk>({
            transform(chunk, controller) {
              const normalized = normalizeStreamChunk(chunk, toolProviderMetadata)
              if (normalized) {
                controller.enqueue(normalized)
              }
            }
          })
        )
      }
    },
    __janusxAiSdkV1StreamCompat: true
  }

  return wrapped as any
}
