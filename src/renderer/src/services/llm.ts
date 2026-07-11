/**
 * @file 渲染进程 LLM 服务
 * @description 通过 IPC 调用主进程 LLM 功能
 */

import type {
  ProviderSettings,
  ModelInfo,
  ModelCatalogRefreshResult,
  ModelCatalogSnapshot,
} from '@janusx/llm-core'

/* ════════════════════════════════════════════════════════════
   IPC 调用封装
   ════════════════════════════════════════════════════════════ */

/** 获取所有 Provider 配置 */
export async function getProviders(): Promise<ProviderSettings[]> {
  return window.electron.invoke('llm:get-providers') as Promise<ProviderSettings[]>
}

/** 保存 Provider 配置 */
export async function saveProvider(settings: ProviderSettings): Promise<{ success: boolean; error?: string }> {
  return window.electron.invoke('llm:save-provider', settings) as Promise<{ success: boolean; error?: string }>
}

/** 测试连接 */
export async function testConnection(settings: ProviderSettings & { testModel?: string }): Promise<{ success: boolean; latency?: number; error?: string }> {
  return window.electron.invoke('llm:test-connection', settings) as Promise<{ success: boolean; latency?: number; error?: string }>
}

/** 删除 Provider */
export async function removeProvider(providerId: string): Promise<{ success: boolean; error?: string }> {
  return window.electron.invoke('llm:remove-provider', providerId) as Promise<{ success: boolean; error?: string }>
}

/** 设置默认 Provider */
export async function setDefaultProvider(providerId: string): Promise<{ success: boolean }> {
  return window.electron.invoke('llm:set-default-provider', providerId) as Promise<{ success: boolean }>
}

/** 获取可用模型列表 */
export async function listModels(providerId: string): Promise<ModelInfo[]> {
  return window.electron.invoke('llm:list-models', providerId) as Promise<ModelInfo[]>
}

export async function getModelCatalog(): Promise<ModelCatalogSnapshot> {
  return window.electron.invoke('llm:model-catalog:get') as Promise<ModelCatalogSnapshot>
}

export async function refreshModelCatalog(): Promise<ModelCatalogRefreshResult> {
  return window.electron.invoke('llm:model-catalog:refresh') as Promise<ModelCatalogRefreshResult>
}

/** 获取可用适配器类型 */
export async function getAdapters(): Promise<Array<{ id: string; name: string; authType: string }>> {
  return window.electron.invoke('llm:get-adapters') as Promise<Array<{ id: string; name: string; authType: string }>>
}

/** 获取默认 Provider */
export async function getDefaultProvider(): Promise<{ provider: ProviderSettings; modelId: string } | null> {
  return window.electron.invoke('llm:get-default-provider') as Promise<{ provider: ProviderSettings; modelId: string } | null>
}

/* ════════════════════════════════════════════════════════════
   对话 API
   ════════════════════════════════════════════════════════════ */

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/** 发送对话请求（非流式） */
export async function chat(
  messages: ChatMessage[],
  providerId?: string,
  modelId?: string,
  options?: { sourceTag?: 'janus-chat'; workspaceId?: string; workspacePath?: string }
): Promise<string> {
  const targetProvider = providerId || (await getDefaultProvider())?.provider.id
  if (!targetProvider) throw new Error('未配置 LLM Provider')

  return window.electron.invoke('llm:chat', {
    messages,
    providerId: targetProvider,
    modelId,
    sourceTag: options?.sourceTag,
    workspaceId: options?.workspaceId,
    workspacePath: options?.workspacePath,
  }) as Promise<string>
}

/* ════════════════════════════════════════════════════════════
   流式对话 API
   ════════════════════════════════════════════════════════════ */

interface ChatStreamEvent {
  requestId: string
  delta?: string
  done?: boolean
  error?: string
}

let requestSeq = 0

/**
 * 流式对话
 * @param messages 完整消息列表（含 system / user / assistant）
 * @param onDelta 收到增量内容时回调
 * @param onDone 流结束时回调
 * @param onError 发生错误时回调
 * @returns abort 取消函数
 */
export function chatStream(
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  options?: {
    providerId?: string
    modelId?: string
    sourceTag?: 'janus-chat'
    workspaceId?: string
    workspacePath?: string
  }
): { abort: () => void } {
  const requestId = `llm-chat-${Date.now()}-${++requestSeq}`
  let cleaned = false
  let doneCalled = false

  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    unsubDelta()
    unsubDone()
    unsubError()
  }

  const filterByRequest = (payload: unknown): ChatStreamEvent | null => {
    const p = payload as ChatStreamEvent | undefined
    return p?.requestId === requestId ? p : null
  }

  const unsubDelta = window.electron.on('llm:chat:delta', (payload: unknown) => {
    const p = filterByRequest(payload)
    if (!p || p.done) return
    onDelta(p.delta ?? '')
  })

  const unsubDone = window.electron.on('llm:chat:done', (payload: unknown) => {
    const p = filterByRequest(payload)
    if (!p || doneCalled) return
    doneCalled = true
    cleanup()
    onDone()
  })

  const unsubError = window.electron.on('llm:chat:error', (payload: unknown) => {
    const p = filterByRequest(payload)
    if (!p) return
    console.error('[chatStream] error accepted:', p.error)
    cleanup()
    onError(p.error ?? '未知错误')
  })

  const targetProvider = options?.providerId
    ? Promise.resolve({ providerId: options.providerId, modelId: options.modelId })
    : getDefaultProvider().then((def) =>
        def ? { providerId: def.provider.id, modelId: def.modelId } : null
      )

  targetProvider
    .then((def) => {
      if (cleaned) return
      if (!def?.providerId) {
        cleanup()
        onError('未配置默认 LLM Provider')
        return
      }
      window.electron.send('llm:chat-stream', {
        requestId,
        messages,
        providerId: def.providerId,
        modelId: def.modelId,
        sourceTag: options?.sourceTag,
        workspaceId: options?.workspaceId,
        workspacePath: options?.workspacePath,
      })
    })
    .catch((err: unknown) => {
      if (cleaned) return
      cleanup()
      onError(err instanceof Error ? err.message : '获取默认 Provider 失败')
    })

  return {
    abort: () => {
      cleanup()
      window.electron.invoke('llm:chat:abort', requestId).catch(() => {})
    }
  }
}
