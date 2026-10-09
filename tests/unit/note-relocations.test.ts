// Note: migration-chain validation — see .agents/notes/blueprint/module-responsibilities.md
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { checkNotes } from '../../scripts/check-agent-notes.mjs'
import { readNoteRelocations, resolveNoteRelocation } from '../../scripts/note-relocations.mjs'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const id = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`
const note = (n: number, body: string) => `---\n${JSON.stringify({ schema: 'harness-note/2', id: id(n), kind: 'note', lifecycle: 'accepted', created: '2026-10-08', updated: '2026-10-08T00:00:00Z', module: `note://${id(9)}/${id(8)}` })}\n---\n# Source\n\n${body}\n`
const oldPath = '.agents/notes/old.md', intermediate = '.agents/notes/area/topic.md', target = '.agents/notes/area/child/topic.md', protectedPath = '.agents/notes/protected.md'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'note-relocations-')); roots.push(root)
  const protectedText = note(1, '[Original](./old.md)')
  const files = {
    [protectedPath]: protectedText,
    [target]: note(2, 'Moved source.'),
    'docs/migrations/note-v2.json': JSON.stringify({ sources: [{ source: oldPath, target: intermediate, id: id(2), created: '2026-10-08' }], deferred: [{ path: protectedPath, sha256: createHash('sha256').update(protectedText).digest('hex') }] }),
    'docs/migrations/note-responsibilities.json': JSON.stringify({ sources: [{ source: intermediate, target }] }),
  }
  for (const [path, raw] of Object.entries(files)) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), raw) }
  return root
}

it('allows an exact protected source through historical relocation with matching target identity', async () => {
  const root = await fixture(), result = checkNotes(root)
  expect(resolveNoteRelocation(intermediate, readNoteRelocations(root))).toBe(target)
  expect(result.errors).toEqual([])
  expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'protected-migrated-link', target })])
})

it.each(['missing', 'identity', 'date', 'source', 'unmapped'] as const)('rejects the %s case without widening protected-link exceptions', async mode => {
  const root = await fixture()
  if (mode === 'missing') await rm(join(root, target))
  if (mode === 'identity') await writeFile(join(root, target), note(3, 'Wrong identity.'))
  if (mode === 'date') await writeFile(join(root, target), note(2, 'Changed date.').replace('"created":"2026-10-08"', '"created":"2026-10-07"'))
  if (mode === 'source') await writeFile(join(root, protectedPath), note(1, '[Original](./old.md)\nEdited source.'))
  if (mode === 'unmapped') await writeFile(join(root, 'docs/migrations/note-v2.json'), JSON.stringify({ sources: [], deferred: [{ path: protectedPath, sha256: createHash('sha256').update(note(1, '[Original](./old.md)')).digest('hex') }] }))
  expect(checkNotes(root).errors.join('\n')).toContain('broken relative link ./old.md')
})

it('rejects cycles, case collisions and escaping paths in relocation evidence', async () => {
  const root = await fixture()
  for (const sources of [
    [{ source: intermediate, target }, { source: target, target: intermediate }],
    [{ source: intermediate, target }, { source: oldPath, target: target.replace('topic', 'TOPIC') }],
    [{ source: intermediate, target: '.agents/notes/../../outside.md' }],
  ]) {
    await writeFile(join(root, 'docs/migrations/note-responsibilities.json'), JSON.stringify({ sources }))
    expect(() => readNoteRelocations(root)).toThrow()
  }
})
