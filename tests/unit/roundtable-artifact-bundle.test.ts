import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseNote, validateChangeSet, validateNote } from '@janus-agent/harness-core'
import { HarnessNoteService } from '../../src/main/harness/service'
import { RoundtableStore } from '../../src/main/roundtable/store'
import { buildArtifactBundle, snapshotSourceFacts } from '../../src/main/roundtable/artifact-bundle'
import type { RoundtableFact } from '../../src/shared/roundtable/events'

const REPO = '8fa19f17-c717-43a8-93a7-810a5e0cbc91'

function fact(partial: Partial<RoundtableFact> & { id: string }): RoundtableFact {
  return {
    kind: 'requirement',
    status: 'confirmed',
    title: `Title ${partial.id}`,
    content: `Content ${partial.id}.`,
    sourceEventIds: [`e-${partial.id}`],
    updatedAt: '2026-09-16T00:00:00.000Z',
    ...partial,
  }
}

async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), 'harness-s5-'))
  await fs.mkdir(join(root, '.agents', 'notes'), { recursive: true })
  await fs.writeFile(
    join(root, '.agents', 'harness.json'),
    JSON.stringify({ schemaVersion: 1, repoId: REPO, name: 'S5' }),
  )
  return root
}

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) {
    const svc = new HarnessNoteService()
    svc.unwatchAll()
    await fs.rm(root, { recursive: true, force: true })
  }
})

const BASE = { sessionId: 's5-session', roundNumber: 3, repoId: REPO }

