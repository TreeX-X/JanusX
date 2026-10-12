// Note: generated engineering assets are retired by ownership, never by deleting the shared root.
import { lstat, readFile, realpath, readdir, unlink, rmdir } from 'node:fs/promises'
import { join, relative, isAbsolute } from 'node:path'
import { withFactCandidatesLock } from './review-service'
import { assertFactReviewReady } from './fact-review-recovery'
import { writeFileAtomic } from '../lib/atomic-file'
import { knowledgeRootPath } from './constants'

/** Preserves personal/mixed sources, audit, model resources and every unrecognized path/record. Idempotent on restart. */
export async function retireEngineeringAssets(root = knowledgeRootPath()): Promise<{ removed: number; retained: string[] }> {
  const result = { removed: 0, retained: [] as string[] }
  let base: string
  try { base = await realpath(root) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result; throw error }
  if (await lstat(join(base, '.agents')).then(() => true, () => false)) throw new Error('Refusing to clean a project source directory')
  const confined = async (path: string) => {
    const segments = relative(base, path).split(/[\\/]/)
    let cursor = base
    for (const segment of segments) {
      cursor = join(cursor, segment)
      if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Symbolic asset retained')
    }
    const info = await lstat(path)
    if (info.isSymbolicLink()) throw new Error('Symbolic asset retained')
    const real = await realpath(path), rel = relative(base, real)
    if (!rel || isAbsolute(rel) || rel.startsWith('..')) throw new Error('Asset is outside knowledge storage')
    return info
  }
  const remove = async (path: string, tree = false): Promise<void> => {
    try {
      const info = await confined(path)
      if (info.isDirectory() && tree) {
        for (const entry of await readdir(path)) await remove(join(path, entry), true)
        await rmdir(path)
      } else if (info.isFile()) { await unlink(path); result.removed++ }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') result.retained.push(relative(base, path)) }
  }
  // These paths have only engineering-generation writers; personal memory never stores content here.
  // Older versions stored some pages directly under wiki; delete only index-owned Markdown there.
  try {
    const index = join(base, 'wiki/pages-index.json'); await confined(index)
    const pages = JSON.parse(await readFile(index, 'utf8')).pages
    if (Array.isArray(pages)) for (const page of pages) {
      if (typeof page?.relativePath === 'string' && /^wiki[/\\][^:]+\.md$/.test(page.relativePath)
        && !page.relativePath.split(/[\\/]/).includes('..')) await remove(join(base, page.relativePath))
    }
  } catch { /* Unknown/malformed index rows never authorize additional deletion. */ }
  for (const path of ['wiki/pages', 'wiki/history', 'graph', 'processing/extraction']) await remove(join(base, path), true)
  for (const path of ['wiki/pages-index.json', 'wiki/patches.jsonl', 'wiki/review-pending.json', 'indexes/bm25.json', 'indexes/graph-snapshot.json',
    'processing/automation-tasks.json', 'processing/automation.json', 'processing/extraction-runs.json']) await remove(join(base, path))
  await withFactCandidatesLock(async () => {
    await assertFactReviewReady()
    for (const path of ['facts/facts.jsonl', 'facts/candidates.jsonl']) {
      try {
        const file = join(base, path); await confined(file)
        const before = await readFile(file, 'utf8')
        const lines = before.match(/[^\n]*\n|[^\n]+$/g) ?? []
        const keep = lines.filter(line => {
          try {
            const row = JSON.parse(line), fact = path.endsWith('candidates.jsonl') ? row.fact : row
            // Explicit user ownership wins over legacy project provenance.
            return !fact || fact.scope === 'user' || fact.provenance?.workspaceId === 'user'
              || !['project', 'global'].includes(fact.scope)
          } catch { return true }
        })
        if (keep.length !== lines.length) { await writeFileAtomic(file, keep.join('')); result.removed += lines.length - keep.length }
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') result.retained.push(path) }
    }
  })
  return result
}
