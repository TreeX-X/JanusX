import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { parseNote, validateNote } from '@janus-agent/harness-core'
import { buildNoteIndex, SUPPORTED_HARNESS_PROFILE } from '@janus-agent/harness-node'
import { stringify } from 'yaml'
import { applyPreview, inventoryNotes, legacyId, previewNote } from '../../scripts/migrate-agent-notes.mjs'

const repoId = '972afef3-2fc7-49de-a3ee-7e041225d28c'
const id = '12345678-1234-4234-8234-123456789abc'
const otherId = '22345678-1234-4234-8234-123456789abc'
const path = '.agents/notes/implemented/architecture/2026-09-20-sample.md'
const otherPath = '.agents/notes/implemented/architecture/2026-09-20-other.md'
const legacy = '# Agent Note: Implementation choice\n\nStatus: implemented\n\n## Problem\n\nA task mentions implementation.\n\n## Decision\n\nReuse the engine at \u0060src/engine.ts\u0060.\n\n## Alternatives considered\n\nDo nothing retains the problem.\n\n## Consequences\n\nOne source owns behavior.\n'
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const roots: string[] = []
async function fixture(files: Record<string, string> = { [path]: legacy }) {
  const root = await mkdtemp(join(tmpdir(), 'r2-note-migration-'))
  roots.push(root)
  await mkdir(join(root, '.agents/notes'), { recursive: true })
  await writeFile(join(root, '.agents/harness.json'), JSON.stringify({ schemaVersion: 1, repoId, name: 'migration tests', profile: SUPPORTED_HARNESS_PROFILE }))
  for (const [name, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, name)), { recursive: true })
    await writeFile(join(root, name), text)
  }
  return root
}
function formal(meta: Record<string, unknown> = {}, body = '# Formal\n\n## Problem\n\nPreserve existing facts.\n') {
  return '---\n' + stringify({ schema: 'harness-note/1', id, kind: 'decision', lifecycle: 'draft', created: '2026-09-20', ...meta }) + '---\n' + body
}
function preview(raw = legacy, relPath = path, classification = 'legacy', options: { allowR5Repairs?: boolean } = {}) {
  return previewNote({ repoId, raw, relPath, classification, ...options })
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

describe('Note migration conversion', () => {
  it('converts decisions without fabricating task execution or changing prose and links', () => {
    const raw = legacy + '\n[related][ref]\n\n[ref]: ./2026-09-20-other.md#problem\n'
    const row = preview(raw)
    expect(row.outcome).toBe('ready')
    const parsed = parseNote(row.after!)
    expect(validateNote(parsed)).toEqual([])
    expect(parsed.meta).toMatchObject({ kind: 'decision', lifecycle: 'implemented', created: '2026-09-20' })
    expect(parsed.meta.execution).toBeUndefined()
    expect(parsed.meta.work).toBeUndefined()
    expect(row.after!.endsWith(raw)).toBe(true)
    expect(row.beforeHash).toBe(sha(raw))
    expect(row.afterHash).toBe(sha(row.after!))
    expect(row.reconciliation).toMatchObject({ bodyVerbatim: true, bodyContiguous: true, linksUnchanged: true, executionAdded: false })
    expect(row.reconciliation.links).toEqual([{ destination: './2026-09-20-other.md#problem', label: 'related' }])
  })

  it('generates stable UUIDv5 identity from repository and unchanged path only', () => {
    const a = preview()
    expect(a.id).toMatch(/^[0-9a-f-]{14}5[0-9a-f]{3}-[89ab]/)
    expect(preview(legacy.replace('Implementation choice', 'Renamed title')).id).toBe(a.id)
    expect(legacyId(repoId, otherPath)).not.toBe(a.id)
    expect(legacyId(otherId, path)).not.toBe(a.id)
    expect(preview()).toEqual(a)
  })

  it('reuses explicit UUID and creation date and preserves CRLF as a contiguous block', () => {
    const raw = legacy.replace('Status: implemented', 'Status: implemented\nUUID: ' + id + '\nCreated: 2026-08-31').replaceAll('\n', '\r\n')
    const row = preview(raw)
    expect(row.outcome).toBe('ready')
    expect(parseNote(row.after!).meta).toMatchObject({ id, created: '2026-08-31' })
    expect(row.after!.endsWith(raw)).toBe(true)
    expect(row.reconciliation.beforeBodyHash).toBe(sha(raw))
  })

  it('does not treat identity examples inside decision prose as declarations', () => {
    const row = preview(legacy + '\nUUID: ordinary clones keep it.\n\n~~~yaml\nId: example\nStatus: done\n~~~\n')
    expect(row.outcome).toBe('ready')
    expect(row.id).toBe(legacyId(repoId, path))
  })

  it('converts proposed decisions without treating implementation prose as a task', () => {
    const raw = legacy.replace('Status: implemented', 'Status: proposed').replace('## Decision', '## Proposal').replace('## Consequences', '## Risks')
    const row = preview(raw, path.replace('/implemented/', '/proposed/'))
    expect(row.outcome).toBe('ready')
    expect(parseNote(row.after!).meta).toMatchObject({ kind: 'decision', lifecycle: 'proposed' })
  })

  it('passes valid formal sources through byte-for-byte with metadata intact', () => {
    const raw = '\uFEFF' + formal({ parent: 'note://' + repoId + '/' + otherId, codeRefs: [{ repoId, path: 'src/engine.ts', role: 'entry', symbol: 'Engine' }], relations: [{ type: 'supersedes', target: 'note://' + repoId + '/' + otherId, scope: 'partial', reason: 'Keeps API' }], extensions: { historical: { date: '2020-01-01' } } }).replaceAll('\n', '\r\n')
    const row = preview(raw, path, 'valid')
    expect(row.outcome).toBe('unchanged')
    expect(row.before).toBe(row.after)
    expect(row.beforeHash).toBe(row.afterHash)
    expect(row.reconciliation.metadataPreserved).toEqual(parseNote(raw).meta)
  })

  it('repairs extra H1 with a mapping and recoverable original bytes, ignoring code headings', () => {
    const body = '# Title\n\n## Problem\n\nOriginal.\n\n# Appendix\n\n[section](#appendix)\n\n~~~md\n# Code example\n~~~\n'
    const raw = formal({}, body)
    const row = preview(raw, path, 'malformed')
    expect(row.outcome).toBe('ready')
    expect(validateNote(parseNote(row.after!))).toEqual([])
    const provenance = parseNote(row.after!).meta.extensions!.r2Migration as { sourceHash: string; originalBodyBase64: string }
    expect(provenance.sourceHash).toBe(sha(raw))
    expect(Buffer.from(provenance.originalBodyBase64, 'base64').toString()).toBe(body)
    expect(row.reconciliation.headingMapping).toHaveLength(1)
    expect(row.reconciliation.headingAnchorsUnchanged).toBe(true)
    expect(row.after).toContain('~~~md\n# Code example\n~~~')
    expect(row.after).toContain('### Appendix')
  })

  it.each([
    ['malformed relation metadata', formal({ relations: [{ type: 'related-to', target: 'note://' + repoId + '/' + otherId, reason: 'Keep original intent' }] }), 'scope/reason'],
    ['unknown formal key', formal({ mystery: 'keep' }), 'unknown top-level'],
    ['invalid ID', formal({ id: 'old-short-id' }), 'UUID'],
    ['duplicate YAML key', formal().replace('kind: decision', 'kind: decision\nkind: task'), 'Map keys'],
    ['unknown schema', formal({ schema: 'external/1' }), 'Foreign'],
    ['missing title', formal({}, '## Problem\n\nUnknown title.\n'), 'no H1'],
  ])('blocks %s without discarding source', (_name, raw, reason) => {
    const row = preview(raw, path, 'malformed')
    expect(row.outcome).toBe('blocked')
    expect(row.before).toBe(raw)
    expect(row.after).toBeNull()
    expect(row.reasons.join(' ')).toContain(reason)
  })

  it('blocks archived, contradictory, unknown and ambiguous legacy sources explicitly', () => {
    for (const [raw, relPath] of [[legacy, path.replace('/implemented/', '/archived/')], [legacy.replace('implemented', 'done'), path], ['# A foreign document\nUnknown.\n', path], [legacy.replace('## Decision', '## Proposal (scope)'), path]]) {
      const row = preview(raw, relPath)
      expect(row.outcome).toBe('blocked')
      expect(row.before).toBe(raw)
      expect(row.reasons.length).toBeGreaterThan(0)
    }
  })

  it('R5 repair mode normalizes historical relations and archived decision sections without inventing execution', () => {
    const malformed = formal({ relations: [{ type: 'related-to', target: 'note://' + repoId + '/' + otherId, reason: 'Historical link' }] })
    const repaired = preview(malformed, path, 'malformed', { allowR5Repairs: true })
    expect(repaired.outcome).toBe('ready')
    expect(parseNote(repaired.after!).meta.extensions?.r5Migration).toBeTruthy()
    expect(parseNote(repaired.after!).meta.relations?.[0]).toEqual({ type: 'related-to', target: 'note://' + repoId + '/' + otherId })
    const archived = preview(legacy, '.agents/notes/archived/feature/2026-09-17-old.md', 'legacy', { allowR5Repairs: true })
    expect(archived.outcome).toBe('ready')
    const parsed = parseNote(archived.after!)
    expect(parsed.meta.lifecycle).toBe('archived')
    expect(parsed.meta.disposition?.reason).toContain('Migrated from legacy')
    expect(parsed.meta.execution).toBeUndefined()
  })

  it('composes relation and heading repairs while preserving both original sources', () => {
    const relations = [{ type: 'related-to', target: 'note://' + repoId + '/' + otherId, reason: 'Historical link' }]
    const raw = formal({ relations }, '# Formal\n\n## Problem\n\n# Nested heading\n\n[Other](./other.md)\n')
    const row = preview(raw, path, 'malformed', { allowR5Repairs: true })
    expect(row.outcome).toBe('ready')
    const parsed = parseNote(row.after!)
    expect(validateNote(parsed)).toEqual([])
    expect(parsed.meta.extensions?.r5Migration).toMatchObject({ sourceHash: sha(raw), originalRelations: relations })
    expect(parsed.meta.extensions?.r2Migration).toMatchObject({ sourceHash: sha(raw) })
    const archived = preview(legacy + '\n# Extra heading\n', '.agents/notes/archived/feature/2026-09-17-old.md', 'legacy', { allowR5Repairs: true })
    expect(archived.outcome).toBe('ready')
    const extensions = parseNote(archived.after!).meta.extensions
    expect(extensions?.r5Migration).toBeTruthy()
    expect(extensions?.r2Migration).toBeTruthy()
    expect(preview(formal({ relations, extensions: { r5Migration: { previous: true } } }), path, 'malformed', { allowR5Repairs: true }).outcome).toBe('blocked')
  })

  it.each([null, false, 0, '', {}, { previous: true }])('preserves occupied migration extension keys (%j)', (value) => {
    const relations = [{ type: 'related-to', target: 'note://' + repoId + '/' + otherId, reason: 'Historical link' }]
    const inputs = [
      formal({ relations, extensions: { r5Migration: value } }),
      formal({ extensions: { r2Migration: value } }, '# Formal\n\n## Problem\n\n# Nested heading\n'),
    ]
    for (const raw of inputs) {
      const row = preview(raw, path, 'malformed', { allowR5Repairs: true })
      expect(row.outcome).toBe('blocked')
      expect(row.before).toBe(raw)
      expect(row.after).toBeNull()
      expect(row.reasons.join(' ')).toContain('extension requires manual review')
    }
  })

  it('identifies a navigation helper separately from an unknown foreign document', () => {
    expect(preview('# Notes\n\n[Decision](a.md)\n', '.agents/notes/README.md', 'foreign').outcome).toBe('helper')
    expect(preview('# Analysis\n\nReal but unclassified content.\n', '.agents/notes/README.md', 'foreign').outcome).toBe('blocked')
    expect(preview('# Notes\n\nA design without formal sections.\n', '.agents/notes/README.md', 'foreign').outcome).toBe('blocked')
  })
})

describe('inventory and selected application', () => {
  it('reconciles every shared-index row, is deterministic, and leaves sources unchanged', async () => {
    const root = await fixture({ [path]: legacy, '.agents/notes/formal.md': formal(), '.agents/notes/bad.md': formal({ id: otherId, mystery: 'unknown' }), '.agents/notes/README.md': '# Notes\n\n[Asset](formal.md)\n', '.agents/notes/unknown.md': '# Unknown\n' })
    const report = await inventoryNotes(root)
    expect(report).toEqual(await inventoryNotes(root))
    expect(report.counts).toEqual({ total: 5, classifications: { foreign: 2, malformed: 1, valid: 1, legacy: 1 }, outcomes: { helper: 1, blocked: 2, unchanged: 1, ready: 1 } })
    expect(report.entries.map((row: { relPath: string }) => row.relPath)).toEqual((await buildNoteIndex(root)).entries.map((row) => row.relPath))
    expect(await readFile(join(root, path), 'utf8')).toBe(legacy)
  })

  it('applies only selected files and retries idempotently', async () => {
    const root = await fixture({ [path]: legacy, [otherPath]: legacy })
    const report = await inventoryNotes(root)
    expect(await applyPreview(root, report, [path])).toEqual({ results: [{ relPath: path, status: 'applied' }] })
    expect((await buildNoteIndex(root)).byPath.get(path)?.classification).toBe('valid')
    expect(await readFile(join(root, otherPath), 'utf8')).toBe(legacy)
    expect(await applyPreview(root, report, [path])).toEqual({ results: [{ relPath: path, status: 'unchanged' }] })
    expect((await inventoryNotes(root)).entries.find((row: { relPath: string }) => row.relPath === path)?.outcome).toBe('unchanged')
    const after = await readFile(join(root, path), 'utf8')
    await writeFile(join(root, path), after + '\nLater edit.\n')
    await expect(applyPreview(root, report, [path])).rejects.toThrow('Stale preview')
  })

  it('refuses one stale input before writing any selected file', async () => {
    const root = await fixture({ [path]: legacy, [otherPath]: legacy })
    const report = await inventoryNotes(root)
    await writeFile(join(root, path), legacy + '\nConcurrent edit.\n')
    await expect(applyPreview(root, report, [otherPath, path])).rejects.toThrow('Stale preview')
    expect(await readFile(join(root, otherPath), 'utf8')).toBe(legacy)
  })

  it('refuses edited previews even when the after hash is recomputed', async () => {
    const root = await fixture()
    const report = await inventoryNotes(root)
    report.entries[0].after += '\nInvented outcome.\n'
    report.entries[0].afterHash = sha(report.entries[0].after!)
    await expect(applyPreview(root, report, [path])).rejects.toThrow('not reproducible')
    expect(await readFile(join(root, path), 'utf8')).toBe(legacy)
  })

  it('rejects empty, unknown, escaping and blocked selections', async () => {
    const root = await fixture({ [path]: legacy, '.agents/notes/unknown.md': '# Unknown\n' })
    const report = await inventoryNotes(root)
    for (const paths of [[], ['.agents/notes/no.md'], ['.agents/notes/../no.md'], ['.agents/notes/unknown.md']]) {
      await expect(applyPreview(root, report, paths)).rejects.toThrow()
    }
    expect(await readFile(join(root, path), 'utf8')).toBe(legacy)
  })

  it('blocks generated IDs colliding with an existing formal Note and catches new collisions at apply', async () => {
    const root = await fixture()
    const report = await inventoryNotes(root)
    await writeFile(join(root, '.agents/notes/collision.md'), formal({ id: legacyId(repoId, path) }))
    await expect(applyPreview(root, report, [path])).rejects.toThrow('Identity collision')
    const fresh = await inventoryNotes(root)
    expect(fresh.entries.every((row: { outcome: string }) => row.outcome === 'blocked')).toBe(true)
  })

  it('preserves hierarchy, dependency, decision and code references in a four-file pilot fixture', async () => {
    const parentId = '32345678-1234-4234-8234-123456789abc'
    const depId = '42345678-1234-4234-8234-123456789abc'
    const uri = (value: string) => 'note://' + repoId + '/' + value
    const decision = formal({ parent: uri(parentId), codeRefs: [{ repoId, path: 'src/engine.ts', role: 'implementation' }] }, '# Decision\n\n## Problem\n\nKeep engine ownership.\n\n# Detail\n\n[Parent](parent.md)\n')
    const task = formal({ id: otherId, kind: 'task', parent: uri(parentId), relations: [{ type: 'depends-on', target: uri(depId) }, { type: 'governed-by', target: uri(id) }] }, '# Task\n\n## Scope\n\nNo execution has started.\n')
    const files = { '.agents/notes/decision.md': decision, '.agents/notes/task.md': task, '.agents/notes/parent.md': formal({ id: parentId, kind: 'initiative' }, '# Parent\n\n## Goal\n\nOwn work.\n'), '.agents/notes/dependency.md': formal({ id: depId, kind: 'requirement' }) }
    const root = await fixture(files)
    const report = await inventoryNotes(root)
    expect(report.counts.outcomes).toEqual({ unchanged: 3, ready: 1 })
    await applyPreview(root, report, Object.keys(files))
    const index = await buildNoteIndex(root)
    expect(index.entries.every((entry) => entry.classification === 'valid')).toBe(true)
    expect(index.relations.map((edge) => [edge.type, edge.targetUri, edge.resolution.status])).toEqual(expect.arrayContaining([
      ['parent', uri(parentId), 'resolved'], ['depends-on', uri(depId), 'resolved'], ['governed-by', uri(id), 'resolved'],
    ]))
    expect(index.byId.get(id)!.note!.meta.codeRefs).toEqual([{ repoId, path: 'src/engine.ts', role: 'implementation' }])
    expect(index.byId.get(otherId)!.note!.meta.execution).toBeUndefined()
    expect(index.mentions.find((mention) => mention.sourceUri === uri(id))!.resolution.status).toBe('resolved')
  })

  it('refuses pending recovery without applying unselected journal contents', async () => {
    const root = await fixture()
    const report = await inventoryNotes(root)
    await mkdir(join(root, '.agents/.local/transactions/pending'), { recursive: true })
    await expect(applyPreview(root, report, [path])).rejects.toThrow('requires recovery')
    expect(await readFile(join(root, path), 'utf8')).toBe(legacy)
  })

  it('retains and blocks both members of duplicate formal identities', async () => {
    const root = await fixture({ '.agents/notes/a.md': formal(), '.agents/notes/b.md': formal() })
    const report = await inventoryNotes(root)
    expect(report.counts).toMatchObject({ total: 2, classifications: { 'conflicting-identity': 2 }, outcomes: { blocked: 2 } })
    expect(report.entries.every((row: { before: string }) => row.before === formal())).toBe(true)
  })
})
