import { normalizeAppTheme, type AppTheme } from '../../../shared/ipc/theme'

export type { AppTheme }
export { normalizeAppTheme }

export function applyThemeToDocument(theme: AppTheme): void {
  const root = document.documentElement
  // 默认 dark 不挂 data-theme，保持既有 CSS 零变化；planche 显式挂载做叠加覆盖。
  if (theme === 'planche') {
    root.dataset.theme = 'planche'
  } else {
    delete root.dataset.theme
  }
  root.style.colorScheme = theme === 'planche' ? 'light' : 'dark'
}

export async function getAppTheme(): Promise<AppTheme> {
  const api = window.electron?.theme
  if (!api) return 'dark'
  try {
    return normalizeAppTheme(await api.get())
  } catch {
    return 'dark'
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
