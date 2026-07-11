/**
 * @file LLM IPC Handlers
 * @description IPC 通信处理器，暴露 LLM 服务给渲染进程
 */

import { ipcMain } from 'electron'
import { llmService } from '../llm/LlmService'
import type { ProviderSettings } from '@janusx/llm-core'
import { knowledgeObservationService } from '../knowledge/observation-service'
import { getModelCatalogService } from '../llm/ModelCatalogService'

/** 对话消息类型 */
interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/** 对话请求参数 */
interface ChatRequest {
  messages: ChatMessage[]
  providerId: string
  modelId?: string
  sourceTag?: 'janus-chat'
  workspaceId?: string
  workspacePath?: string
}

/** 流式对话请求参数 */
interface ChatStreamRequest {
  requestId: string
  messages: ChatMessage[]
  providerId: string
  modelId?: string
  sourceTag?: 'janus-chat'
  workspaceId?: string
  workspacePath?: string
}

/** Active streaming chat abort controllers (module-scoped for shutdown). */
const abortControllers = new Map<string, AbortController>()

/** Abort every in-flight LLM chat stream. Safe to call repeatedly. */
export function abortAllChatStreams(): void {
  for (const controller of abortControllers.values()) {
    try {
      controller.abort()
    } catch {
      // ignore
    }
  }
  abortControllers.clear()
}

/**
 * 注册 LLM 相关的 IPC handlers
 */
