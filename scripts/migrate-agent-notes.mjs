// Note: migration preserves source facts — see .agents/notes/2026-09-25-note-blueprint-r2-read--fa17e06b.md
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile, lstat } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { parseDocument, stringify } from 'yaml'
import { parseNote, validateNote, readMarkdownView, splitFrontmatter, UUID_RE } from '@janus-agent/harness-core'
import { buildNoteIndex, readIndexedNote, sha256HexBytes, acquireLock, releaseLock, commitAssetFiles, assertAssetPath, listPendingTx, readCommitted } from '@janus-agent/harness-node'

export const REPORT_SCHEMA = 'r2-note-migration/1'
const hash = (text) => sha256HexBytes(Buffer.from(text, 'utf8'))
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const fail = (message) => { throw new Error(message) }
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0

/** UUIDv5: repository UUID namespace + exact, unchanged POSIX repository-relative path.
 * No title, time, status, or content participates. Existing UUIDs always win. */
export function legacyId(repoId, relPath) {
  if (!UUID_RE.test(repoId)) fail('A valid repository UUID is required')
  const bytes = createHash('sha1').update(Buffer.from(repoId.replaceAll('-', ''), 'hex')).update(relPath, 'utf8').digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 15) | 80
  bytes[8] = (bytes[8] & 63) | 128
  const h = bytes.toString('hex')
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-')
}

// Shared splitFrontmatter owns syntax; this slice preserves bytes it normalizes.
function sourceParts(raw) {
  if (!/^\uFEFF?---[ \t]*(?:\r?\n|$)/.test(raw)) return { prefix: '', body: raw, fmText: null }
  const { fmText } = splitFrontmatter(raw)
  const lines = [...raw.matchAll(/[^\n]*(?:\n|$)/g)]
  const end = lines.slice(1).find((line) => line[0].trim() === '---')
  if (!end) fail('Missing frontmatter terminator')
  const offset = end.index + end[0].length
  return { prefix: raw.slice(0, offset), body: raw.slice(offset), fmText }
}

function bodyFacts(body) {
  const view = readMarkdownView(body)
  return { sha256: hash(body), links: view.links.map(({ destination, label }) => ({ destination, label })), headings: view.headings }
}

/** Extra ATX H1 headings are lowered; ambiguous setext/nested headings block.
 * Exact original bytes remain in the report and, for edited bodies, extensions. */
