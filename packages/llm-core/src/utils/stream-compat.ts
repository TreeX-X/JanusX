import type { LanguageModelV1 } from '../core/types'

type StreamChunk = Record<string, any>

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
        toolName: chunk.toolName,
        args: chunk.args ?? chunk.input ?? '{}'
      }
    }
    case 'tool-call-delta':
    case 'tool-input-delta': {
      return {
        type: 'tool-call-delta',
        toolCallType: 'function',
        toolCallId: chunk.toolCallId ?? chunk.id,
        toolName: chunk.toolName,
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

  const wrapped = {
    specificationVersion: 'v1',
    provider: source.provider,
    modelId: source.modelId,
    defaultObjectGenerationMode: source.defaultObjectGenerationMode,
    supportsImageUrls: source.supportsImageUrls,
    supportsStructuredOutputs: source.supportsStructuredOutputs,
    supportedUrls: source.supportedUrls,
    supportsUrl: source.supportsUrl?.bind(source),
    doGenerate: source.doGenerate.bind(source),
    async doStream(options: any) {
      const result = await source.doStream(options)
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
