import type { Stats } from 'node:fs'

/** Size alone misses in-place edits; mtime alone misses preserved-timestamp growth. */
export function sourceVersion(info: Stats): string {
  return JSON.stringify([info.dev, info.ino, info.birthtimeMs, info.size, info.mtimeMs, info.ctimeMs])
}
