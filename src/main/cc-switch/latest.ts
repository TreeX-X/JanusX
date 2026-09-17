const LATEST_TIMEOUT_MS = 15_000

type FetchImpl = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>

/**
 * 最新版走 npm dist-tags 轻端点（避开几十 MB 的 packument），超时/离线/异常一律
 * 返回 undefined，调用方展示 unknown 且不阻塞卡片——与转发等长耗时链路隔离。
 */
export async function fetchLatestVersion(
  npmPackage: string,
  fetchImpl: FetchImpl = fetch as unknown as FetchImpl,
  timeoutMs = LATEST_TIMEOUT_MS,
): Promise<string | undefined> {
  const url = `https://registry.npmjs.org/-/package/${npmPackage.replace('/', '%2f')}/dist-tags`
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok) return undefined
    const tags = await response.json() as Record<string, unknown>
    const latest = tags['latest']
    return typeof latest === 'string' && /^\d+\.\d+\.\d+/.test(latest) ? latest : undefined
  } catch {
    return undefined
  }
}
