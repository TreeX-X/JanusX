// Note: migration preserves source facts — see .agents/notes/2026-09-25-note-blueprint-r2-read--fa17e06b.md
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile, lstat } from 'node:fs/promises'
import { basename, dirname, resolve, relative, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { parseDocument, stringify } from 'yaml'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { parseNote, validateNote, readMarkdownView, splitFrontmatter, UUID_RE } from '@janus-agent/harness-core'
import { buildNoteIndex, readIndexedNote, sha256HexBytes, acquireLock, releaseLock, commitAssetFiles, assertAssetPath, listPendingTx, readCommitted } from '@janus-agent/harness-node'

export const REPORT_SCHEMA = 'r2-note-migration/1'
export const FLAT_REPORT_SCHEMA = 'r6-note-flat-migration/1'
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
export function sourceParts(raw) {
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

function flatName(relPath, raw) {
  const { meta } = parseNote(raw)
  // Preserve the human-authored date/topic instead of generating a title slug.
  const stem = basename(relPath, '.md').replace(/--[a-f0-9]{8}$/i, '')
  return stem + '--' + meta.id.slice(0, 8) + '.md'
}

/** Locate only CommonMark destinations, including image/reference definitions.
 * AST offsets keep code, labels, whitespace and optional titles byte-for-byte. */
export function markdownDestinations(body) {
  const rows = []
  function visit(node) {
    if (['link', 'image', 'definition'].includes(node.type)) {
      const start = node.position.start.offset
      const end = node.position.end.offset
      let cursor
      if (node.type === 'definition') {
        const prefix = /^ {0,3}\[(?:\\.|[^\]\\])*\]:\s*/.exec(body.slice(start, end))
        if (!prefix) fail('Cannot locate Markdown definition destination')
        cursor = start + prefix[0].length
      } else {
        const lastChild = node.children?.at(-1)?.position?.end.offset
        // Children end at the label boundary; images have no child nodes.
        let labelEnd
        if (lastChild !== undefined) labelEnd = body.indexOf('](', lastChild)
        else {
          let depth = 0
          for (let i = start + (node.type === 'image' ? 1 : 0); i < end; i++) {
            if (body[i] === '\\') { i++; continue }
            if (body[i] === '[') depth++
            if (body[i] === ']' && --depth === 0) { labelEnd = i; break }
          }
        }
        if (labelEnd === undefined || labelEnd < start || labelEnd >= end || body[labelEnd + 1] !== '(') {
          // Autolinks cannot be relative destinations.
          if (/^[a-z][a-z0-9+.-]*:/i.test(node.url)) return
          fail('Cannot locate Markdown link destination')
        }
        cursor = labelEnd + 2
        while (/\s/.test(body[cursor] ?? '') && cursor < end) cursor++
      }
      const angle = body[cursor] === '<'
      if (angle) cursor++
      const from = cursor
      let depth = 0
      while (cursor < end) {
        const ch = body[cursor]
        if (ch === '\\') { cursor += 2; continue }
        if (angle ? ch === '>' : /\s/.test(ch) || (ch === ')' && depth === 0)) break
        if (ch === '(') depth++
        if (ch === ')') depth--
        cursor++
      }
      rows.push({ destination: node.url, start: from, end: cursor, line: node.position.start.line })
    }
    for (const child of node.children ?? []) visit(child)
  }
  visit(fromMarkdown(body))
  return rows.sort((a, b) => a.start - b.start)
}

export function relativeLinkTarget(root, sourcePath, destination) {
  if (!destination || /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(destination)) return null
  const split = destination.search(/[?#]/)
  const path = split < 0 ? destination : destination.slice(0, split)
  if (!path) return null
  const decoded = decodeURIComponent(path)
  return resolve(path.startsWith('/') ? root : dirname(resolve(root, sourcePath)), decoded.replace(/^\/+/, ''))
}

export function rewriteRelativeLinks(raw, oldPath, newPath, map, root) {
  if (!root) fail('Explicit checkout root required for link rebasing')
  const parts = sourceParts(raw)
  let body = parts.body
  for (const link of markdownDestinations(body).reverse()) {
    const target = relativeLinkTarget(root, oldPath, link.destination)
    if (!target) continue
    const oldRel = relative(root, target).replaceAll('\\', '/')
    const mapped = map.get(oldRel)
    const rootRelative = link.destination.startsWith('/')
    if (rootRelative && !mapped) continue
    const next = rootRelative ? '/' + mapped : relative(dirname(resolve(root, newPath)), mapped ? resolve(root, mapped) : target).replaceAll('\\', '/')
    // Keep original query/fragment spelling, including Markdown entity escapes.
    const literal = body.slice(link.start, link.end)
    const split = literal.search(/[?#]/)
    const suffix = split < 0 ? '' : literal.slice(split)
    const prefix = rootRelative || next.startsWith('.') ? next : './' + next
    const dest = prefix.split('/').map(part => encodeURIComponent(part).replace(/[()]/g, ch => ch === '(' ? '%28' : '%29')).join('/') + suffix
    body = body.slice(0, link.start) + dest + body.slice(link.end)
  }
  return parts.prefix + body
}

/** Mechanical display cleanup only. Disposition prose remains a visible fact. */
export function normalizeNoteBody(raw) {
  const parts = sourceParts(raw)
  const lines = parts.body.split(/(?<=\n)/)
  const edits = []
  for (const h of readMarkdownView(parts.body).headings) {
    if (h.depth === 1 && /^Agent Note:\s*/.test(h.text)) {
      lines[h.line - 1] = lines[h.line - 1].replace(/^( {0,3}#\s+)Agent Note:\s*/, '$1')
      edits.push('Removed redundant Agent Note title prefix')
    }
  }
  const tree = fromMarkdown(parts.body)
  for (const node of tree.children) {
    if (node.type !== 'paragraph' || node.position.start.line !== node.position.end.line) continue
    const line = node.position.start.line - 1
    const match = /^Status:\s*(proposed|implemented|draft|accepted|archived|rejected)(?:\s*[\u2014\u2013-]\s*(.+))?\s*$/i.exec(lines[line].trim())
    if (!match) continue
    lines[line] = match[2] ? 'Historical disposition: ' + match[2].trim() + '\n' : ''
    edits.push(match[2] ? 'Retained Status reason as historical disposition' : 'Removed lifecycle duplicated by frontmatter')
  }
  return { raw: parts.prefix + lines.join(''), edits }
}

export function preserveOrganizationSource(raw, before, sourcePath, details = {}) {
  if (raw === before && !Object.keys(details).length) return raw
  const parts = sourceParts(raw)
  const doc = parseDocument(parts.fmText)
  if (doc.hasIn(['extensions', 'r6Organization'])) fail('Existing organization provenance requires explicit review')
  doc.setIn(['extensions', 'r6Organization'], {
    sourcePath, sourceHash: hash(before), originalSourceBase64: Buffer.from(before, 'utf8').toString('base64'),
    originalBodyHash: hash(sourceParts(before).body), ...details,
  })
  return (raw.startsWith('\uFEFF') ? '\uFEFF' : '') + '---\n' + doc.toString() + '---\n' + parts.body
}

/** Preview all Notes so inbound links in stationary files move with their targets. */
export async function flattenNotes(root = process.cwd(), options = {}) {
  root = resolve(root)
  const index = await buildNoteIndex(root)
  if (!index.repoId || index.coverage.status !== 'complete') fail('Incomplete inventory cannot be flattened')
  const map = new Map()
  const rows = []
  const destinations = new Set()
  for (const entry of index.entries) {
    const read = await readIndexedNote(index, entry.relPath)
    if (!read.ok || !read.matchesSnapshot || hash(read.text) !== read.sha256 || entry.classification !== 'valid') {
      rows.push({ oldPath: entry.relPath, status: 'blocked', reason: 'Valid, unchanged roundtrippable UTF-8 Note required' })
      continue
    }
    const next = entry.relPath.split('/').length > 3 ? '.agents/notes/' + flatName(entry.relPath, read.text) : entry.relPath
    if (destinations.has(next) || (next !== entry.relPath && index.byPath.has(next))) {
      rows.push({ oldPath: entry.relPath, newPath: next, status: 'blocked', reason: 'Destination collision' })
      continue
    }
    destinations.add(next)
    map.set(entry.relPath, next)
    rows.push({ oldPath: entry.relPath, newPath: next, id: entry.note.meta.id, before: read.text, beforeHash: read.sha256 })
  }
  for (const row of rows.filter(row => !row.status)) {
    const rewritten = rewriteRelativeLinks(row.before, row.oldPath, row.newPath, map, root)
    row.after = rewritten !== row.before || row.oldPath !== row.newPath
      ? preserveOrganizationSource(rewritten, row.before, row.oldPath, { operation: 'flatten' }) : row.before
    row.afterHash = hash(row.after)
    row.status = row.oldPath !== row.newPath || row.before !== row.after ? 'ready' : 'unchanged'
  }
  const report = { schema: FLAT_REPORT_SCHEMA, root, repoId: index.repoId, coverage: index.coverage,
    counts: { total: rows.length, nested: rows.filter(r => r.oldPath.split('/').length > 3).length,
      ready: rows.filter(r => r.status === 'ready').length, blocked: rows.filter(r => r.status === 'blocked').length }, rows }
  if (options.apply) await applyFlattenPreview(root, report)
  return report
}

/** Creates and deletes share one recoverable journal; all expected bytes are checked
 * before staging. Unmanaged writers retain the shared writer's final-rename race. */
export async function applyFlattenPreview(root, report) {
  root = resolve(root)
  if (report.schema !== FLAT_REPORT_SCHEMA || report.root !== root || report.coverage.status !== 'complete') fail('Invalid flatten preview checkout or coverage')
  if (report.rows.some(row => row.status === 'blocked')) fail('Flatten inventory contains blocked rows')
  await assertAssetPath(root, '.agents/.local/runs/.path-check')
  const lock = await acquireLock(root)
  try {
    for (const tx of await listPendingTx(root)) {
      if (!(await readCommitted(root, tx))?.committed) fail('Pending harness transaction requires recovery before migration')
    }
    const index = await buildNoteIndex(root)
    if (index.repoId !== report.repoId || index.coverage.status !== 'complete') fail('Repository identity or coverage changed')
    const files = []
    const occupied = new Set()
    for (const row of report.rows) {
      await assertAssetPath(root, row.oldPath)
      await assertAssetPath(root, row.newPath)
      if (occupied.has(row.newPath)) fail('Destination collision: ' + row.newPath)
      occupied.add(row.newPath)
      if (hash(row.before) !== row.beforeHash || hash(row.after) !== row.afterHash) fail('Preview integrity mismatch')
      const note = parseNote(row.after)
      if (validateNote(note).length || note.meta.id !== row.id) fail('Invalid output Note or identity')
      const prior = parseNote(row.before)
      for (const key of ['id', 'created', 'parent', 'relations', 'codeRefs', 'work', 'execution', 'repositories', 'interfaces']) {
        if (!equal(prior.meta[key], note.meta[key])) fail('Protected metadata changed: ' + key)
      }
      if (index.byPath.get(row.oldPath)?.classification !== 'valid') fail('Missing or conflicting current source: ' + row.oldPath)
      const current = await readFile(resolve(root, row.oldPath))
      if (sha256HexBytes(current) !== row.beforeHash || !current.equals(Buffer.from(current.toString('utf8'), 'utf8'))) fail('Source conflict: ' + row.oldPath)
      if (row.oldPath !== row.newPath) {
        try { await lstat(resolve(root, row.newPath)); fail('Destination collision: ' + row.newPath) } catch (e) { if (e.code !== 'ENOENT') throw e }
        files.push({ path: row.newPath, before: null, after: row.after })
      } else if (row.beforeHash !== row.afterHash) files.push({ path: row.oldPath, before: row.beforeHash, after: row.after })
    }
    for (const row of report.rows.filter(row => row.oldPath !== row.newPath)) files.push({ path: row.oldPath, before: row.beforeHash, after: null })
    if (files.length) await commitAssetFiles(root, files)
    for (const row of report.rows) {
      if (sha256HexBytes(await readFile(resolve(root, row.newPath))) !== row.afterHash) fail('Post-apply hash mismatch: ' + row.newPath)
    }
    return { changed: report.rows.filter(row => row.oldPath !== row.newPath || row.beforeHash !== row.afterHash).length }
  } finally { await releaseLock(root, lock) }
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: { root: { type: 'string', default: process.cwd() }, report: { type: 'string' }, apply: { type: 'string' }, select: { type: 'string', multiple: true }, flatten: { type: 'boolean' }, commit: { type: 'boolean' }, help: { type: 'boolean' } } })
  if (values.help) return console.log('Preview: node scripts/migrate-agent-notes.mjs --report .agents/.local/r2-migration-preview.json\nApply reviewed selection: node scripts/migrate-agent-notes.mjs --apply .agents/.local/r2-migration-preview.json --select .agents/notes/path.md [--select ...]\nFlatten preview: node scripts/migrate-agent-notes.mjs --root CHECKOUT --flatten [--report .agents/.local/r6-preview.json]\nApply flatten: node scripts/migrate-agent-notes.mjs --root CHECKOUT --flatten --commit\nPreview is the default; --commit requires --flatten. Helpers and blocked rows never count as migrated.')
  if (values.commit && !values.flatten) fail('--commit requires --flatten')
  if (values.flatten && (values.apply || values.select)) fail('--flatten cannot be combined with --apply/--select')
  const root = resolve(values.root)
  if (values.flatten) {
    const report = await flattenNotes(root)
    if (values.report) {
      const relPath = relative(root, resolve(root, values.report)).replaceAll('\\', '/')
      if (!/^\.agents\/\.local\/r6-[\w.-]+\.json$/.test(relPath)) fail('Flatten report must be .agents/.local/r6-*.json inside the checkout')
      for (const path of ['.agents', '.agents/.local', relPath]) {
        try {
          const stat = await lstat(resolve(root, path))
          if (stat.isSymbolicLink() || (path === relPath ? !stat.isFile() || stat.nlink > 1 : !stat.isDirectory())) fail('Linked or non-regular report path: ' + path)
        } catch (error) { if (error.code !== 'ENOENT') throw error }
      }
      await mkdir(resolve(root, '.agents/.local'), { recursive: true })
      await writeFile(resolve(root, relPath), JSON.stringify(report, null, 2) + '\n', 'utf8')
    }
    if (values.commit) await applyFlattenPreview(root, report)
    return console.log(JSON.stringify({ schema: report.schema, counts: report.counts, report: values.report ?? null, applied: values.commit === true }, null, 2))
  }
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