describe('roundtable artifact bundle (S5)', () => {
  it('maps each fact to one validated note with full coverage (F05)', () => {
    const { bundle, diagnostics } = buildArtifactBundle({
      ...BASE,
      items: [
        { fact: fact({ id: 'f-req', kind: 'requirement' }) },
        { fact: fact({ id: 'f-sol', kind: 'solution' }) },
        { fact: fact({ id: 'f-act', kind: 'action' }) },
        { fact: fact({ id: 'f-ev', kind: 'evidence' }) },
        { fact: fact({ id: 'f-q', kind: 'question' }) },
      ],
    })
    expect(diagnostics).toEqual([])
    expect(bundle.schema).toBe('harness-bundle/1')
    expect(bundle.producer).toMatchObject({ type: 'roundtable', id: 's5-session', revision: 3 })
    expect(bundle.artifacts).toHaveLength(5)
    for (const artifact of bundle.artifacts) {
      expect(artifact).not.toHaveProperty('afterMarkdown')
      expect(artifact.sourceRefs).toHaveLength(1)
    }
    expect(validateChangeSet(bundle.changeSet)).toEqual([])
    // Every selected fact is covered; nothing merges silently.
    expect(bundle.coverage.filter((c) => c.status === 'covered')).toHaveLength(5)
    const kinds = bundle.changeSet.operations.map((op) => parseNote(op.afterMarkdown!).meta.kind)
    expect(kinds).toEqual(['requirement', 'decision', 'task', 'idea', 'idea'])
    for (const op of bundle.changeSet.operations) {
      expect(validateNote(parseNote(op.afterMarkdown!))).toEqual([])
    }
    const lifecycles = bundle.changeSet.operations.map((op) => parseNote(op.afterMarkdown!).meta.lifecycle)
    expect(lifecycles).toEqual(['proposed', 'proposed', 'draft', 'draft', 'draft'])
  })

  it('keeps exclusions explicit and refuses silent or empty input', () => {
    const kept = buildArtifactBundle({ ...BASE, items: [{ fact: fact({ id: 'f1' }), exclude: { reason: 'out of scope this round' } }] })
    // An all-excluded selection carries no deliverable; the empty changeset
    // validator says so instead of persisting an applicable-looking bundle.
    expect(kept.diagnostics.some((d) => d.path === 'operations')).toBe(true)
    expect(kept.bundle.coverage).toMatchObject([{ sourceRef: 'f1', status: 'excluded' }])
    expect(kept.bundle.changeSet.operations).toHaveLength(0)

    const noReason = buildArtifactBundle({ ...BASE, items: [{ fact: fact({ id: 'f1' }), exclude: { reason: '  ' } }] })
    expect(noReason.diagnostics.some((d) => d.path === 'items[0].exclude.reason')).toBe(true)

    const dup = buildArtifactBundle({ ...BASE, items: [{ fact: fact({ id: 'f1' }) }, { fact: fact({ id: 'f1' }) }] })
    expect(dup.diagnostics.some((d) => d.message.includes('duplicate fact'))).toBe(true)
    expect(dup.bundle.artifacts).toHaveLength(1)

    const badRepo = buildArtifactBundle({ ...BASE, repoId: 'not-a-uuid', items: [{ fact: fact({ id: 'f1' }) }] })
    expect(badRepo.diagnostics.some((d) => d.path === 'repoId')).toBe(true)
  })

  it('binds retries to the source snapshot, not to prose similarity', () => {
    const facts = [fact({ id: 'f1' }), fact({ id: 'f2' })]
    const first = snapshotSourceFacts(facts, 's', 1)
    expect(snapshotSourceFacts([...facts].reverse(), 's', 1)).toBe(first)
    expect(snapshotSourceFacts([{ ...facts[0], content: 'Changed.' }, facts[1]], 's', 1)).not.toBe(first)
    expect(snapshotSourceFacts(facts, 's', 2)).not.toBe(first)
  })

  it('applies creates once and treats retry as idempotent (F05)', async () => {
    const root = await makeRoot()
    roots.push(root)
    const svc = new HarnessNoteService()
    const { bundle, diagnostics } = buildArtifactBundle({ ...BASE, items: [{ fact: fact({ id: 'f1' }) }] })
    expect(diagnostics).toEqual([])
    const first = await svc.applyBundleChangeSet(root, bundle.changeSet, 'roundtable s r3')
    expect(first.applied).toHaveLength(1)
    const second = await svc.applyBundleChangeSet(root, bundle.changeSet, 'roundtable s r3')
    expect(second.applied.map((a) => a.operationId)).toEqual(first.applied.map((a) => a.operationId))
    const files = await fs.readdir(join(root, '.agents', 'notes'))
    expect(files.filter((f) => f.endsWith('.md'))).toHaveLength(1)
    const view = await svc.projectView(root)
    expect(view.invalid).toEqual([])
    expect(Object.keys(view.blueprint.nodes)).toHaveLength(1)
  })

  it('updates existing notes by section and surfaces stale saves as conflicts', async () => {
    const root = await makeRoot()
    roots.push(root)
    const svc = new HarnessNoteService()
    const created = buildArtifactBundle({ ...BASE, items: [{ fact: fact({ id: 'f1', kind: 'requirement' }) }] })
    expect(created.diagnostics).toEqual([])
    await svc.applyBundleChangeSet(root, created.bundle.changeSet, 'roundtable s r3')
    const view = await svc.projectView(root)
    const [nodeId] = Object.keys(view.blueprint.nodes)
    const read = await svc.readNote(root, nodeId)
    const uri = `note://${REPO}/${nodeId}`

    const updated = buildArtifactBundle({
      ...BASE,
      revision: 2,
      items: [{
        fact: fact({ id: 'f1', kind: 'requirement', content: 'Revised scope.' }),
        update: { uri, expectedHash: read.sha256, baseMarkdown: read.raw, section: 'Scope', text: 'Revised scope.' },
      }],
    })
    expect(updated.diagnostics).toEqual([])
    await svc.applyBundleChangeSet(root, updated.bundle.changeSet, 'roundtable s r4')
    const after = await svc.readNote(root, nodeId)
    expect(after.raw).toContain('Revised scope.')

    const stale = buildArtifactBundle({
      ...BASE,
      revision: 3,
      items: [{
        fact: fact({ id: 'f1', kind: 'requirement' }),
        update: { uri, expectedHash: read.sha256, baseMarkdown: read.raw, section: 'Scope', text: 'Stale write.' },
      }],
    })
    expect(stale.diagnostics).toEqual([])
    await expect(svc.applyBundleChangeSet(root, stale.bundle.changeSet, 'roundtable s r5')).rejects.toMatchObject({
      code: 'HARNESS_CONFLICT',
    })
  })

  it('persists bundle snapshots beside the journal for retry comparison', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'janusx-roundtable-s5-'))
    roots.push(dir)
    const store = new RoundtableStore({ journalPath: join(dir, 'events.jsonl') })
    const { bundle, diagnostics } = buildArtifactBundle({ ...BASE, items: [{ fact: fact({ id: 'f1' }) }] })
    expect(diagnostics).toEqual([])
    const path = await store.saveBundle(bundle)
    expect(path).toContain('roundtable-bundles')
    const loaded = await store.loadBundle(bundle.id, bundle.revision)
    expect((loaded?.['snapshotHash'] as string)).toBe(bundle.snapshotHash)
    expect(await store.loadBundle(bundle.id, 999)).toBeNull()
  })
})
