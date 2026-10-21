// Note: migrate before final validation — see .agents/notes/blueprint/documents/tasks/migrate-notes-v2.md
import { readFileSync, existsSync } from 'node:fs'
import { buildNoteIndex, validateModuleStructure, sha256HexBytes } from '@janus-agent/harness-node'
import { checkNotes } from './check-agent-notes.mjs'
import { readNoteRelocations, resolveNoteRelocation } from './note-relocations.mjs'
const root = process.cwd(), index = await buildNoteIndex(root)
const inventory = JSON.parse(readFileSync('docs/migrations/note-v2.json', 'utf8'))
const relocations = readNoteRelocations(root)
const currentPath = path => resolveNoteRelocation(path, relocations)
// Absorbed-note deletion map: identity evidence lives in the map, facts live in the survivor.
const consolidationPath = 'docs/migrations/note-consolidation.json'
const consolidation = existsSync(consolidationPath) ? JSON.parse(readFileSync(consolidationPath, 'utf8')) : { sources: [] }
const absorbed = new Map(consolidation.sources.map(row => [row.source, row]))
const errors0 = []
for (const row of consolidation.sources) {
  if (existsSync(row.source)) errors0.push('Absorbed source remains: ' + row.source)
  const survivor = index.entries.find(e => e.relPath === row.absorbedInto)
  if (survivor?.note?.meta.id !== row.survivingId) errors0.push('Absorption survivor missing/changed: ' + row.absorbedInto)
}
const errors = [...index.diagnostics, ...validateModuleStructure(index.entries, index.repoId)].map(d => `${d.path ?? ''}: ${d.message}`)
errors.push(...errors0)
function checkIdentity(row) {
  const resolved = currentPath(row.target)
  const absorption = absorbed.get(resolved)
  if (absorption) {
    if (absorption.id !== row.id || absorption.created !== row.created) errors.push('Absorption identity mismatch: ' + row.target)
    return
  }
  const entry = index.entries.find(e => e.relPath === resolved)
  if (entry?.note?.meta.id !== row.id || entry?.note?.meta.created !== row.created) errors.push('Identity/date changed: ' + row.target)
}
for (const row of inventory.sources) {
  if (existsSync(row.source)) errors.push('Old source remains: ' + row.source)
  checkIdentity(row)
}
for (const path of ['docs/migrations/note-responsibilities.json', 'docs/migrations/note-knowledge-reorientation.json', 'docs/migrations/note-blueprint-planning.json']) {
  if (!existsSync(path)) continue
  const report = JSON.parse(readFileSync(path, 'utf8'))
  for (const row of report.sources) {
    checkIdentity(row)
    if (row.source !== row.target && existsSync(row.source)) errors.push('Relocated source remains: ' + row.source)
  }
}
for (const entry of index.entries) {
  const deferred = inventory.deferred.find(row => row.path === entry.relPath)
  if (deferred) {
    if (sha256HexBytes(readFileSync(entry.absPath ?? entry.relPath)) !== deferred.sha256) errors.push('Protected source changed: ' + entry.relPath)
    continue
  }
  if (entry.note?.meta.schema !== 'harness-note/2') errors.push('Unmigrated source: ' + entry.relPath)
  for (const d of entry.diagnostics) errors.push(entry.relPath + ': ' + d.message)
}
const checked = checkNotes(root)
errors.push(...checked.errors)
const protectedUris = new Set(index.entries.filter(entry => inventory.deferred.some(row => row.path === entry.relPath)).map(entry => `note://${index.repoId}/${entry.note?.meta.id}`))
for (const diagnostic of index.readDiagnostics) {
  if (diagnostic.code === 'NOT_READY' && diagnostic.message.startsWith('repository not bound in this index: ')) continue
  // The link checker above verifies the exact protected hash and migration target.
  if (diagnostic.code === 'NOT_FOUND' && protectedUris.has(diagnostic.path)
    && inventory.sources.some(row => diagnostic.message === `Note target missing from complete scan: ${row.source}` && existsSync(currentPath(row.target)))) continue
  errors.push(`${diagnostic.path ?? ''}: ${diagnostic.message}`)
}
for (const error of errors) console.error(error)
console.log(`${index.entries.filter(entry => entry.note?.meta.schema === 'harness-note/2').length} maintained v2 documents; ${inventory.sources.length} originally migrated sources; ${protectedUris.size} remaining protected files; ${errors.length} errors; ${index.readDiagnostics.length} read-side diagnostics.`)
process.exitCode = errors.length ? 1 : 0
