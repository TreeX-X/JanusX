import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkNotes } from '../../scripts/check-agent-notes.mjs'
import { checkSkillsSync, normalizeSkillText } from '../../scripts/check-skills-sync.mjs'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true })
})

async function makeTree(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), 'notes-check-'))
  roots.push(root)
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel)
    await fs.mkdir(join(abs, '..'), { recursive: true })
    await fs.writeFile(abs, body)
  }
  return root
}

const GOOD_IMPLEMENTED = [
  '# Agent Note: Good',
  '',
  'Status: implemented',
  '',
  '## Problem',
  'P.',
  '',
  '## Decision',
  'D.',
  '',
  '## Alternatives considered',
  '- Do nothing / reuse — not viable.',
  '',
  '## Consequences',
  '- **Gains**: x.',
  '- **Costs and limits**: y.',
  '',
].join('\n')

describe('agent-notes mechanical gate', () => {
  it('passes the real repo with zero errors', () => {
    const { errors, checked } = checkNotes(process.cwd())
    expect(errors).toEqual([])
    expect(checked).toBeGreaterThan(0)
  })

  it('flags path, header, section, link, and version violations', async () => {
    const root = await makeTree({
      '.agents/notes/implemented/feature/2026-09-19-good.md': GOOD_IMPLEMENTED,
      '.agents/notes/implemented/feature/bad-name.md': GOOD_IMPLEMENTED,
      '.agents/notes/implemented/feature/2026-09-19-no-alt.md': GOOD_IMPLEMENTED.replace('## Alternatives considered', '## Something else'),
      '.agents/notes/implemented/feature/2026-09-19-bad-link.md': GOOD_IMPLEMENTED.replace(
        '- Do nothing / reuse — not viable.',
        '- Do nothing / reuse — not viable. See [ghost](./2026-01-01-ghost.md).',
      ),
      '.agents/notes/implemented/feature/2026-09-19-pinned.md': GOOD_IMPLEMENTED.replace(
        '## Decision\nD.',
        '## Decision\nShipped in v1.2.3.',
      ),
      '.agents/notes/implemented/feature/2026-09-19-wrong-status.md': GOOD_IMPLEMENTED.replace('Status: implemented', 'Status: proposed'),
    })
    const { errors } = checkNotes(root)
    const joined = errors.join('\n')
    expect(joined).toMatch('bad-name.md: filename must be')
    expect(joined).toMatch('no-alt.md: missing required section ## Alternatives considered')
    expect(joined).toMatch('bad-link.md: broken relative link')
    expect(joined).toMatch('pinned.md: implemented/ must not pin')
    expect(joined).toMatch("wrong-status.md: Status must be 'implemented'")
  })

  it('skips harness-note/1 frontmatter (covered by harness-core tests)', async () => {
    const root = await makeTree({
      '.agents/notes/2026-09-19-t--33333333.md': [
        '---',
        'schema: harness-note/1',
        'id: 33333333-3333-4333-8333-333333333333',
        'kind: requirement',
        'lifecycle: proposed',
        'created: 2026-09-16',
        '---',
        '',
        '# Anything goes here',
        '',
      ].join('\n'),
    })
    expect(checkNotes(root).errors).toEqual([])
  })
})

describe('skills-sync gate', () => {
  it('compares matching host skills without requiring personal checkout files', async () => {
    const root = await makeTree({
      '.claude/skills/example/SKILL.md': 'Read .claude/skills/example/guide.md and CLAUDE.md.\n',
      '.codex/skills/example/SKILL.md': 'Read .codex/skills/example/guide.md and AGENTS.md.\n',
    })
    const { errors, compared } = checkSkillsSync(root)
    expect(errors).toEqual([])
    expect(compared).toBe(1)
  })

  it('reports missing hosts and logic drift as failures', async () => {
    const missing = await makeTree({ '.claude/skills/example/SKILL.md': 'A' })
    expect(checkSkillsSync(missing).errors).toContain('missing .codex/skills directory')
    const drift = await makeTree({
      '.claude/skills/example/SKILL.md': 'A',
      '.codex/skills/example/SKILL.md': 'B',
    })
    expect(checkSkillsSync(drift).errors.join('\n')).toContain('logic drift')
  })

  it('normalizes host paths before comparing', () => {
    expect(normalizeSkillText('see .claude/skills/noteX/SKILL.md and CLAUDE.md')).toBe('see .codex/skills/noteX/SKILL.md and AGENTS.md')
  })
})
