# @janusx/llm-core

JanusX LLM 核心抽象层 - 统一 Provider 管理

## 📦 简介

`@janusx/llm-core` 是 JanusX 系统的 LLM 核心抽象层，提供：

- 🔌 **统一 Provider 接口**：OpenAI Compatible、Vertex AI 等多种认证方式
- 🏗️ **模块化架构**：核心抽象、适配器、配置分离
- ✅ **类型安全**：完整的 TypeScript 类型定义
- 🧪 **测试覆盖**：单元测试保证核心功能稳定
- 🔥 **热更新支持**：配置文件驱动，无需重编译

## 🎯 设计原则

### 三层架构

```
┌─────────────────────────────────────────┐
│  应用层 (Main/Renderer)                 │
│  - LlmService                           │
│  - UI Components                        │
├─────────────────────────────────────────┤
│  核心抽象层 (@janusx/llm-core)          │
│  - ProviderExtension 接口               │
│  - ExtensionRegistry 注册表             │
│  - ProviderFactory 工厂                 │
├─────────────────────────────────────────┤
│  适配器层 (未来实现)                     │
│  - OpenAICompatibleAdapter              │
│  - VertexAIAdapter                      │
└─────────────────────────────────────────┘
```

### 核心模式

- **依赖注入**：通过 Registry 管理 Provider 生命周期
- **工厂模式**：统一模型创建入口
- **单例模式**：全局共享 Registry 和 Factory
- **策略模式**：支持多种认证策略（未来扩展）

## 📚 使用示例

### 1. 基础使用

```typescript
import { ProviderFactory, AuthType } from '@janusx/llm-core'
import type { ProviderSettings } from '@janusx/llm-core'

// 获取工厂实例
const factory = ProviderFactory.getInstance()

// 定义 Provider 配置
const settings: ProviderSettings = {
  id: 'openai-compatible',
  name: 'OpenAI',
  authType: AuthType.API_KEY,
  baseURL: 'https://api.openai.com/v1',
  apiKey: 'sk-your-api-key'
}

// 创建语言模型
const model = await factory.createLanguageModel(settings, 'gpt-4')

// 使用模型（配合 AI SDK）
import { generateText } from 'ai'

const result = await generateText({
  model,
  prompt: 'Hello, world!'
})
```

### 2. Vertex AI 配置

```typescript
const vertexSettings: ProviderSettings = {
  id: 'vertex-ai',
  name: 'Vertex AI',
  authType: AuthType.VERTEX_AI,
  vertexAI: {
    projectId: 'my-gcp-project',
    region: 'us-central1',
    useADC: true  // 使用 Application Default Credentials
  }
}

const model = await factory.createLanguageModel(vertexSettings, 'gemini-1.5-pro')
```

### 3. 配置验证

```typescript
import { validateSettings } from '@janusx/llm-core'

const validation = validateSettings(settings)

if (!validation.valid) {
  console.error('配置错误：', validation.errors)
}
```

### 4. 查询 Provider 元数据

```typescript
import { getAllProviderMetadata, getProviderMetadata } from '@janusx/llm-core'

// 获取所有 Provider 元数据
const allProviders = getAllProviderMetadata()
console.log(allProviders) // [{ id: 'openai-compatible', ... }, { id: 'vertex-ai', ... }]

// 获取特定 Provider 元数据
const openaiMeta = getProviderMetadata('openai-compatible')
console.log(openaiMeta?.configSchema) // 配置字段定义
```

### 5. 注册自定义 Provider

```typescript
import { ExtensionRegistry } from '@janusx/llm-core'
import type { ProviderExtension } from '@janusx/llm-core'

// 实现 ProviderExtension 接口
class CustomProvider implements ProviderExtension {
  readonly id = 'custom-provider'
  readonly name = 'Custom Provider'
  readonly authType = AuthType.API_KEY
  readonly capabilities = {
    chat: true,
    completion: true,
    embedding: false,
    imageGeneration: false,
    reranking: false,
    transcription: false,
    speech: false
  }

  async createLanguageModel(settings, modelId) {
    // 实现模型创建逻辑
    return myCustomModel
  }

  async listModels() {
    return [/* 模型列表 */]
  }

  async validateSettings(settings) {
    return { valid: true }
  }

  getDefaultModel() {
    return 'default-model'
  }
}

// 注册 Provider
const registry = ExtensionRegistry.getInstance()
registry.register(new CustomProvider())
```

