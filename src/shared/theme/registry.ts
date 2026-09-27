/**
 * 主题注册表：扩展新主题的唯一入口。
 * 内置 dark + planche；第三方调用 defineTheme() 即可出现在设置下拉（读 listThemeDefinitions）。
 * 未知 id 一律回落默认 dark，保证旧配置与坏数据永不白屏。
 */
import { DEFAULT_APP_THEME } from '../ipc/theme'
import { DARK_THEME_DEFINITION, PLANCHE_THEME_DEFINITION, type ThemeDefinition } from './definition'

const registry = new Map<string, ThemeDefinition>([
  [DARK_THEME_DEFINITION.id, DARK_THEME_DEFINITION],
  [PLANCHE_THEME_DEFINITION.id, PLANCHE_THEME_DEFINITION],
])

export function defineTheme(definition: ThemeDefinition): void {
  registry.set(definition.id, definition)
}

/** 注销自定义主题（测试隔离用；内置主题不要注销）。 */
export function removeTheme(id: string): void {
  registry.delete(id)
}

/** 读取侧唯一解析入口：未注册 id（含历史 'light'）回落默认，永不白屏。 */
export function getThemeDefinition(id: unknown): ThemeDefinition {
  if (typeof id === 'string' && registry.has(id)) return registry.get(id)!
  return registry.get(DEFAULT_APP_THEME)!
}

/** 当前主题的明暗基底（通用分支用；具体色值走 definition，不要再写 id 特判）。 */
export function getThemeBase(id: unknown): 'dark' | 'light' {
  return getThemeDefinition(id).base
}

export function listThemeDefinitions(): ThemeDefinition[] {
  return [...registry.values()]
}

export function isKnownTheme(id: unknown): boolean {
  return typeof id === 'string' && registry.has(id)
}
