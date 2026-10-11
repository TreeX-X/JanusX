import { describe, expect, it } from 'vitest'
import type { Blueprint } from '../../src/shared/janus/types'
import type { NoteReadSnapshot } from '../../src/shared/notes'
import type { ArchitectureProjection } from '../../src/renderer/src/features/blueprint/architecture-view'
import { blueprintSourceInfo } from '../../src/renderer/src/features/blueprint/source-info'

function fixture() {
  const snapshot = { repoId: 'repo', coverage: { checkoutRoot: 'C:/root', status: 'complete', diagnostics: [], snapshotHash: 'hash' }, entries: [], relations: [], mentions: [], diagnostics: [] } as NoteReadSnapshot
  const source = { id: 'source', name: 'Source', nodeIds: [], nodes: {}, noteSnapshot: snapshot,
    composition: { version: 'r4', checkouts: [], nodes: {}, interfaces: [], evidence: [], diagnostics: [] } } as unknown as Blueprint
  const projection: ArchitectureProjection = { graph: source, roles: {}, related: {}, diagnostics: [] }
  return { source, snapshot, projection }
}

describe('source inspection', () => {
  it('healthy snapshots and unused provided interfaces do not demand attention', () => {
    const { source, projection } = fixture()
    source.composition!.interfaces.push({ id: 'port', nodeId: 'module', name: 'read', direction: 'provides', status: 'idle' })
    expect(blueprintSourceInfo(source, projection).hasAttention).toBe(false)
  })

  it('retains source and projection diagnostics and deduplicates the same scan error', () => {
    const { source, snapshot, projection } = fixture()
    const diagnostic = { code: 'READ_ERROR', message: 'unreadable', path: 'C:/root/file.md' }
    snapshot.diagnostics.push(diagnostic)
    snapshot.coverage.diagnostics.push(diagnostic)
    source.invalidNotes = [{ relPath: 'broken.md', diagnostics: [{ code: 'INVALID', message: 'invalid metadata' }] }]
    projection.diagnostics.push({ code: 'PARENT_MISSING', message: 'Parent unavailable', nodeId: 'module' })
    const before = structuredClone(source)
    const result = blueprintSourceInfo(source, projection)
    expect(result.hasAttention).toBe(true)
    expect(result.issues).toHaveLength(3)
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'READ_ERROR' }), expect.objectContaining({ path: 'broken.md' }), expect.objectContaining({ nodeId: 'module' })]))
    expect(source).toEqual(before)
  })

  it('keeps distinct checkout snapshots and detects unavailable sources without diagnostics', () => {
    const { source, snapshot, projection } = fixture()
    source.composition!.checkouts.push({ repoId: 'repo', checkoutId: 'other', path: 'C:/other', nodeIds: [], revision: 1, status: 'stale', snapshot: { ...snapshot, coverage: { ...snapshot.coverage, checkoutRoot: 'C:/other' } } })
    expect(blueprintSourceInfo(source, projection).snapshots.map(row => row.coverage.checkoutRoot)).toEqual(['C:/root', 'C:/other'])
    expect(blueprintSourceInfo(source, projection).hasAttention).toBe(true)
    source.composition!.checkouts = []
    source.composition!.interfaces.push({ id: 'port', nodeId: 'module', name: 'read', direction: 'needs', status: 'dangling' })
    expect(blueprintSourceInfo(source, projection).hasAttention).toBe(true)
  })

  it('explains cross-repository references without reporting a source read failure', () => {
    const { source, snapshot, projection } = fixture()
    const uri = 'note://repo/source', target = 'note://external/target'
    const diagnostic = { code: 'NOT_READY', message: 'repository not bound in this index: external', path: uri }
    source.nodeIds.push('source')
    source.nodes.source = { id: 'source', title: 'Architecture decision', sourceUri: uri } as Blueprint['nodes'][string]
    snapshot.entries.push({ uri, relPath: 'decision.md', classification: 'valid', sourceHash: 'hash', doc: { title: 'Architecture decision' } } as NoteReadSnapshot['entries'][number])
    snapshot.relations.push({ sourceUri: uri, targetUri: target, resolution: { status: 'unavailable', reason: 'unbound-repository', diagnostics: [{ code: diagnostic.code, message: diagnostic.message }] } } as NoteReadSnapshot['relations'][number])
    snapshot.diagnostics.push(diagnostic)
    const result = blueprintSourceInfo(source, projection)
    expect(result.issues).toEqual([expect.objectContaining({ category: 'external', nodeId: 'source', sourceTitle: 'Architecture decision', targets: [target] })])
    expect(result.issues.some(issue => issue.category === 'document')).toBe(false)

    source.composition!.checkouts.push({ repoId: 'external', checkoutId: 'external-1', path: 'C:/external', nodeIds: ['target'], revision: 1, status: 'bound' })
    source.nodes.target = { id: 'target', sourceUri: target } as Blueprint['nodes'][string]
    expect(blueprintSourceInfo(source, projection).issues).toEqual([])
  })
})
