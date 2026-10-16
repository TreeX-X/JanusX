/**
 * 用户输入的 URL 归一化：scheme 必须带 "://"（排除 localhost:5173 这类误判），
 * 无协议时本地地址走 http，其余走 https。
 *
 * 主进程的浏览器 surface 与渲染层的地址管理都要用同一套规则，
 * 因此住在 shared 而不是任何一侧。
 */
export function normalizeBrowserUrl(input: string): string {
  const trimmed = input.trim()
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return trimmed
  if (/^(about|file|data|chrome|devtools):/i.test(trimmed)) return trimmed
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(trimmed)) return `http://${trimmed}`
  return `https://${trimmed}`
}

/** Blank tabs use the host start page instead of an empty native guest. */
export function isBrowserStartPageUrl(url: string | undefined): boolean {
  return !url || /^about:blank(?:[?#].*)?$/i.test(url)
}
