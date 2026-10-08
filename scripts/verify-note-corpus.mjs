// Note: migrate before final validation — see .agents/notes/blueprint/tasks/migrate-notes-v2.md
import { readFileSync, existsSync } from 'node:fs'
import { buildNoteIndex, validateModuleStructure, sha256HexBytes } from '@janus-agent/harness-node'
import { checkNotes } from './check-agent-notes.mjs'
const root = process.cwd(), index = await buildNoteIndex(root)
const inventory = JSON.parse(readFileSync('docs/migrations/note-v2.json', 'utf8'))
const errors = [...index.diagnostics, ...validateModuleStructure(index.entries, index.repoId)].map(d => `${d.path ?? ''}: ${d.message}`)
for (const row of inventory.sources) {
  if (existsSync(row.source)) errors.push('Old source remains: ' + row.source)
  const entry = index.entries.find(e => e.relPath === row.target)
  if (entry?.note?.meta.id !== row.id || entry?.note?.meta.created !== row.created) errors.push('Identity/date changed: ' + row.target)
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
    && inventory.sources.some(row => diagnostic.message === `Note target missing from complete scan: ${row.source}` && existsSync(row.target))) continue
  errors.push(`${diagnostic.path ?? ''}: ${diagnostic.message}`)
}
for (const error of errors) console.error(error)
console.log(`${index.entries.length - inventory.deferred.length} maintained v2 documents; ${inventory.sources.length} migrated sources; ${inventory.deferred.length} protected legacy files; ${errors.length} errors; ${index.readDiagnostics.length} read-side diagnostics.`)
process.exitCode = errors.length ? 1 : 0
