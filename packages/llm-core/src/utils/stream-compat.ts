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
  const { providerMetadata, ...rest } = value
  return {
    ...rest,
    ...(providerMetadata !== undefined ? { providerOptions: providerMetadata } : {}),
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

function mapPromptPart(part: Record<string, any>): Record<string, any> {
  const mapped = mapProviderOptions(part)
  if (part.type === 'tool-call') {
    const { args: _args, ...rest } = mapped
    return { ...rest, input: part.input ?? part.args }
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

function mapPrompt(prompt: unknown): unknown {
  if (!Array.isArray(prompt)) return prompt
  return prompt.map((message) => {
    if (!message || typeof message !== 'object') return message
    const mapped = mapProviderOptions(message as Record<string, any>)
    return Array.isArray(mapped.content)
      ? { ...mapped, content: mapped.content.map(mapPromptPart) }
      : mapped
  })
}

function toV3CallOptions(options: Record<string, any>): Record<string, any> {
  const { inputFormat: _inputFormat, mode, maxTokens, providerMetadata, prompt, ...rest } = options
  const mapped: Record<string, any> = {
    ...rest,
    prompt: mapPrompt(prompt),
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

function normalizeUsage(usage: any): { promptTokens: number; completionTokens: number } {
  return {
    promptTokens: usage?.promptTokens ?? usage?.inputTokens ?? 0,
    completionTokens: usage?.completionTokens ?? usage?.outputTokens ?? 0
  }
}

function normalizeStreamChunk(chunk: StreamChunk): StreamChunk | null {
  switch (chunk.type) {
    case 'text-delta': {
      return {
        type: 'text-delta',
        textDelta: chunk.textDelta ?? chunk.delta ?? ''
      }
    }
    case 'tool-call': {
      return {
        type: 'tool-call',
        toolCallType: 'function',
        toolCallId: chunk.toolCallId,
        toolName: normalizeToolName(chunk.toolName),
        args: chunk.args ?? chunk.input ?? '{}'
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
  const callOptions = (options: Record<string, any>) =>
    source.specificationVersion === 'v3' ? toV3CallOptions(options) : options

  const wrapped = {
    specificationVersion: 'v1',
    provider: source.provider,
    modelId: source.modelId,
    defaultObjectGenerationMode: source.defaultObjectGenerationMode,
    supportsImageUrls: source.supportsImageUrls,
    supportsStructuredOutputs: source.supportsStructuredOutputs,
    supportedUrls: source.supportedUrls,
    supportsUrl: source.supportsUrl?.bind(source),
    doGenerate(options: any) {
      return source.doGenerate(callOptions(options))
    },
    async doStream(options: any) {
      const result = await source.doStream(callOptions(options))
      return {
        ...result,
        stream: result.stream.pipeThrough(
          new TransformStream<StreamChunk, StreamChunk>({
            transform(chunk, controller) {
              const normalized = normalizeStreamChunk(chunk)
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
