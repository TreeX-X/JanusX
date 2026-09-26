import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildNoteIndex, type NoteIndex } from '@janus-agent/harness-node'
import { patchNoteIndex, probeChangedPaths } from '../../src/main/notes/note-index-patch'
import { toSlimSnapshot } from '../../src/main/notes/note-provider'

const REPO = '972afef3-2fc7-49de-a3ee-7e041225d28c'

function note(id: string, title: string, extra = '', relations = ''): string {
  return `---
schema: harness-note/1
id: ${id}
kind: decision
lifecycle: implemented
created: 2026-09-26
class: architecture
${relations}---
# ${title}

## Problem

Problem of ${title}.

## Decision

Decision of ${title}.

## Alternatives considered

- Do nothing / reuse: staying put keeps scope minimal.

## Consequences

- **Gains**: ${extra || 'none'}
`
}

function setup(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'janusx-patch-'))
  mkdirSync(join(root, '.agents', 'notes'), { recursive: true })
  writeFileSync(join(root, '.agents', 'harness.json'), JSON.stringify({ schemaVersion: 1, repoId: REPO, name: 'PatchTest' }))
  const a = 'aaaaaaaa-0000-4000-8000-000000000001'
  const b = 'bbbbbbbb-0000-4000-8000-000000000002'
  const c = 'cccccccc-0000-4000-8000-000000000003'
  writeFileSync(join(root, '.agents', 'notes', '2026-09-26-alpha--aaaaaaaa.md'), note(a, 'Alpha'))
  writeFileSync(
    join(root, '.agents', 'notes', '2026-09-26-beta--bbbbbbbb.md'),
    note(b, 'Beta', '', `parent: note://${REPO}/${a}\n`),
  )
  writeFileSync(
    join(root, '.agents', 'notes', '2026-09-26-gamma--cccccccc.md'),
    note(c, 'Gamma mentions [Alpha](./2026-09-26-alpha--aaaaaaaa.md)'),
  )
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

function digest(index: NoteIndex): unknown {
  return {
    entries: index.entries.map((e) => [e.relPath, e.classification, e.sourceHash, e.note?.meta.id ?? null]),
    relations: index.relations,
    mentions: index.mentions,
    snapshotHash: index.coverage.snapshotHash,
    status: index.coverage.status,
    diagnostics: index.diagnostics.length,
    readDiagnostics: index.readDiagnostics.length,
    byId: [...index.byId.keys()].sort(),
    byUri: [...index.byUri.keys()].sort(),
    byPath: [...index.byPath.keys()].sort(),
  }
}

describe('incremental note-index patch', () => {
  it('reports no changes on a quiet checkout', async () => {
    const { root, cleanup } = setup()
    try {
      const index = await buildNoteIndex(root)
      const probe = await probeChangedPaths(root, index)
      expect(probe.changed).toEqual([])
      expect(probe.removed).toEqual([])
      expect(probe.complete).toBe(true)
    } finally {
      cleanup()
    }
  })

  it('matches a fresh full build after edit, add, and remove', async () => {
    const { root, cleanup } = setup()
    try {
      const before = await buildNoteIndex(root)
      const d = 'dddddddd-0000-4000-8000-000000000004'
      writeFileSync(
        join(root, '.agents', 'notes', '2026-09-26-beta--bbbbbbbb.md'),
        note('bbbbbbbb-0000-4000-8000-000000000002', 'Beta revised', 'more gains'),
      )
      writeFileSync(join(root, '.agents', 'notes', '2026-09-26-delta--dddddddd.md'), note(d, 'Delta'))
      rmSync(join(root, '.agents', 'notes', '2026-09-26-gamma--cccccccc.md'))
      const probe = await probeChangedPaths(root, before)
      expect([...probe.changed].sort()).toEqual([
        '2026-09-26-beta--bbbbbbbb.md',
        '2026-09-26-delta--dddddddd.md',
      ].map((f) => `.agents/notes/${f}`).sort())
      expect(probe.removed).toEqual(['.agents/notes/2026-09-26-gamma--cccccccc.md'])
      const { index: patched, events } = await patchNoteIndex(root, before, probe.changed, probe.removed, probe.scanDiagnostics)
      expect(events).toHaveLength(3)
      const fresh = await buildNoteIndex(root)
      expect(digest(patched)).toEqual(digest(fresh))
    } finally {
      cleanup()
    }
  })

  it('classifies a broken edit as invalid without losing the file', async () => {
    const { root, cleanup } = setup()
    try {
      const before = await buildNoteIndex(root)
      writeFileSync(join(root, '.agents', 'notes', '2026-09-26-alpha--aaaaaaaa.md'), '---\nschema: harness-note/1\nid: not-a-uuid\nkind: decision\nlifecycle: implemented\ncreated: 2026-09-26\n---\n# Broken\n')
      const probe = await probeChangedPaths(root, before)
      expect(probe.changed).toEqual(['.agents/notes/2026-09-26-alpha--aaaaaaaa.md'])
      const { index: patched, events } = await patchNoteIndex(root, before, probe.changed, probe.removed, probe.scanDiagnostics)
      expect(events[0].type).toBe('invalid')
      const fresh = await buildNoteIndex(root)
      expect(digest(patched)).toEqual(digest(fresh))
    } finally {
      cleanup()
    }
  })

  it('slim snapshots drop bodies but keep navigation', async () => {
    const { root, cleanup } = setup()
    try {
      const index = await buildNoteIndex(root)
      const slim = toSlimSnapshot(index)
      expect(slim.slim).toBe(true)
      expect(slim.entries.length).toBe(index.entries.length)
      expect(slim.relations).toEqual(index.relations)
      expect(slim.mentions).toEqual(index.mentions)
      for (const entry of slim.entries) {
        expect(entry.doc?.body).toBeUndefined()
        expect(entry.doc?.sections).toEqual([])
        expect(entry.doc?.title).toBeTruthy()
      }
    } finally {
      cleanup()
    }
  })
})
