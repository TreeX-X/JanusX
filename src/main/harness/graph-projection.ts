/**
 * @file Harness note graph projection (S4, pure)
 * @description Projects parsed harness notes onto the Blueprint view model so the
 *  existing canvas, detail, and list UI render project notes with no model fork.
 *  Mapping is documented and lossy by design: execution state, run logs, and
 *  analysis records stay in their own stores (S6/S8 own those views).
 *  No filesystem, no Electron, no network.
 */
import type {
  Blueprint,
  BlueprintFeatureItem,
  BlueprintNode,
  BlueprintNodeStatus,
  BlueprintNodeType,
  BlueprintRelation,
} from '../../shared/janus/types'
import type { ParsedNote } from '@janus-agent/harness-core'

/** note kind -> canvas node type. */
export function kindToNodeType(kind: string): BlueprintNodeType {
  switch (kind) {
    case 'task':
      return 'task'
    case 'requirement':
      return 'feature'
    case 'decision':
    case 'initiative':
      return 'epic'
    case 'idea':
    default:
      return 'issue'
  }
}

/** lifecycle -> canvas status. Done/completion evidence stays with receipts (S8). */
export function lifecycleToStatus(lifecycle: string): BlueprintNodeStatus {
  switch (lifecycle) {
    case 'draft':
    case 'proposed':
      return 'planning'
    case 'accepted':
      return 'in-progress'
    case 'implemented':
      return 'done'
    case 'rejected':
    case 'archived':
      return 'archived'
    default:
      return 'planning'
  }
}

export interface ProjectedEntry {
  note: ParsedNote
  relPath: string
  sha256: string
  diagnostics: { code: string; message: string }[]
}

function sectionText(note: ParsedNote, names: string[]): string {
  for (const name of names) {
    const hit = note.sections.find((s) => s.name === name)
    if (hit && hit.text.trim()) return hit.text.trim()
  }
  return ''
}

function featuresFromAcs(note: ParsedNote): BlueprintFeatureItem[] {
  const now = new Date().toISOString()
  return note.acs.map((ac) => ({
    id: ac.id,
    title: ac.text,
    description: '',
    progress: 0,
    status: 'planned',
    requirementNotes: [],
    createdAt: now,
    updatedAt: now,
  }))
}

export function projectNode(repoId: string | null, entry: ProjectedEntry): BlueprintNode {
  const { note, relPath, sha256 } = entry
  const meta = note.meta as unknown as Record<string, unknown>
  const parentUri = (note.meta.parent as string | undefined) ?? null
  const now = new Date().toISOString()
  return {
    id: note.meta.id,
    title: note.title,
    type: kindToNodeType(note.meta.kind),
    status: lifecycleToStatus(note.meta.lifecycle),
    progress: 0,
    statusSource: 'manual',
    positioning: sectionText(note, ['Background', 'Goal']),
    description: sectionText(note, ['Problem', 'Goal', 'Background', 'Idea']),
    features: featuresFromAcs(note),
    completedItems: [],
    techSolution: sectionText(note, ['Proposal', 'Decision']),
    notes: sectionText(note, ['Open questions', 'Scope']),
    todos: [],
    issues: [],
    activities: [],
    analyses: [],
    workspaceId: null,
    primaryWorkspaceId: null,
    linkedWorkspaceIds: [],
    workspaceSnapshot: null,
    boundTerminalId: null,
    terminalHistory: [],
    lastAnalyzedCommitSha: null,
    children: [],
    parentId: parentUri ? parentUri.split('/').pop() ?? null : null,
    tags: (note.meta.tags ?? []) as string[],
    createdAt: (meta['created'] as string) ?? now,
    updatedAt: now,
    sourceUri: repoId ? `note://${repoId}/${note.meta.id}` : undefined,
    sourceHash: sha256,
    sourceRelPath: relPath,
  }
}

const RELATION_MAP: Record<string, BlueprintRelation['type']> = {
  'depends-on': 'depends-on',
  implements: 'implements',
  'related-to': 'related-to',
}

/** Non-canvas relations degrade to related-to with the original type kept in prose. */
export function projectRelations(entries: ProjectedEntry[]): BlueprintRelation[] {
  const out: BlueprintRelation[] = []
  const now = new Date().toISOString()
  for (const entry of entries) {
    const from = entry.note.meta.id
    const push = (type: string, targetUri: string): void => {
      const target = targetUri.split('/').pop() ?? targetUri
      const mapped = RELATION_MAP[type] ?? 'related-to'
      out.push({
        id: `${from}:${type}:${target}`,
        sourceNodeId: from,
        targetNodeId: target,
        type: mapped,
        description: mapped === type ? undefined : `harness:${type}`,
        createdAt: now,
        updatedAt: now,
      })
    }
    for (const r of (entry.note.meta.relations ?? []) as Array<{ type: string; target: string }>) {
      push(r.type, r.target)
    }
  }
  return out
}

export interface ProjectGraphInput {
  repoId: string | null
  repoName: string
  entries: ProjectedEntry[]
  revision: number
}

export function projectGraphId(repoId: string | null, rootKey: string): string {
  return `harness:project:${(repoId ?? rootKey).slice(0, 8)}`
}

/** One virtual Blueprint per repo root. Layout/overlay state stays local-only. */
export function projectGraph(input: ProjectGraphInput, rootKey: string): Blueprint {
  const nodes: Record<string, BlueprintNode> = {}
  const nodeIds: string[] = []
  for (const entry of input.entries) {
    if (!entry.note) continue
    const node = projectNode(input.repoId, entry)
    nodes[node.id] = node
    nodeIds.push(node.id)
  }
  // Derive reverse children from parent links; drop dangling parents.
  for (const node of Object.values(nodes)) {
    node.children = []
  }
  for (const node of Object.values(nodes)) {
    if (node.parentId && nodes[node.parentId]) {
      nodes[node.parentId].children.push(node.id)
    } else {
      node.parentId = null
    }
  }
  const now = new Date().toISOString()
  return {
    contentRevision: input.revision,
    source: 'harness',
    id: projectGraphId(input.repoId, rootKey),
    name: input.repoName,
    description: '',
    rootNodeId: nodeIds[0] ?? '',
    nodeIds,
    nodes,
    relations: projectRelations(input.entries.filter((e) => e.note)),
    requirementCandidates: [],
    mountedTo: null,
    canvasLayout: {},
    collapsedNodeIds: null,
    createdAt: now,
    updatedAt: now,
  }
}
