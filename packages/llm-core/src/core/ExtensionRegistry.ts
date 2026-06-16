/**
 * @file Provider 扩展注册表
 * @description 管理所有 Provider 的注册、查询与生命周期
 * @module @janusx/llm-core/registry
 */

import type { ProviderExtension } from './types'
import { ProviderNotFoundError, ProviderAlreadyExistsError } from '../utils/errors'

/* ════════════════════════════════════════════════════════════
   注册表实现（单例模式）
   ════════════════════════════════════════════════════════════ */

/**
 * Provider 扩展注册表
 *
 * @description
 * 职责：
 * 1. Provider 注册与注销
 * 2. Provider 查询与遍历
 * 3. 防止重复注册
 * 4. 线程安全（单例）
 */
export class ExtensionRegistry {
  private readonly providers = new Map<string, ProviderExtension>()
  private static instance: ExtensionRegistry | null = null

  /**
   * 获取全局单例实例
   */
  static getInstance(): ExtensionRegistry {
    if (!ExtensionRegistry.instance) {
      ExtensionRegistry.instance = new ExtensionRegistry()
    }
    return ExtensionRegistry.instance
  }

  /**
   * 私有构造函数（单例模式）
   */
  private constructor() {}

  /**
   * 注册 Provider
   * @param provider Provider 扩展实例
   * @throws {ProviderAlreadyExistsError} 当 Provider ID 已存在时
   */
  register(provider: ProviderExtension): void {
    if (this.providers.has(provider.id)) {
      throw new ProviderAlreadyExistsError(provider.id)
    }

    this.providers.set(provider.id, provider)
  }

  /**
   * 注销 Provider
   * @param providerId Provider 唯一标识
   * @returns 是否成功注销
   */
  unregister(providerId: string): boolean {
    return this.providers.delete(providerId)
  }

  /**
   * 获取指定 Provider
   * @param providerId Provider 唯一标识
   * @throws {ProviderNotFoundError} 当 Provider 不存在时
   */
  get(providerId: string): ProviderExtension {
    const provider = this.providers.get(providerId)
    if (!provider) {
      throw new ProviderNotFoundError(providerId)
    }
    return provider
  }

  /**
   * 安全获取 Provider（不抛出异常）
   * @param providerId Provider 唯一标识
   * @returns Provider 实例或 undefined
   */
  tryGet(providerId: string): ProviderExtension | undefined {
    return this.providers.get(providerId)
  }

  /**
   * 检查 Provider 是否已注册
   * @param providerId Provider 唯一标识
   */
  has(providerId: string): boolean {
    return this.providers.has(providerId)
  }

  /**
   * 获取所有已注册 Provider
   * @returns Provider 数组
   */
  getAll(): ProviderExtension[] {
    return Array.from(this.providers.values())
  }

  /**
   * 获取所有 Provider ID
   */
  getAllIds(): string[] {
    return Array.from(this.providers.keys())
  }

  /**
   * 按认证类型筛选 Provider
   * @param authType 认证类型
   */
  filterByAuthType(authType: string): ProviderExtension[] {
    return this.getAll().filter(p => p.authType === authType)
  }

  /**
   * 按能力筛选 Provider
   * @param capability 能力名称（如 'chat', 'embedding'）
   */
  filterByCapability(capability: keyof ProviderExtension['capabilities']): ProviderExtension[] {
    return this.getAll().filter(p => p.capabilities[capability])
  }

  /**
   * 清空所有注册（测试用）
   */
  clear(): void {
    this.providers.clear()
  }

  /**
   * 获取注册数量
   */
  get size(): number {
    return this.providers.size
  }
}
