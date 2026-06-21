/**
 * @file LLM IPC Handlers
 * @description IPC 通信处理器，暴露 LLM 服务给渲染进程
 */

import { ipcMain } from 'electron'
import { llmService } from '../llm/LlmService'
import type { ProviderSettings } from '@janusx/llm-core'

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
}

/**
 * 注册 LLM 相关的 IPC handlers
 */
export function registerLlmHandlers(): void {
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
      const { messages, providerId, modelId } = request

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

      // Vertex AI 使用直接调用方式
      if (settings.authType === 'vertex-ai') {
        return await llmService.callVertexAI(settings, formattedMessages, actualModelId)
      }

      // 其他 provider 使用 AI SDK
      const model = await llmService.getLanguageModel(providerId, actualModelId)
      const { generateText } = await llmService.getAiModule()

      const result = await generateText({
        model: model as any,
        messages: formattedMessages.map(m => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content
        })),
      })

      return result.text || ''
    } catch (error: any) {
      console.error('[IPC] llm:chat error:', error.message)
      throw error
    }
  })

}
