import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, open, readdir } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { diffLines } from 'diff'
import type { TurnChangedFile } from '../../shared/ipc/terminal'

const execFileAsync = promisify(execFile)
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_TEXT_BYTES = 16 * 1024 * 1024
const SKIP = new Set(['.git', '.janusX', 'node_modules', 'out', 'dist', 'build', '.cache', '.next', '.vite', '.turbo', 'coverage'])

interface FileSnapshot {
  hash: string
  size: number
  binary: boolean
  oversized: boolean
  text?: string
}
export type TurnFileSnapshot = Map<string, FileSnapshot>

async function walk(cwd: string, dir = cwd): Promise<string[]> {
  const paths: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) paths.push(...await walk(cwd, path))
    else if (entry.isFile()) paths.push(relative(cwd, path))
  }
  return paths
}

async function filePaths(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd, timeout: 15_000, maxBuffer: 16 * 1024 * 1024,
    })
    return [...new Set(stdout.split('\0').filter(Boolean))].sort()
  } catch (error) {
    // Non-repository folders and hosts without Git still support turn changes.
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT' && String(code) !== '128') throw error
    return walk(cwd)
  }
}

export async function captureTurnFiles(cwd: string): Promise<TurnFileSnapshot> {
  const root = resolve(cwd)
  const snapshot: TurnFileSnapshot = new Map()
  let textBytes = 0
  for (const path of await filePaths(root)) {
    const normalized = path.replace(/\\/g, '/')
    if (normalized.split('/').some(part => SKIP.has(part))) continue
    const absolute = resolve(root, path)
    const rel = relative(root, absolute)
    if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) continue
    try {
      const stats = await lstat(absolute)
      if (!stats.isFile()) continue
      if (stats.size >= MAX_FILE_BYTES) {
        snapshot.set(normalized, { hash: `${stats.size}:${stats.mtimeMs}:${stats.ctimeMs}`, size: stats.size, binary: false, oversized: true })
        continue
      }
      const handle = await open(absolute, 'r')
      let content: Buffer
      try {
        const buffer = Buffer.allocUnsafe(Math.min(stats.size + 1, MAX_FILE_BYTES))
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
        if (bytesRead !== stats.size) throw new Error(`File changed during turn snapshot: ${normalized}`)
        content = buffer.subarray(0, bytesRead)
      } finally {
        await handle.close()
      }
      const binary = content.subarray(0, 8192).includes(0)
      const oversized = content.length >= MAX_FILE_BYTES
      const retainText = !binary && !oversized && textBytes + content.length <= MAX_TEXT_BYTES
      snapshot.set(normalized, {
        hash: createHash('sha256').update(content).digest('hex'), size: content.length, binary, oversized,
        ...(retainText ? { text: content.toString('utf8') } : {}),
      })
      if (retainText) textBytes += content.length
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return snapshot
}

export function compareTurnFiles(before: TurnFileSnapshot, after: TurnFileSnapshot): TurnChangedFile[] {
  const files: TurnChangedFile[] = []
  for (const path of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const old = before.get(path)
    const current = after.get(path)
    if (old && current && old.hash === current.hash && old.size === current.size) continue
    const status = !old ? 'added' : !current ? 'deleted'
      : old.oversized || current.oversized ? 'oversized' : old.binary || current.binary ? 'binary' : 'modified'
    const record: TurnChangedFile = { path, status, additions: null, deletions: null, size: current?.size ?? old!.size }
    if ((!old || old.text !== undefined) && (!current || current.text !== undefined)) {
      // Bound diff work on unrelated large texts; missing counts stay unknown.
      const changes = diffLines(old?.text ?? '', current?.text ?? '', { timeout: 100 })
      if (changes) {
        record.additions = changes.reduce((count, part) => count + (part.added ? part.count : 0), 0)
        record.deletions = changes.reduce((count, part) => count + (part.removed ? part.count : 0), 0)
      }
    }
    files.push(record)
  }
  return files
}
