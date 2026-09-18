import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  LOCAL_ASSET_DOC_LIMIT,
  LOCAL_ASSET_MAX_BYTES,
  resolveLocalAssetAbsolutePath,
} from '@/lib/local-asset-resolver'

export interface MarkdownAssetContextValue {
  workspacePath?: string
  documentDir?: string
}

export const MarkdownAssetContext = createContext<MarkdownAssetContextValue>({})

const dataUrlCache = new Map<string, string>()
const inflightLoads = new Map<string, Promise<string | null>>()

function pruneCache(): void {
  while (dataUrlCache.size > 120) {
    const oldest = dataUrlCache.keys().next()
    if (oldest.done) return
    dataUrlCache.delete(oldest.value)
  }
}

export function peekCachedAssetDataUrl(absolutePath: string): string | undefined {
  return dataUrlCache.get(absolutePath)
}

export function loadLocalAssetDataUrl(absolutePath: string): Promise<string | null> {
  const cached = dataUrlCache.get(absolutePath)
  if (cached) return Promise.resolve(cached)
  const inflight = inflightLoads.get(absolutePath)
  if (inflight) return inflight
  const request = (async () => {
    try {
      const api = window.electron?.file
      if (!api) return null
      const result = await api.readBinary(absolutePath)
      if (!result || typeof result !== 'object' || !('base64' in result)) return null
      const binary = result as { base64?: string; mimeType?: string; size?: number; error?: string }
      if (typeof binary.error === 'string' && binary.error) return null
      if (!binary.base64) return null
      if (typeof binary.size === 'number' && binary.size > LOCAL_ASSET_MAX_BYTES) return null
      // Base64 inflates ~4/3; reject oversized payloads that slipped past `size`.
      if (binary.base64.length > Math.ceil((LOCAL_ASSET_MAX_BYTES * 4) / 3) + 64) return null
      const dataUrl = `data:${binary.mimeType ?? 'application/octet-stream'};base64,${binary.base64}`
      dataUrlCache.set(absolutePath, dataUrl)
      pruneCache()
      return dataUrl
    } catch {
      return null
    } finally {
      inflightLoads.delete(absolutePath)
    }
  })()
  inflightLoads.set(absolutePath, request)
  return request
}

export function useLocalAssetAbsolutePath(
  src: string | undefined,
  override?: { workspacePath?: string; documentDir?: string },
): string | null {
  const context = useContext(MarkdownAssetContext)
  const workspacePath = override?.workspacePath ?? context.workspacePath
  const documentDir = override?.documentDir ?? context.documentDir
  return useMemo(
    () => resolveLocalAssetAbsolutePath(src, { workspacePath, documentDir }),
    [src, workspacePath, documentDir],
  )
}

/** Resolve a local asset `src` to a `data:` URL; remote URLs pass through untouched. */
export function useLocalAssetUrl(src: string | undefined): string | undefined {
  const absolutePath = useLocalAssetAbsolutePath(src)
  const [dataUrl, setDataUrl] = useState<string | undefined>(() =>
    absolutePath ? peekCachedAssetDataUrl(absolutePath) : undefined,
  )
  useEffect(() => {
    if (!absolutePath) {
      setDataUrl(undefined)
      return
    }
    const cached = peekCachedAssetDataUrl(absolutePath)
    if (cached) {
      setDataUrl(cached)
      return
    }
    let disposed = false
    setDataUrl(undefined)
    void loadLocalAssetDataUrl(absolutePath).then((resolved) => {
      if (!disposed && resolved) setDataUrl(resolved)
    })
    return () => {
      disposed = true
    }
  }, [absolutePath])
  if (!absolutePath) return src
  return dataUrl
}

export interface HtmlAssetScope {
  workspacePath?: string
  documentDir?: string
}

function rewriteHtmlAssetUrls(html: string, rewrite: (src: string) => string | null): string {
  // Keep the rewrite sequential and attribute-scoped: only media-bearing
  // attributes are touched, markup structure stays byte-identical otherwise.
  return html.replace(
    /(<(?:img|source|video|audio)\b[^>]*?\s(?:src|poster)\s*=\s*)(["'])(.*?)\2/gi,
    (match, prefix: string, quote: string, src: string) => {
      const resolved = rewrite(src)
      if (!resolved) return match
      return `${prefix}${quote}${resolved}${quote}`
    },
  )
}

/**
 * Rewrite workspace-local media URLs inside an HTML preview document to `data:` URLs.
 * Remote URLs stay untouched; unresolvable sources keep their original value.
 */
export function useResolvedHtmlSrcDoc(
  rawHtml: string,
  scope: HtmlAssetScope,
): string {
  const { workspacePath, documentDir } = scope
  const [resolved, setResolved] = useState(rawHtml)
  useEffect(() => {
    let disposed = false
    if (!workspacePath && !documentDir) {
      setResolved(rawHtml)
      return
    }
    const targets = new Map<string, string>()
    rewriteHtmlAssetUrls(rawHtml, (src) => {
      const absolute = resolveLocalAssetAbsolutePath(src, { workspacePath, documentDir })
      if (!absolute || targets.has(src) || targets.size >= LOCAL_ASSET_DOC_LIMIT) return null
      targets.set(src, absolute)
      return absolute
    })
    if (targets.size === 0) {
      setResolved(rawHtml)
      return
    }
    void (async () => {
      const resolvedBySrc = new Map<string, string>()
      await Promise.all(
        [...targets.entries()].map(async ([src, absolute]) => {
          const dataUrl = await loadLocalAssetDataUrl(absolute)
          if (dataUrl) resolvedBySrc.set(src, dataUrl)
        }),
      )
      if (disposed) return
      if (resolvedBySrc.size === 0) {
        setResolved(rawHtml)
        return
      }
      setResolved(rewriteHtmlAssetUrls(rawHtml, (src) => resolvedBySrc.get(src) ?? null))
    })()
    return () => {
      disposed = true
    }
  }, [rawHtml, workspacePath, documentDir])
  return resolved
}