## 📖 API 文档

### 核心类型

#### `ProviderSettings`

```typescript
interface ProviderSettings {
  id: string               // Provider 唯一标识
  name: string             // 显示名称
  authType: AuthType       // 认证类型
  enabled?: boolean        // 是否启用
  
  // 标准 API 配置
  baseURL?: string
  apiKey?: string
  organization?: string
  
  // Vertex AI 配置
  vertexAI?: VertexAIConfig
  
  // 扩展字段
  extra?: Record<string, unknown>
}
```

#### `ProviderExtension`

```typescript
interface ProviderExtension {
  readonly id: string
  readonly name: string
  readonly authType: AuthType
  readonly capabilities: ProviderCapabilities
  
  createLanguageModel(settings: ProviderSettings, modelId: string): Promise<LanguageModelV1>
  createEmbeddingModel?(settings: ProviderSettings, modelId: string): Promise<EmbeddingModelV1>
  listModels(settings: ProviderSettings): Promise<ModelInfo[]>
  validateSettings(settings: ProviderSettings): Promise<ValidationResult>
  getDefaultModel(settings: ProviderSettings): string
  
  // 生命周期钩子（可选）
  initialize?(settings: ProviderSettings): Promise<void>
  dispose?(): Promise<void>
}
```

### 核心类

#### `ExtensionRegistry`

Provider 注册表，管理所有 Provider 的注册与查询。

**主要方法：**

- `register(provider: ProviderExtension): void` - 注册 Provider
- `unregister(providerId: string): boolean` - 注销 Provider
- `get(providerId: string): ProviderExtension` - 获取 Provider（不存在时抛出异常）
- `tryGet(providerId: string): ProviderExtension | undefined` - 安全获取 Provider
- `getAll(): ProviderExtension[]` - 获取所有 Provider
- `filterByAuthType(authType: string): ProviderExtension[]` - 按认证类型筛选
- `filterByCapability(capability: string): ProviderExtension[]` - 按能力筛选

#### `ProviderFactory`

Provider 工厂，统一创建模型实例。

**主要方法：**

- `createLanguageModel(settings, modelId, options?): Promise<LanguageModelV1>` - 创建语言模型
- `createEmbeddingModel(settings, modelId): Promise<EmbeddingModelV1>` - 创建嵌入模型
- `validateSettings(settings): Promise<boolean>` - 验证配置
- `getDefaultModel(providerId, settings): string` - 获取默认模型
- `clearCache(providerId?): void` - 清除模型缓存

#### `ConfigLoader`

配置加载器，管理 `providers.json` 元数据。

**主要方法：**

- `getAllProviderMetadata(): ProviderMetadata[]` - 获取所有元数据
- `getProviderMetadata(providerId): ProviderMetadata | undefined` - 获取指定元数据
- `filterByAuthType(authType): ProviderMetadata[]` - 按类型筛选
- `reloadFromFile(jsonPath): Promise<void>` - 热更新配置

### 工具函数

#### 验证函数

```typescript
// 必填项验证
validateRequired(value: unknown, fieldName: string): { valid: boolean; error?: string }

// URL 验证
validateURL(url: string, fieldName?: string): { valid: boolean; error?: string }

// 字符串长度验证
validateStringLength(value: string, min: number, max: number, fieldName: string)

// Provider 配置验证
validateSettings(settings: ProviderSettings): ValidationResult
```

#### 错误处理

```typescript
// 错误类
class LlmCoreError extends Error
class ProviderNotFoundError extends LlmCoreError
class ProviderAlreadyExistsError extends LlmCoreError
class ValidationError extends LlmCoreError
class ModelCreationError extends LlmCoreError

// 工具函数
wrapError(error: unknown, code: string, context?: Record<string, unknown>): LlmCoreError
isLlmCoreError(error: unknown, code?: string): error is LlmCoreError
```

## 🧪 测试

```bash
# 运行单元测试
npm test

# 类型检查
npm run typecheck

# 构建
npm run build
```

## 🔮 未来扩展

### 阶段 2：适配器实现
- `OpenAICompatibleAdapter` - 标准 API Key 认证
- `VertexAIAdapter` - Google Cloud 认证（ADC / JSON Key）

### 阶段 3：高级特性
- 模型热切换
- 自动重试与降级
- 流式响应封装
- 请求/响应中间件
- 使用统计与监控

## 📄 许可证

MIT © Tree
