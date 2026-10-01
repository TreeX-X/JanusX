/**
 * Canvas focus → Janus context scope.
 * Pure helper — no stores, no IPC.
 *
 * Note: the batch replaces the removed "维护此节点" pin — see .agents/notes/2026-09-30-blueprint-batch-context--7c1e4a92.md
 */
import { describe, expect, it } from 'vitest'
import {
  EMPTY_FOCUS,
  MAX_CONTEXT_NOTE_REFS,
  focusSubtreeIds,
  resolveBlueprintContextScope,
  type BlueprintFocusInput,
} from '../../src/renderer/src/features/blueprint/blueprint-focus'
import type { Blueprint, BlueprintNode } from '../../src/renderer/src/services/blueprint'

const OWNER = 'C:/fixture'
const OTHER = 'C:/fixture-b'
const REPO = 'repo-1'

function node(id: string, over: Partial<BlueprintNode> = {}): BlueprintNode {
  return {
    id, title: id, type: 'feature', kind: 'requirement', status: 'not-started',
    sourceUri: `note://${REPO}/${id}`, sourceHash: 'a'.repeat(64), parentId: null, children: [],
    ...over,
  } as BlueprintNode
}

function graph(nodes: BlueprintNode[], over: Partial<Blueprint> = {}): Blueprint {
  const byId = Object.fromEntries(nodes.map((item) => [item.id, item]))
  return {
    id: 'harness:project:r1', name: 'G', rootNodeId: nodes[0]?.id ?? '',
    nodeIds: nodes.map((item) => item.id), nodes: byId, relations: [],
    contentRevision: 1, ...over,
  } as Blueprint
}

const PATHS = { active: OWNER, owner: OWNER }
const focus = (over: Partial<BlueprintFocusInput> = {}): BlueprintFocusInput => ({ ...EMPTY_FOCUS, ...over })

describe('focusSubtreeIds', () => {
  it('collects the node and every descendant', () => {
    const g = graph([
      node('root'),
      node('a', { parentId: 'root' }),
      node('b', { parentId: 'a' }),
      node('other'),
    ])
    expect(focusSubtreeIds(g, 'a')).toEqual(['a', 'b'])
  })

  it('terminates on a parent cycle', () => {
    const g = graph([node('a', { parentId: 'b' }), node('b', { parentId: 'a' })])
    expect(focusSubtreeIds(g, 'a').sort()).toEqual(['a', 'b'])
  })
})

describe('resolveBlueprintContextScope', () => {
  const tree = () => graph([
    node('root', { title: 'Root epic' }),
    node('child', { parentId: 'root', title: 'Child task' }),
    node('done', { parentId: 'root', status: 'done' }),
  ])

  it('reads the whole graph when nothing is focused', () => {
    const result = resolveBlueprintContextScope(tree(), focus(), PATHS)
    expect(result.reason).toBe('view')
    expect(result.scope).toBe('view')
    expect(result.noteRefs.map((ref) => ref.uri)).toEqual([
      `note://${REPO}/root`, `note://${REPO}/child`, `note://${REPO}/done`,
    ])
    expect(result.maintenanceScope).toEqual({ type: 'blueprint' })
  })

  it('reads only the selected subtree and keeps the narrow write scope', () => {
    const result = resolveBlueprintContextScope(tree(), focus({ selectedId: 'root' }), PATHS)
    expect(result.reason).toBe('selection')
    expect(result.scope).toBe('subtree')
    expect(result.noteRefs.map((ref) => ref.uri)).toEqual([
      `note://${REPO}/root`, `note://${REPO}/child`, `note://${REPO}/done`,
    ])
    expect(result.maintenanceScope).toEqual({ type: 'node', nodeId: 'root' })
  })

  it('widens the write scope when a filter expresses a batch intent', () => {
    const result = resolveBlueprintContextScope(tree(), focus({ selectedId: 'root', statusFilter: 'done' }), PATHS)
    expect(result.reason).toBe('filter')
    expect(result.noteRefs.map((ref) => ref.uri)).toEqual([`note://${REPO}/done`])
    expect(result.maintenanceScope).toEqual({ type: 'blueprint' })
  })

  it('ignores a selection that no longer exists in the graph', () => {
    const result = resolveBlueprintContextScope(tree(), focus({ selectedId: 'gone' }), PATHS)
    expect(result.reason).toBe('view')
    expect(result.maintenanceScope).toEqual({ type: 'blueprint' })
  })

  it('separates composition members living in another checkout', () => {
    const g = graph([
      node('local'),
      node('remote', { sourceHash: 'd'.repeat(64) }),
    ], {
      composition: {
        version: 'r4', checkouts: [], interfaces: [], evidence: [], diagnostics: [],
        nodes: {
          local: { layer: 'evidence', status: 'bound', repoId: REPO, path: OWNER },
          remote: { layer: 'evidence', status: 'bound', repoId: REPO, path: OTHER },
        },
      } as never,
    })
    const result = resolveBlueprintContextScope(g, focus(), PATHS)
    expect(result.noteRefs.map((ref) => ref.uri)).toEqual([`note://${REPO}/local`])
    expect(result.foreignNodeIds).toEqual(['remote'])
    expect(result.foreignCheckoutPath).toBe(OTHER)
  })

  it('offers no switch target when the foreign batch spans checkouts', () => {
    const g = graph([node('a'), node('b')], {
      composition: {
        version: 'r4', checkouts: [], interfaces: [], evidence: [], diagnostics: [],
        nodes: {
          a: { layer: 'evidence', status: 'bound', repoId: REPO, path: 'D:/one' },
          b: { layer: 'evidence', status: 'bound', repoId: REPO, path: 'D:/two' },
        },
      } as never,
    })
    const result = resolveBlueprintContextScope(g, focus(), { active: 'D:/elsewhere', owner: OWNER })
    expect(result.noteRefs).toEqual([])
    expect(result.foreignNodeIds).toEqual(['a', 'b'])
    expect(result.foreignCheckoutPath).toBeNull()
  })

  it('counts nodes without a Note identity instead of inventing refs', () => {
    const g = graph([node('a'), node('orphan', { sourceUri: undefined })])
    const result = resolveBlueprintContextScope(g, focus(), PATHS)
    expect(result.sourcelessNodeIds).toEqual(['orphan'])
    expect(result.noteRefs).toHaveLength(1)
  })

  it('deduplicates shared Note identities and caps the ref list', () => {
    const many = Array.from({ length: MAX_CONTEXT_NOTE_REFS + 5 }, (_, index) => node(`n${index}`))
    const shared = [...many, node('alias', { sourceUri: `note://${REPO}/n0` })]
    const result = resolveBlueprintContextScope(graph(shared), focus(), PATHS)
    expect(result.noteRefs).toHaveLength(MAX_CONTEXT_NOTE_REFS)
    expect(result.droppedNodeIds.length).toBeGreaterThan(0)
    expect(new Set(result.noteRefs.map((ref) => ref.uri)).size).toBe(result.noteRefs.length)
  })
})
