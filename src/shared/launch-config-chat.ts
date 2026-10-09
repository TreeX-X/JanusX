// Note: 蓝图端口拦截样板（note.focus 同款）——工具面/事件桥/ops 引擎 — see .agents/notes/agent/run-config-assistant-edit-tools.md
import type { LaunchConfig, LaunchConfiguration, ValidationResult } from './ipc/project'

/** 一次配置草稿变更（照 note_change 事件桥）：编辑或落盘后回渲染端表单。 */
export interface LaunchConfigChange {
  id: string
  /** 应用后的完整草稿（真实值；脱敏只发生在进模型上下文的边界）。 */
  config: LaunchConfig
  /** 人读摘要：本次改了什么。 */
  summary: string
  validation: ValidationResult
  /** true = launch-config.apply 已写盘（含审批通过），表单应结算基线。 */
  applied?: boolean
}

export type LaunchConfigOp =
  | { op: 'setField'; path: string; value: unknown }
  | { op: 'addConfiguration'; configuration: LaunchConfiguration }
  | { op: 'updateConfiguration'; name: string; configuration: LaunchConfiguration }
  | { op: 'removeConfiguration'; name: string }
  | { op: 'setEnv'; name: string; env: Record<string, string> }

/** env 值进模型上下文的统一脱敏规则（提示词、launch-config.get 回执同用）。 */
export function redactConfig(config: LaunchConfig): LaunchConfig {
  return {
    ...config,
    configurations: config.configurations.map((item) => ({
      ...item,
      env: item.env ? Object.fromEntries(Object.keys(item.env).map((key) => [key, '[REDACTED]'])) : undefined,
    })),
  }
}

function setFieldByPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.').flatMap((part) => {
    const match = /^([^[\]]*)((?:\[\d+\])*)$/.exec(part)
    if (!match) throw new Error(`Invalid field path segment: ${part}`)
    const keys: string[] = []
    if (match[1]) keys.push(match[1])
    for (const index of match[2].matchAll(/\[(\d+)\]/g)) keys.push(index[1])
    return keys
  })
  if (!segments.length) throw new Error('Field path must not be empty')
  if (segments.some((key) => ['__proto__', 'prototype', 'constructor'].includes(key))) {
    throw new Error('Unsafe field path')
  }
  let cursor: Record<string, unknown> = target
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index]
    const next = cursor[key]
    if (!Object.hasOwn(cursor, key) || next === undefined || next === null || typeof next !== 'object') {
      throw new Error(`Field path not found: ${segments.slice(0, index + 1).join('.')}`)
    }
    cursor = next as Record<string, unknown>
  }
  cursor[segments[segments.length - 1]] = value
}

function locateConfiguration(config: LaunchConfig, name: string): LaunchConfiguration {
  const hit = config.configurations.find((item) => item.name === name)
  if (!hit) throw new Error(`Configuration not found: ${name}`)
  return hit
}

/**
 * 把 ops 词汇应用到草稿副本上（纯函数；校验与脱敏在工具层做）。
 * 五种 ops 固定：setField / addConfiguration / updateConfiguration / removeConfiguration / setEnv。
 */
export function applyLaunchConfigOps(draft: LaunchConfig, ops: LaunchConfigOp[]): { config: LaunchConfig; summary: string } {
  const config = structuredClone(draft)
  const parts: string[] = []
  for (const op of ops) {
    if (op.op === 'setField') {
      setFieldByPath(config as unknown as Record<string, unknown>, op.path, op.value)
      parts.push(`set ${op.path}`)
    } else if (op.op === 'addConfiguration') {
      if (config.configurations.some((item) => item.name === op.configuration.name)) {
        throw new Error(`Configuration already exists: ${op.configuration.name}`)
      }
      config.configurations.push(structuredClone(op.configuration))
      parts.push(`add configuration ${op.configuration.name}`)
    } else if (op.op === 'updateConfiguration') {
      const target = locateConfiguration(config, op.name)
      const index = config.configurations.indexOf(target)
      config.configurations[index] = { ...structuredClone(op.configuration), name: op.name }
      parts.push(`update configuration ${op.name}`)
    } else if (op.op === 'removeConfiguration') {
      locateConfiguration(config, op.name)
      config.configurations = config.configurations.filter((item) => item.name !== op.name)
      parts.push(`remove configuration ${op.name}`)
    } else if (op.op === 'setEnv') {
      const target = locateConfiguration(config, op.name)
      target.env = { ...(target.env ?? {}), ...op.env }
      parts.push(`set env on ${op.name}: ${Object.keys(op.env).join(', ')}`)
    }
  }
  return { config, summary: parts.join('; ') || 'no-op' }
}
