// Note: preserve historical migration paths — see .agents/notes/blueprint/module-responsibilities.md
import { existsSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

/** Read historical move evidence for validation only; runtime ownership comes from Notes. */
export function readNoteRelocations(root) {
  const path = join(root, 'docs/migrations/note-responsibilities.json')
  if (!existsSync(path)) return new Map()
  const report = JSON.parse(readFileSync(path, 'utf8'))
  const moves = new Map(), targets = new Set()
  for (const row of report.sources) {
    for (const value of [row.source, row.target]) {
      if (typeof value !== 'string' || !value.startsWith('.agents/notes/') || value.includes('\\') || posix.normalize(value) !== value) {
        throw new Error('Invalid Note relocation path: ' + value)
      }
    }
    if (row.source === row.target) continue
    if (moves.has(row.source) || targets.has(row.target.toLowerCase())) throw new Error('Duplicate Note relocation: ' + row.source)
    moves.set(row.source, row.target)
    targets.add(row.target.toLowerCase())
  }
  for (const path of moves.keys()) resolveNoteRelocation(path, moves)
  return moves
}

export function resolveNoteRelocation(path, moves) {
  const seen = new Set()
  while (moves.has(path)) {
    if (seen.has(path)) throw new Error('Cyclic Note relocation: ' + path)
    seen.add(path)
    path = moves.get(path)
  }
  return path
}
