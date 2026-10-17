import { realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'

function canonical(path: string): string {
  try { return realpathSync.native(path) } catch { return resolve(path) }
}

function within(root: string, path: string): boolean {
  const child = relative(root, path)
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith('../') && !child.startsWith('..\\'))
}

/** Resolve aliases once at registration, never perform filesystem I/O per event. */
export function createApplicationDataEventFilter(workspacePath: string, dataPaths: string[]): (filename: string | Buffer | null) => boolean {
  const roots = [...new Set([resolve(workspacePath), canonical(workspacePath)])]
  const excluded = [...new Set(dataPaths.filter(Boolean).flatMap(path => [resolve(path), canonical(path)]))]
    .filter(path => roots.some(root => within(root, path)))
  return filename => {
    // An overflow/unknown event may include real source changes: keep the refresh.
    if (!filename) return false
    return roots.some(root => excluded.some(path => within(path, resolve(root, filename.toString()))))
  }
}
