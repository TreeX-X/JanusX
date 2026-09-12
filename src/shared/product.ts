// Note: 产物工作区 canonical kind mapping; Office rendering itself is served by
// iOfficeAI/OfficeCLI (Apache-2.0, github.com/iOfficeAI/OfficeCLI) via the office watch pool.
// See .agents/notes/implemented/feature/2026-09-13-product-workspace.md
import { OFFICE_EXTENSIONS } from './office'

export const PRODUCT_LOCAL_EXTENSIONS = ['.md', '.markdown', '.html', '.htm'] as const
export type ProductLocalExtension = (typeof PRODUCT_LOCAL_EXTENSIONS)[number]

export type ProductKind = 'office' | 'markdown' | 'html' | 'unsupported'

export interface ProductFileEntry {
  relPath: string
  mtimeMs: number
  size: number
  kind: ProductKind
}

export function isProductLocalExtension(value: string): value is ProductLocalExtension {
  return (PRODUCT_LOCAL_EXTENSIONS as readonly string[]).includes(value)
}

export function productKindForPath(relPath: string): ProductKind {
  const dot = relPath.lastIndexOf('.')
  const ext = dot >= 0 ? relPath.slice(dot).toLowerCase() : ''
  if ((OFFICE_EXTENSIONS as readonly string[]).includes(ext)) return 'office'
  if (ext === '.md' || ext === '.markdown') return 'markdown'
  if (ext === '.html' || ext === '.htm') return 'html'
  return 'unsupported'
}

export function toProductFileEntry(entry: { relPath: string; mtimeMs: number; size: number }): ProductFileEntry {
  return { relPath: entry.relPath, mtimeMs: entry.mtimeMs, size: entry.size, kind: productKindForPath(entry.relPath) }
}
