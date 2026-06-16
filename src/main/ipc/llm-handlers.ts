/**
 * @file LLM IPC Handlers
 * @description IPC 通信处理器，暴露 LLM 服务给渲染进程
 */

import { ipcMain } from 'electron'
import { llmService } from '../llm/LlmService'
import type { ProviderSettings } from '@janusx/llm-core'

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
      console.log('[IPC] llm:test-connection received:', {
        providerId: payload.id,
        testModel: payload.testModel,
        modelId: payload.modelId,
        testModelId: payload.testModelId
      })
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

  console.log('[IPC] LLM handlers registered')
}