export function registerLlmHandlers(): void {
  ipcMain.handle('llm:model-catalog:get', () => getModelCatalogService().getCatalog())
  ipcMain.handle('llm:model-catalog:refresh', () => getModelCatalogService().refresh())

  // 获取所有 Provider 配置
  ipcMain.handle('llm:get-providers', async () => {
    try {
      return await llmService.getAllProviders()
    } catch (error: any) {
      console.error('[IPC] llm:get-providers error:', error)
      throw error
    }
  })

  // 保存 Provider 配置
  ipcMain.handle('llm:save-provider', async (_, settings: ProviderSettings) => {
    try {
      return await llmService.saveProvider(settings)
    } catch (error: any) {
      console.error('[IPC] llm:save-provider error:', error)
      return { success: false, error: error.message }
    }
  })

  // 测试连接
  ipcMain.handle('llm:test-connection', async (_, payload: ProviderSettings & { testModel?: string }) => {
    try {
      return await llmService.testConnection(payload, payload.testModel)
    } catch (error: any) {
      console.error('[IPC] llm:test-connection error:', error)
      return { success: false, error: error.message }
    }
  })

  // 删除 Provider
  ipcMain.handle('llm:remove-provider', async (_, providerId: string) => {
    try {
      await llmService.removeProvider(providerId)
      return { success: true }
    } catch (error: any) {
      console.error('[IPC] llm:remove-provider error:', error)
      return { success: false, error: error.message }
    }
  })

  // 设置默认 Provider
  ipcMain.handle('llm:set-default-provider', async (_, providerId: string) => {
    try {
      await llmService.setDefaultProvider(providerId)
      return { success: true }
    } catch (error: any) {
      console.error('[IPC] llm:set-default-provider error:', error)
      return { success: false, error: error.message }
    }
  })

  // 获取可用模型列表
  ipcMain.handle('llm:list-models', async (_, providerId: string) => {
    try {
      return await llmService.listModels(providerId)
    } catch (error: any) {
      console.error('[IPC] llm:list-models error:', error)
      throw error
    }
  })

  // 获取可用适配器类型
  ipcMain.handle('llm:get-adapters', async () => {
    try {
      return llmService.getAvailableAdapters()
    } catch (error: any) {
      console.error('[IPC] llm:get-adapters error:', error)
      throw error
    }
  })

  // 获取默认 Provider
  ipcMain.handle('llm:get-default-provider', async () => {
    try {
      return await llmService.getDefaultModel()
    } catch (error: any) {
      console.error('[IPC] llm:get-default-provider error:', error)
      return null
    }
  })

  // 对话请求（非流式）
  ipcMain.handle('llm:chat', async (_, request: ChatRequest) => {
    try {
      const { messages, providerId, modelId, sourceTag, workspaceId, workspacePath } = request

      const settings = await llmService.getProviderSettings(providerId)
      if (!settings) {
        throw new Error(`Provider "${providerId}" 未配置`)
      }

      const actualModelId = modelId || settings.modelId || 'gemini-2.5-flash'

      // 过滤掉空内容的消息
      const formattedMessages = messages
        .filter(m => m.content && m.content.trim().length > 0)
        .map(m => ({
          role: m.role,
          content: m.content
        }))

      // 使用 AI SDK
      const model = await llmService.getLanguageModel(providerId, actualModelId)
      const { generateText } = await llmService.getAiModule()

      const result = await generateText({
        model: model as any,
        messages: formattedMessages.map(m => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content
        })),
      })

      if (sourceTag === 'janus-chat' && workspacePath) {
        const userMessage = [...formattedMessages].reverse().find((message) => message.role === 'user')
        if (userMessage) {
          await knowledgeObservationService.capture({
            workspaceId,
            workspacePath,
            source: 'janus-chat',
            type: 'conversation-turn',
            content: userMessage.content,
            summary: 'Janus Chat user message',
            tags: ['janus-chat', 'user'],
            actor: 'user',
          })
        }
        await knowledgeObservationService.capture({
          workspaceId,
          workspacePath,
          source: 'janus-chat',
          type: 'conversation-turn',
          content: result.text || '',
          summary: 'Janus Chat assistant response',
          tags: ['janus-chat', 'assistant'],
          actor: 'assistant',
          metadata: {
            providerId,
            modelId: actualModelId,
          },
        })
      }

      return result.text || ''
    } catch (error: any) {
      console.error('[IPC] llm:chat error:', error.message)
      throw error
    }
  })

  // 流式对话请求（单向 send/on 模式，确保事件可靠送达渲染端）
  ipcMain.on('llm:chat-stream', async (event, request: ChatStreamRequest) => {
    const { requestId, messages, providerId, modelId, sourceTag, workspaceId, workspacePath } = request
    const controller = new AbortController()
    let streamedText = ''
    abortControllers.set(requestId, controller)

    const sendEvent = (channel: 'llm:chat:delta' | 'llm:chat:done' | 'llm:chat:error', payload: any) => {
      event.reply(channel, payload)
    }

    const sendError = (message: string) => {
      sendEvent('llm:chat:error', { requestId, error: message })
    }

    try {
      const settings = await llmService.getProviderSettings(providerId)
      if (!settings) {
        throw new Error(`Provider "${providerId}" 未配置`)
      }

      const actualModelId = modelId || settings.modelId || 'gemini-2.5-flash'

      // 过滤掉空内容的消息
      const formattedMessages = messages
        .filter(m => m.content && m.content.trim().length > 0)
        .map(m => ({
          role: m.role,
          content: m.content
        }))

      const model = await llmService.getLanguageModel(providerId, actualModelId)
      const { streamText } = await llmService.getAiModule()

      const result = await streamText({
        model: model as any,
        messages: formattedMessages.map(m => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content
        })),
        abortSignal: controller.signal,
      })

      for await (const delta of result.textStream) {
        if (controller.signal.aborted) break
        sendEvent('llm:chat:delta', { requestId, delta, done: false })
        streamedText += delta
      }

      if (sourceTag === 'janus-chat' && workspacePath) {
        const userMessage = [...formattedMessages].reverse().find((message) => message.role === 'user')
        if (userMessage) {
          await knowledgeObservationService.capture({
            workspaceId,
            workspacePath,
            source: 'janus-chat',
            type: 'conversation-turn',
            content: userMessage.content,
            summary: 'Janus Chat user message',
            tags: ['janus-chat', 'user'],
            actor: 'user',
            correlationId: requestId,
          })
        }
        await knowledgeObservationService.capture({
          workspaceId,
          workspacePath,
          source: 'janus-chat',
          type: 'conversation-turn',
          content: streamedText,
          summary: 'Janus Chat assistant response',
          tags: ['janus-chat', 'assistant'],
          actor: 'assistant',
          correlationId: requestId,
          metadata: {
            providerId,
            modelId: actualModelId,
          },
        })
      }

      sendEvent('llm:chat:delta', { requestId, delta: '', done: true })
      sendEvent('llm:chat:done', { requestId })
    } catch (error: any) {
      // 用户主动取消时不作为错误上报
      if (controller.signal.aborted || error?.name === 'AbortError') {
        sendEvent('llm:chat:done', { requestId })
        return
      }
      console.error('[IPC] llm:chat-stream error:', error.message || error)
      sendError(error.message || String(error))
    } finally {
      abortControllers.delete(requestId)
    }
  })

  // 中止流式请求
  ipcMain.handle('llm:chat:abort', async (_, requestId: string) => {
    abortControllers.get(requestId)?.abort()
    return { success: true }
  })

}