function repairHeadings(body) {
  const headings = readMarkdownView(body).headings.filter((h) => h.depth === 1)
  const lines = body.split(/(?<=\n)/)
  const mapping = []
  for (const h of headings.slice(1)) {
    const before = lines[h.line - 1]
    if (!/^ {0,3}#(?:[ \t]|\r?\n|$)/.test(before)) fail('Manual heading repair required at line ' + h.line)
    const after = before.replace('#', '###')
    lines[h.line - 1] = after
    mapping.push({ line: h.line, before, after })
  }
  if (!headings.length) fail('Manual title required: no H1')
  return { body: lines.join(''), mapping }
}

function declaredScalar(body, key) {
  // Only the metadata paragraph following the title declares legacy identity.
  // UUID examples and Status prose in later sections are ordinary body text.
  const header = /^\uFEFF?# [^\r\n]+\r?\n(?:[ \t]*\r?\n)*((?:(?:Status|Id|UUID|Created):[^\r\n]*(?:\r?\n|$))+)/i.exec(body)?.[1] ?? ''
  const values = [...header.matchAll(new RegExp('^' + key + ':[ \\t]*(.+?)[ \\t]*\\r?$', 'gmi'))].map((m) => m[1])
  if (new Set(values).size > 1) fail('Conflicting legacy ' + key + ' declarations')
  return values[0]
}

/** Pure conversion. Unknown semantics remain blocked; Status never creates execution. */
export function previewNote({ repoId, relPath, raw, classification = 'legacy', allowR5Repairs = false }) {
  const row = { relPath, classification, outcome: 'blocked', beforeHash: hash(raw), afterHash: null, before: raw, after: null, reasons: [], changes: [] }
  try {
    if (['conflicting-identity', 'unreadable'].includes(classification)) fail('Indexed ' + classification)
    const parts = sourceParts(raw)
    const facts = bodyFacts(parts.body)
    row.beforeBodyHash = facts.sha256
    if (classification === 'valid') {
      const parsed = parseNote(raw)
      const errors = validateNote(parsed)
      if (errors.length) fail(JSON.stringify(errors))
      return finish(row, raw, parts.body, parts.body, parsed.meta, parsed.meta, [], facts)
    }
    const navigationOnly = parts.body.split(/\r?\n/).slice(1).every((line) => !line.trim() || /^(?:[-*] )?\[[^\]]+\]\([^)]+\)\s*$/.test(line))
    if (!parts.prefix && /^(README|INDEX)\.md$/i.test(basename(relPath)) && /^# (?:Notes|Note index|Note navigation)\r?\n/.test(parts.body) && facts.headings.length === 1 && navigationOnly) {
      row.outcome = 'helper'
      row.reasons.push('Non-Note navigation helper; retained in inventory, never counted as migrated')
      return row
    }
    const repaired = repairHeadings(parts.body)
    let meta
    let originalMeta = {}
    let prefix = parts.prefix
    if (parts.prefix) {
      // YAML performs CST edits only; shared parseNote checks keys, aliases, tags and schema.
      const doc = parseDocument(parts.fmText)
      if (doc.errors.length) fail(doc.errors[0].message)
      if (doc.get('schema') !== 'harness-note/1') fail('Foreign or missing schema requires explicit metadata review')
      let parsed = parseNote(prefix + repaired.body)
      const parsedErrors = validateNote(parsed)
      if (allowR5Repairs && parsedErrors.length && parsedErrors.every((item) => item.message === 'scope/reason only for supersedes')) {
        if (Object.prototype.hasOwnProperty.call(parsed.meta.extensions ?? {}, 'r5Migration')) fail('Existing r5Migration extension requires manual review')
        const value = doc.toJS()
        const repairs = []
        const relations = Array.isArray(value.relations) ? value.relations.map((relation, index) => {
          if (!relation || relation.type === 'supersedes') return relation
          const next = { ...relation }
          if (Object.prototype.hasOwnProperty.call(next, 'scope')) { delete next.scope; repairs.push(`relations[${index}].scope`) }
          if (Object.prototype.hasOwnProperty.call(next, 'reason')) { delete next.reason; repairs.push(`relations[${index}].reason`) }
          return next
        }) : value.relations
        if (!repairs.length) fail('No supported relation repair found')
        doc.set('relations', relations)
        doc.setIn(['extensions', 'r5Migration'], { sourceHash: row.beforeHash, repairs, originalRelations: value.relations })
        prefix = (raw.startsWith('\uFEFF') ? '\uFEFF' : '') + '---\n' + doc.toString() + '---\n'
        row.changes.push({ field: 'relations', source: 'Removed scope/reason fields invalid for non-supersedes relations; original values retained in extensions.r5Migration' })
        parsed = parseNote(prefix + repaired.body)
      }
      meta = parsed.meta
      originalMeta = parsed.meta
      if (repaired.mapping.length) {
        if (Object.prototype.hasOwnProperty.call(meta.extensions ?? {}, 'r2Migration')) fail('Existing r2Migration extension requires manual review')
        doc.setIn(['extensions', 'r2Migration'], { sourceHash: row.beforeHash, originalBodyBase64: Buffer.from(parts.body).toString('base64'), headingMapping: repaired.mapping })
        prefix = (raw.startsWith('\uFEFF') ? '\uFEFF' : '') + '---\n' + doc.toString() + '---\n'
      }
    } else {
      const first = facts.headings.find((h) => h.depth === 1)
      if (!first?.text.startsWith('Agent Note:')) fail('Unknown Markdown document; human Note/helper classification required')
      const sections = new Set(readMarkdownView(repaired.body).headings.filter((h) => h.depth === 2).map((h) => h.text))
      const hasProposal = [...sections].some((name) => name === 'Proposal' || name.startsWith('Proposal '))
      const hasDecision = sections.has('Decision')
      const folder = relPath.split('/')[2]
      const status = declaredScalar(parts.body, 'Status')?.toLowerCase()
      const id = declaredScalar(parts.body, '(?:Id|UUID)')
      const created = declaredScalar(parts.body, 'Created') ?? /^(\d{4}-\d{2}-\d{2})-/.exec(basename(relPath))?.[1]
      if (id && !UUID_RE.test(id)) fail('Legacy ID requires manual identity review')
      if (!created) fail('Creation date is unknown; do not substitute migration time')
      let lifecycle
      const historical = ['archived', 'rejected'].includes(folder) || ['archived', 'rejected'].includes(status)
      if (historical) {
        if (!allowR5Repairs) fail('Archived/rejected legacy Note needs an explicit disposition and lifecycle review')
        lifecycle = folder === 'rejected' || status === 'rejected' ? 'rejected' : 'archived'
        if (allowR5Repairs) {
          const originalBody = repaired.body
          repaired.body = repaired.body.replace(/^## Decision\s*$/m, '## Proposal').replace(/^## Consequences\s*$/m, '## Risks')
          if (!/^## Risks\s*$/m.test(repaired.body)) repaired.body += '\n\n## Risks\n\nHistorical source has no separate risk section; migration preserves its archived lifecycle.\n'
          if (repaired.body !== originalBody) row.changes.push({ field: 'body headings', source: 'Normalized legacy Decision/Consequences headings to formal Proposal/Risks sections; original body is retained in extensions.r5Migration' })
        }
      } else if (hasDecision && !hasProposal && status === 'implemented' && folder === 'implemented') lifecycle = 'implemented'
      else if (hasProposal && !hasDecision && (status === 'proposed' || (!status && folder === 'proposed'))) {
        lifecycle = 'proposed'
        if (allowR5Repairs && [...sections].some((name) => name.startsWith('Proposal '))) {
          repaired.body = repaired.body.replace(/^## Proposal[^\r\n]*$/m, '## Proposal')
          row.changes.push({ field: 'body heading', source: 'Normalized a legacy Proposal heading suffix to the formal section name' })
        }
      }
      else fail('Legacy kind/lifecycle is ambiguous; review decision sections, folder and Status')
      if (!sections.has('Problem') || !sections.has('Alternatives considered')) fail('Legacy decision shape is incomplete')
      meta = { schema: 'harness-note/1', id: id ?? legacyId(repoId, relPath), kind: 'decision', lifecycle, created }
      const cls = relPath.split('/')[3]
      if (['feature', 'bug-fix', 'architecture', 'process', 'testing', 'simplification'].includes(cls)) meta.class = cls
      if (['archived', 'rejected'].includes(lifecycle)) meta.disposition = { reason: 'Migrated from legacy lifecycle folder; historical state is retained and no execution is inferred.' }
      if (allowR5Repairs && row.changes.some((change) => change.field === 'body headings' || change.field === 'body heading')) {
        meta.extensions = { ...(meta.extensions ?? {}), r5Migration: { sourceHash: row.beforeHash, originalBodyBase64: Buffer.from(parts.body).toString('base64') } }
      }
      row.changes.push({ field: 'frontmatter', source: 'legacy decision sections, lifecycle folder and Status; no task execution inferred' })
      row.identitySource = id ? 'existing legacy UUID' : 'UUIDv5(repoId namespace, unchanged relPath)'
      if (repaired.mapping.length) meta.extensions = { ...meta.extensions, r2Migration: { sourceHash: row.beforeHash, originalBodyBase64: Buffer.from(parts.body).toString('base64'), headingMapping: repaired.mapping } }
      prefix = '---\n' + stringify(meta) + '---\n'
    }
    const after = prefix + repaired.body
    const parsed = parseNote(after)
    const errors = validateNote(parsed)
    if (errors.length) fail(JSON.stringify(errors))
    return finish(row, after, parts.body, repaired.body, originalMeta, parsed.meta, repaired.mapping, facts)
  } catch (error) {
    row.reasons.push(error.message)
    return row
  }
}

function finish(row, after, beforeBody, afterBody, beforeMeta, afterMeta, mapping, facts) {
  const afterFacts = bodyFacts(afterBody)
  if (!equal(facts.links, afterFacts.links)) fail('Body link reconciliation failed')
  for (const field of ['id', 'created', 'parent', 'relations', 'codeRefs', 'work', 'execution', 'repositories', 'interfaces']) {
    if (beforeMeta[field] !== undefined && !equal(beforeMeta[field], afterMeta[field])) fail('Metadata reconciliation failed: ' + field)
  }
  return { ...row, outcome: after === row.before ? 'unchanged' : 'ready', after, afterHash: hash(after), id: afterMeta.id, kind: afterMeta.kind, lifecycle: afterMeta.lifecycle,
    reconciliation: { pathUnchanged: true, bodyVerbatim: beforeBody === afterBody, bodyContiguous: after.includes(beforeBody), beforeBodyHash: hash(beforeBody), afterBodyHash: hash(afterBody), linksUnchanged: true, links: facts.links, metadataPreserved: beforeMeta, headingMapping: mapping, executionAdded: beforeMeta.execution === undefined && afterMeta.execution !== undefined, codeRefs: afterMeta.codeRefs ?? [],
      headingAnchorsUnchanged: equal(facts.headings.map((h) => h.anchor), afterFacts.headings.map((h) => h.anchor)) },
  }
}

/** One shared index covers every source, including invalid and foreign records. */
export async function inventoryNotes(root = process.cwd(), options = {}) {
  root = resolve(root)
  const index = await buildNoteIndex(root)
  if (!index.repoId) fail('Repository identity is unavailable')
  const entries = []
  for (const entry of index.entries) {
    const read = await readIndexedNote(index, entry.relPath)
    if (!read.ok || !read.matchesSnapshot || hash(read.text) !== read.sha256) {
      entries.push({ relPath: entry.relPath, classification: entry.classification, outcome: 'blocked', beforeHash: entry.sourceHash, afterHash: null, reasons: ['Unreadable, changed during inventory, or non-roundtrippable UTF-8 source'], diagnostics: entry.diagnostics })
      continue
    }
    entries.push({ ...previewNote({ repoId: index.repoId, relPath: entry.relPath, raw: read.text, classification: entry.classification, allowR5Repairs: options.allowR5Repairs === true }), diagnostics: entry.diagnostics })
  }
  const groups = new Map()
  for (const row of entries) {
    const id = row.id ?? index.byPath.get(row.relPath)?.note?.meta.id
    if (id) groups.set(id, [...(groups.get(id) ?? []), row])
  }
  for (const group of groups.values()) if (group.length > 1) for (const row of group) {
    row.outcome = 'blocked'
    row.reasons.push('Identity collision: ' + group.map((r) => r.relPath).join(', '))
  }
  const counts = { total: entries.length, classifications: {}, outcomes: {} }
  for (const row of entries) {
    counts.classifications[row.classification] = (counts.classifications[row.classification] ?? 0) + 1
    counts.outcomes[row.outcome] = (counts.outcomes[row.outcome] ?? 0) + 1
  }
  return { schema: REPORT_SCHEMA, repoId: index.repoId, root, coverage: index.coverage, counts, identityRule: 'UUIDv5(repoId namespace, unchanged POSIX relPath); preserve existing UUID', diagnostics: index.diagnostics, readDiagnostics: index.readDiagnostics, entries }
}

/** Only named rows apply, under the shared lock/journal. All selected hashes are
 * checked before mutation; retries accept exact after bytes. Unmanaged editors
 * retain the shared transaction's documented final-rename race. */
export async function applyPreview(root, report, selectedPaths) {
  root = resolve(root)
  if (report.schema !== REPORT_SCHEMA || report.root !== root) fail('Preview belongs to a different checkout or schema')
  if (!selectedPaths.length || new Set(selectedPaths).size !== selectedPaths.length) fail('Select one or more distinct exact file paths')
  if (report.coverage.status !== 'complete') fail('Incomplete inventory cannot be applied')
  await assertAssetPath(root, '.agents/.local/runs/.path-check')
  const lock = await acquireLock(root)
  try {
    for (const tx of await listPendingTx(root)) {
      if (!(await readCommitted(root, tx))?.committed) fail('Pending harness transaction requires recovery before migration')
    }
    const index = await buildNoteIndex(root)
    if (index.repoId !== report.repoId || index.coverage.status !== 'complete') fail('Repository identity or coverage changed')
    const files = []
    const results = []
    for (const path of [...selectedPaths].sort(compare)) {
      if (!/^\.agents\/notes\/.+\.md$/i.test(path) || path.includes('\\') || path.split('/').some((part) => ['.', '..', ''].includes(part))) fail('Invalid selection path: ' + path)
      await assertAssetPath(root, path)
      const rows = report.entries.filter((row) => row.relPath === path)
      if (rows.length !== 1) fail('Selection is absent or ambiguous: ' + path)
      const row = rows[0]
      if (!['ready', 'unchanged'].includes(row.outcome)) fail('Selection is blocked or is a helper: ' + path)
      if (typeof row.before !== 'string' || typeof row.after !== 'string' || hash(row.before) !== row.beforeHash || hash(row.after) !== row.afterHash) fail('Preview integrity mismatch: ' + path)
      const reproduced = previewNote({ repoId: report.repoId, relPath: path, raw: row.before, classification: row.classification, allowR5Repairs: true })
      if (reproduced.after !== row.after || reproduced.outcome !== row.outcome) fail('Preview is not reproducible: ' + path)
      const current = index.byPath.get(path)
      if (!current || current.classification === 'conflicting-identity') fail('Missing or conflicting current source: ' + path)
      const read = await readIndexedNote(index, path)
      if (!read.ok || !read.matchesSnapshot) fail('Source changed during apply: ' + path)
      if (read.sha256 === row.afterHash) { results.push({ relPath: path, status: 'unchanged' }); continue }
      if (read.sha256 !== row.beforeHash) fail('Stale preview: ' + path)
      const parsed = parseNote(row.after)
      const occupied = index.entries.filter((e) => e.relPath !== path && e.note?.meta.id === parsed.meta.id)
      if (occupied.length || files.some((f) => parseNote(f.after).meta.id === parsed.meta.id)) fail('Identity collision: ' + path)
      files.push({ path, before: row.beforeHash, after: row.after })
      results.push({ relPath: path, status: 'applied' })
    }
    if (files.length) await commitAssetFiles(root, files)
    for (const path of selectedPaths) {
      const row = report.entries.find((r) => r.relPath === path)
      if (sha256HexBytes(await readFile(resolve(root, path))) !== row.afterHash) fail('Post-apply hash mismatch: ' + path)
    }
    return { results }
  } finally { await releaseLock(root, lock) }
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: { root: { type: 'string', default: process.cwd() }, report: { type: 'string' }, apply: { type: 'string' }, select: { type: 'string', multiple: true }, help: { type: 'boolean' } } })
  if (values.help) return console.log('Preview: node scripts/migrate-agent-notes.mjs --report .agents/.local/r2-migration-preview.json\nApply reviewed selection: node scripts/migrate-agent-notes.mjs --apply .agents/.local/r2-migration-preview.json --select .agents/notes/path.md [--select ...]\nPreview is the default. No selection means no apply. Helpers and blocked rows never count as migrated.')
  const root = resolve(values.root)
  if (values.apply) {
    if (values.report) fail('--report and --apply are mutually exclusive')
    return console.log(JSON.stringify(await applyPreview(root, JSON.parse(await readFile(resolve(root, values.apply), 'utf8')), values.select ?? []), null, 2))
  }
  if (values.select) fail('--select requires --apply')
  const report = await inventoryNotes(root, { allowR5Repairs: true })
  if (values.report) {
    if (!/^\.agents\/\.local\/r[25]-migration-[\w.-]+\.json$/.test(values.report)) fail('Report path must be .agents/.local/r2-migration-*.json or r5-migration-*.json')
    for (const suffix of ['.agents', '.agents/.local', values.report]) {
      try {
        const stat = await lstat(resolve(root, suffix))
        if (stat.isSymbolicLink() || (suffix === values.report ? !stat.isFile() || stat.nlink > 1 : !stat.isDirectory())) fail('Linked or non-regular report path: ' + suffix)
      } catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    const path = resolve(root, values.report)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(report, null, 2) + '\n', 'utf8')
    console.log(JSON.stringify({ report: values.report, coverage: report.coverage.status, counts: report.counts }, null, 2))
  } else console.log(JSON.stringify(report, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 2 })
}
