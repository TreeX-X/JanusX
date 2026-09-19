// Note: dual-end sync gate lives here — see .agents/notes/implemented/process/2026-09-19-note-mechanical-checks.md
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join as joinPath } from 'node:path'

function listMd(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = joinPath(dir, entry.name)
    if (entry.isDirectory()) listMd(p, base, out)
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(p.slice(base.length).replace(/\\/g, '/').replace(/^\//, ''))
  }
  return out
}

// Host-specific files: same contract, different surface wording. Checked for
// host markers instead of byte equality.
const HOST_SPECIFIC = new Set(['orchestrateX/modules/09-dispatch-adapter.md'])
// Known single-end modules (warn only, not drift).
const SINGLE_END_ALLOWLIST = new Set(['orchestrateX/modules/05-parallel-setup.md'])

export function normalizeSkillText(text) {
  return text
    .replace(/\.claude\/skills\//g, '.codex/skills/')
    .replace(/\.codex\/skills\//g, '.codex/skills/')
    .replace(/\.claude\//g, '.codex/')
    .replace(/CLAUDE\.md/g, 'AGENTS.md')
    .replace(/\r\n/g, '\n')
    .trimEnd()
}

export function checkSkillsSync(root = process.cwd()) {
  const errors = []
  const warnings = []
  const claudeDir = joinPath(root, '.claude', 'skills')
  const codexDir = joinPath(root, '.codex', 'skills')
  if (!existsSync(claudeDir)) errors.push('missing .claude/skills directory')
  if (!existsSync(codexDir)) errors.push('missing .codex/skills directory')
  if (errors.length) return { errors, warnings, compared: 0 }

  const claudeSkills = new Set(readdirSync(claudeDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name))
  const codexSkills = new Set(readdirSync(codexDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name))

  for (const name of [...claudeSkills].filter((s) => !codexSkills.has(s))) warnings.push(`skill ${name}/ exists only in .claude (no dual-end check)`)
  for (const name of [...codexSkills].filter((s) => !claudeSkills.has(s))) warnings.push(`skill ${name}/ exists only in .codex (no dual-end check)`)

  let compared = 0
  for (const name of [...claudeSkills].filter((s) => codexSkills.has(s))) {
    const claudeFiles = listMd(joinPath(claudeDir, name))
    const codexFiles = new Set(listMd(joinPath(codexDir, name)))
    for (const rel of claudeFiles) {
      const key = `${name}/${rel}`
      if (HOST_SPECIFIC.has(key)) {
        compared += 1
        const a = readFileSync(joinPath(claudeDir, name, rel), 'utf8')
        const b = readFileSync(joinPath(codexDir, name, rel), 'utf8')
        if (!/Claude/i.test(a)) errors.push(`skill ${key}: .claude copy lost its Claude host marker`)
        if (!/Codex/i.test(b)) errors.push(`skill ${key}: .codex copy lost its Codex host marker`)
        if (!/dispatch/i.test(a) || !/dispatch/i.test(b)) errors.push(`skill ${key}: host adapter lost dispatch content`)
        continue
      }
      if (!codexFiles.has(rel)) {
        if (SINGLE_END_ALLOWLIST.has(key)) {
          warnings.push(`skill ${key}: single-end module, .codex copy intentionally absent`)
          continue
        }
        errors.push(`skill ${name}/${rel}: missing in .codex copy`)
        continue
      }
      compared += 1
      const a = normalizeSkillText(readFileSync(joinPath(claudeDir, name, rel), 'utf8'))
      const b = normalizeSkillText(readFileSync(joinPath(codexDir, name, rel), 'utf8'))
      if (a !== b) {
        const al = a.split('\n')
        const bl = b.split('\n')
        let line = 0
        while (line < Math.min(al.length, bl.length) && al[line] === bl[line]) line += 1
        errors.push(
          `skill ${name}/${rel}: logic drift (first diff at line ${line + 1}: .claude=${JSON.stringify(al[line] ?? '')} .codex=${JSON.stringify(bl[line] ?? '')})`,
        )
      }
    }
    for (const rel of [...codexFiles].filter((f) => !claudeFiles.includes(f))) {
      errors.push(`skill ${name}/${rel}: missing in .claude copy`)
    }
  }

  return { errors, warnings, compared }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { errors, warnings, compared } = checkSkillsSync()
  for (const w of warnings) console.warn(`warn: ${w}`)
  if (errors.length) {
    console.error(`skills-sync check failed (${compared} files, ${errors.length} errors):`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exitCode = 1
  } else {
    console.log(`Skills sync verified: ${compared} shared files identical (paths normalized).`)
  }
}
