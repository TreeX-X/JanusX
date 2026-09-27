import { DEFAULT_APP_THEME, normalizeAppTheme, type AppTheme } from '../../../shared/ipc/theme'
import { getThemeDefinition } from '../../../shared/theme/registry'

export type { AppTheme }
export { normalizeAppTheme }

export function applyThemeToDocument(theme: AppTheme): void {
  const root = document.documentElement
  // data-theme 始终挂载：石板色（默认）与经典黑都显式声明，手写皮肤
  //（[data-theme='planche'] / [data-theme='dark']）在两种模式下都命中；
  // 未知 id 经 getThemeDefinition 回落默认，永不白屏。
  const resolved = getThemeDefinition(theme)
  root.dataset.theme = resolved.id
  root.style.colorScheme = resolved.base
}

export async function getAppTheme(): Promise<AppTheme> {
  const api = window.electron?.theme
  if (!api) return DEFAULT_APP_THEME
  try {
    return normalizeAppTheme(await api.get())
  } catch {
    return DEFAULT_APP_THEME
  }
}

export async function updateAppTheme(theme: AppTheme): Promise<AppTheme> {
  const normalized = normalizeAppTheme(theme)
  const api = window.electron?.theme
  if (!api) {
    applyThemeToDocument(normalized)
    return normalized
  }
  const next = normalizeAppTheme(await api.update(normalized))
  applyThemeToDocument(next)
  return next
}
