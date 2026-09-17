// Note: P0 产物格式为 image/text 预览；新增格式只改本文件映射 — see .agents/notes/implemented/feature/2026-09-17-product-preview-p0.md
// Note: 产物工作区 canonical kind mapping; Office rendering itself is served by
// iOfficeAI/OfficeCLI (Apache-2.0, github.com/iOfficeAI/OfficeCLI) via the office watch pool.
// See .agents/notes/implemented/feature/2026-09-13-product-workspace.md
import { OFFICE_EXTENSIONS } from './office'

export const PRODUCT_MARKDOWN_EXTENSIONS = ['.md', '.markdown'] as const
export const PRODUCT_HTML_EXTENSIONS = ['.html', '.htm'] as const
export const PRODUCT_IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.ico',
  '.bmp',
] as const
export const PRODUCT_TEXT_EXTENSIONS = [
  '.txt',
  '.log',
  '.json',
  '.jsonc',
  '.yaml',
  '.yml',
  '.xml',
  '.csv',
  '.tsv',
  '.toml',
] as const

export const PRODUCT_LOCAL_EXTENSIONS = [
  ...PRODUCT_MARKDOWN_EXTENSIONS,
  ...PRODUCT_HTML_EXTENSIONS,
  ...PRODUCT_IMAGE_EXTENSIONS,
  ...PRODUCT_TEXT_EXTENSIONS,
] as const
export type ProductLocalExtension = (typeof PRODUCT_LOCAL_EXTENSIONS)[number]

export type ProductKind = 'office' | 'markdown' | 'html' | 'image' | 'text' | 'unsupported'

export interface ProductFileEntry {
  relPath: string
  mtimeMs: number
  size: number
  kind: ProductKind
  ext: string
}

export function isProductLocalExtension(value: string): value is ProductLocalExtension {
  return (PRODUCT_LOCAL_EXTENSIONS as readonly string[]).includes(value)
}

export function productExtForPath(relPath: string): string {
  const dot = relPath.lastIndexOf('.')
  return dot >= 0 ? relPath.slice(dot).toLowerCase() : ''
}

export function productKindForPath(relPath: string): ProductKind {
  const ext = productExtForPath(relPath)
  if ((OFFICE_EXTENSIONS as readonly string[]).includes(ext)) return 'office'
  if ((PRODUCT_MARKDOWN_EXTENSIONS as readonly string[]).includes(ext)) return 'markdown'
  if ((PRODUCT_HTML_EXTENSIONS as readonly string[]).includes(ext)) return 'html'
  if ((PRODUCT_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) return 'image'
  if ((PRODUCT_TEXT_EXTENSIONS as readonly string[]).includes(ext)) return 'text'
  return 'unsupported'
}

export function toProductFileEntry(entry: { relPath: string; mtimeMs: number; size: number }): ProductFileEntry {
  return { relPath: entry.relPath, mtimeMs: entry.mtimeMs, size: entry.size, kind: productKindForPath(entry.relPath), ext: productExtForPath(entry.relPath) }
}
