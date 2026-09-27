/**
 * 语义令牌表：组件层唯一允许使用的颜色来源。
 * 新增令牌先加到这里 + 每个 definition 补值（completeness 测试会卡），再在组件里用。
 * JS 侧用 getThemeTokens() / useThemeTokens()，CSS 侧用 var(--<key>)。
 */
import { getThemeDefinition, listThemeDefinitions } from './registry'

export const SEMANTIC_TOKENS = [
  'shell-void',
  'shell-canvas',
  'shell-pane',
  'shell-pane-chrome',
  'shell-chrome',
  'shell-chrome-raised',
  'shell-card',
  'shell-drawer',
  'control-h',
  'control-border',
  'shell-hover',
  'shell-active',
  'shell-border',
  'shell-border-soft',
  'shell-text',
  'shell-muted',
  'shell-dim',
  'shell-diff-add',
  'shell-diff-del',
  'shell-accent',
  'shell-accent-strong',
  'shell-accent-soft',
  'shell-accent-border',
  'primary',
  'bg-app',
  'bg-deep',
  'bg-dark',
  'bg-darker',
  'workbench-canvas',
  'workbench-grid',
  'surface',
  'surface-elevated',
  'chrome-bg',
  'text',
  'text-secondary',
  'text-dim',
  'border',
  'border-soft',
  'accent-soft',
  'accent-mid',
  'accent-glow',
] as const

export type SemanticToken = (typeof SEMANTIC_TOKENS)[number]

/** 纯函数：取某主题的令牌表（CSS 变量值原样，含 var() 引用与非颜色值如 control-h）。 */
export function getThemeTokens(id: unknown): Record<string, string> {
  return { ...getThemeDefinition(id).tokens }
}

/** 完整性断言：每个已注册主题必须覆盖全部语义令牌（测试与生成脚本共用）。 */
export function assertThemeCompleteness(): string[] {
  const missing: string[] = []
  for (const definition of listThemeDefinitions()) {
    for (const token of SEMANTIC_TOKENS) {
      if (!(token in definition.tokens)) {
        missing.push(`${definition.id}:${token}`)
      }
    }
  }
  return missing
}
