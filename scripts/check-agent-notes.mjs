// Note: mechanical noteX gate lives here — see .agents/notes/implemented/process/2026-09-19-note-mechanical-checks.md
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const LIFECYCLES = ['proposed', 'implemented', 'rejected', 'archived']
export const CLASSES = ['feature', 'bug-fix', 'architecture', 'process', 'testing', 'simplification']

// Grandfathered history: literal version pins predate the mechanical gate.
// Clean at S9 cutover; new notes must not add entries here.
export const VERSION_ALLOWLIST = new Set([
  'implemented/bug-fix/2026-09-14-adhoc-shell-parity.md',
  'implemented/process/2026-09-17-github-maintenance.md',
])

const FILENAME_RE = /^(\d{4})-(\d{2})-(\d{2})-(.+)\.md$/
const PAT_PARENT_CHILD = /\b(parent|child)\s*(#\d+|\d+\.\d+|no\.?\s*\d+|§\s*\d+)/i
const PAT_PR = /\bPR\s*#?\d+/
const PAT_VERSION = /\bv\d+(\.\d+)+/i

const REQUIRED_BY_LIFECYCLE = {
  proposed: ['## Problem', '## Proposal', '## Alternatives considered', '## Acceptance criteria', '## Risks'],
  implemented: ['## Problem', '## Decision', '## Alternatives considered', '## Consequences'],
  rejected: ['## Problem', '## Proposal', '## Alternatives considered', '## Acceptance criteria', '## Risks'],
  archived: null, // frozen read-only: shape not re-checked
}

const FORBIDDEN_BY_LIFECYCLE = {
  implemented: ['## Proposal', '## Plan', '## Acceptance criteria'],
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(p)
  }
  return out
}

function isHarnessNote(text) {
  if (!text.startsWith('---')) return false
  const end = text.indexOf('\n---', 3)
  if (end === -1) return false
  return /schema\s*:\s*harness-note\//.test(text.slice(0, end))
}

function parseSections(text) {
  const sections = []
  for (const line of text.split('\n')) {
    const m = line.match(/^(#{2,3})\s+(.+?)\s*$/)
    if (m) sections.push(m[2].trim())
  }
  return sections
}

function extractLinks(text) {
  const links = []
  const re = /\[([^\]]*)\]\(([^)]+)\)/g
  let m
  while ((m = re.exec(text))) links.push(m[2].trim())
  return links
}

export function checkNotes(root = process.cwd()) {
  const notesDir = join(root, '.agents', 'notes')
  const errors = []
  if (!existsSync(notesDir)) return { errors: ['missing .agents/notes directory'], checked: 0 }

  const files = walk(notesDir)
  for (const f of files) {
    if (f.endsWith('INDEX.md')) {
      errors.push(`${rel(root, f)}: INDEX.md is forbidden (paths are the index)`)
      continue
    }
  }

  let checked = 0
  for (const file of files) {
    const relPath = rel(root, file)
    if (!relPath.startsWith('.agents/notes/')) continue
    const rest = relPath.slice('.agents/notes/'.length)
    const parts = rest.split('/')
    const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')

    // New-shape harness assets are validated by harness-core unit tests, not this gate.
    if (isHarnessNote(text)) continue

    if (parts.length !== 3) {
      errors.push(`${relPath}: path depth must be .agents/notes/{lifecycle}/{class}/file.md`)
      continue
    }
    const [lifecycle, cls, name] = parts
    if (!LIFECYCLES.includes(lifecycle)) {
      errors.push(`${relPath}: unknown lifecycle ${lifecycle}`)
      continue
    }
    if (!CLASSES.includes(cls)) {
      errors.push(`${relPath}: unknown class ${cls}`)
      continue
    }
    const fm = name.match(FILENAME_RE)
    if (!fm) {
      errors.push(`${relPath}: filename must be yyyy-mm-dd-topic.md`)
      continue
    }
    const [, y, mo, d] = fm
    const dt = new Date(Number(y), Number(mo) - 1, Number(d))
    if (dt.getFullYear() !== Number(y) || dt.getMonth() !== Number(mo) - 1 || dt.getDate() !== Number(d)) {
      errors.push(`${relPath}: filename date is not a real calendar date`)
    }

    checked += 1
    const lines = text.split('\n')

    // Header three lines.
    if (!lines[0]?.startsWith('# Agent Note:') || !lines[0].slice('# Agent Note:'.length).trim() || /<title>/.test(lines[0])) {
      errors.push(`${relPath}: line 1 must be '# Agent Note: <title>'`)
    }
    if (lines[1] !== '') errors.push(`${relPath}: line 2 must be blank`)
    const statusLine = lines[2] ?? ''
    if (!statusLine.startsWith('Status:')) errors.push(`${relPath}: line 3 must be a single Status: line`)

    // Status-folder match (archived is frozen: original status preserved).
    if (lifecycle !== 'archived') {
      const status = statusLine.slice('Status:'.length).trim()
      if (lifecycle === 'proposed' && status !== 'proposed') errors.push(`${relPath}: Status must be 'proposed'`)
      if (lifecycle === 'implemented' && status !== 'implemented') errors.push(`${relPath}: Status must be 'implemented'`)
      if (lifecycle === 'rejected' && !/^rejected\s+—\s+.+/.test(status)) {
        errors.push(`${relPath}: Status must be 'rejected — <one-line reason>'`)
      }
    }

    // ## Problem first.
    const sections = parseSections(text)
    const h2 = sections.filter((s) => text.includes(`## ${s}`))
    if (h2[0] !== 'Problem') errors.push(`${relPath}: ## Problem must be the first section`)

    // Required / forbidden sections.
    const required = REQUIRED_BY_LIFECYCLE[lifecycle]
    if (required) {
      for (const r of required) {
        if (!text.includes(r)) errors.push(`${relPath}: missing required section ${r}`)
      }
    }
    for (const fsec of FORBIDDEN_BY_LIFECYCLE[lifecycle] ?? []) {
      if (text.includes(fsec)) errors.push(`${relPath}: forbidden section ${fsec} in implemented/`)
    }
    if (lifecycle !== 'archived' && !text.includes('## Alternatives considered')) {
      errors.push(`${relPath}: missing ## Alternatives considered`)
    }

    // Relative links resolve (in-repo only; sibling-checkout links can't verify here).
    const noteDir = dirname(file)
    const repoRoot = resolve(root)
    for (const target of extractLinks(text)) {
      if (/^(https?:|note:\/\/|#|mailto:)/i.test(target)) continue
      const bare = target.split('#')[0].trim()
      if (!bare || !bare.includes('.md')) continue
      if (/^[a-zA-Z]+:/.test(bare)) continue
      const abs = normalize(resolve(noteDir, bare))
      if (!abs.startsWith(repoRoot)) continue
      if (!existsSync(abs)) errors.push(`${relPath}: broken relative link ${target}`)
    }

    // Provenance pins: no Parent/Child numbers, PR numbers, version pins.
    const body = lines.slice(3).join('\n')
    if (lifecycle === 'implemented') {
      if (PAT_PARENT_CHILD.test(body)) errors.push(`${relPath}: implemented/ must not reference Parent/Child numbers`)
      if (PAT_PR.test(body)) errors.push(`${relPath}: implemented/ must not reference PR numbers`)
      const short = relPath.slice('.agents/notes/'.length)
      if (!VERSION_ALLOWLIST.has(short) && PAT_VERSION.test(body)) {
        errors.push(`${relPath}: implemented/ must not pin v<digit> versions (provenance lives in the commit)`)
      }
    }
  }

  return { errors, checked }
}

function rel(root, abs) {
  const r = abs.replace(/\\/g, '/')
  const b = root.replace(/\\/g, '/')
  return r.startsWith(b) ? r.slice(b.length).replace(/^\//, '') : r
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { errors, checked } = checkNotes()
  if (errors.length) {
    console.error(`agent-notes check failed (${checked} notes, ${errors.length} errors):`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exitCode = 1
  } else {
    console.log(`Agent notes verified: ${checked} old-shape notes, 0 errors (harness-note/1 files covered by unit tests).`)
  }
}
