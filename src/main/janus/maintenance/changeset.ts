import { randomUUID } from 'crypto'
import type { Blueprint } from '../../../shared/janus/types'
import type { BlueprintChangeSet, BlueprintOperation } from '../../../shared/janus/maintenance-types'
import { makeNode, nowIso } from '../blueprint-factory'
import { reconcileBlueprintTree } from '../blueprint-migration'

const UPDATE_FIELDS = new Set([
  'title', 'type', 'status', 'progress', 'positioning', 'description',
  'techSolution', 'notes', 'tags'
])

export class BlueprintChangeSetError extends Error {}

export function scopeNodeIds(blueprint: Blueprint, scope: { type: string; nodeId?: string }): Set<string> {
  if (scope.type === 'blueprint') return new Set(blueprint.nodeIds)
  if (!scope.nodeId || !blueprint.nodes[scope.nodeId]) return new Set()
  if (scope.type === 'node') return new Set([scope.nodeId])
  const ids = new Set<string>()
  const visit = (id: string) => {
    if (ids.has(id)) return
    ids.add(id)
    for (const childId of blueprint.nodes[id]?.children ?? []) visit(childId)
  }
  visit(scope.nodeId)
  return ids
}

export function selectOperations(changeSet: BlueprintChangeSet, selectedIds: string[]): BlueprintOperation[] {
  const selected = new Set(selectedIds)
  const operations = changeSet.operations.filter((operation) => selected.has(operation.operationId))
  const available = new Set(operations.map((operation) => operation.operationId))
  for (const operation of operations) {
    const missing = operation.dependsOn.find((id) => !available.has(id))
    if (missing) throw new BlueprintChangeSetError(`操作 ${operation.operationId} 缺少依赖 ${missing}`)
  }
  const byId = new Map(operations.map((operation) => [operation.operationId, operation]))
  const ordered: BlueprintOperation[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string) => {
    if (visited.has(id)) return
    if (visiting.has(id)) throw new BlueprintChangeSetError('操作依赖不能形成环')
    const operation = byId.get(id)
    if (!operation) return
    visiting.add(id)
    operation.dependsOn.forEach(visit)
    visiting.delete(id)
    visited.add(id)
    ordered.push(operation)
  }
  operations.forEach((operation) => visit(operation.operationId))
  return ordered
}

export function applyOperations(
  source: Blueprint,
  operations: BlueprintOperation[],
  allowedNodeIds: Set<string>
): Blueprint {
  const blueprint = structuredClone(source)
  const tempIds = new Map<string, string>()
  const resolveId = (id: string) => tempIds.get(id) ?? id

  for (const operation of operations) {
    if (operation.type === 'create-node') {
      const parentId = resolveId(operation.parentId)
      if (!blueprint.nodes[parentId] || (!allowedNodeIds.has(parentId) && !tempIds.has(operation.parentId))) {
        throw new BlueprintChangeSetError(`新节点父节点不在维护范围内：${operation.parentId}`)
      }
      const node = makeNode({ ...operation.after, parentId, id: randomUUID() })
      tempIds.set(operation.tempNodeId, node.id)
      blueprint.nodes[node.id] = node
      blueprint.nodeIds.push(node.id)
      allowedNodeIds.add(node.id)
      continue
    }

    const nodeId = resolveId(operation.nodeId)
    const node = blueprint.nodes[nodeId]
    if (!node || !allowedNodeIds.has(nodeId)) {
      throw new BlueprintChangeSetError(`目标节点不在维护范围内：${operation.nodeId}`)
    }

    if (operation.type === 'update-node') {
      for (const [key, value] of Object.entries(operation.after)) {
        if (!UPDATE_FIELDS.has(key)) throw new BlueprintChangeSetError(`不允许更新字段：${key}`)
        if (key === 'progress' && (typeof value !== 'number' || value < 0 || value > 100)) {
          throw new BlueprintChangeSetError('节点进度必须在 0 到 100 之间')
        }
        ;(node as unknown as Record<string, unknown>)[key] = value
      }
      node.updatedAt = nowIso()
      continue
    }

    const parentId = resolveId(operation.afterParentId)
    if (!blueprint.nodes[parentId] || (!allowedNodeIds.has(parentId) && !tempIds.has(operation.afterParentId))) {
      throw new BlueprintChangeSetError(`目标父节点不在维护范围内：${operation.afterParentId}`)
    }
    if (nodeId === blueprint.rootNodeId || nodeId === parentId) {
      throw new BlueprintChangeSetError('根节点不能移动，节点也不能成为自己的父节点')
    }
    node.parentId = parentId
    node.updatedAt = nowIso()
  }

  for (const id of blueprint.nodeIds) {
    const seen = new Set<string>()
    let cursor: string | null = id
    while (cursor) {
      if (seen.has(cursor)) throw new BlueprintChangeSetError('节点层级不能形成环')
      seen.add(cursor)
      cursor = blueprint.nodes[cursor]?.parentId ?? null
    }
  }
  reconcileBlueprintTree(blueprint)
  blueprint.contentRevision = source.contentRevision + 1
  blueprint.updatedAt = nowIso()
  return blueprint
}

export function operationSummary(operation: BlueprintOperation): string {
  if (operation.type === 'create-node') return `新建节点“${operation.after.title}”`
  if (operation.type === 'move-node') return `移动节点 ${operation.nodeId}`
  return `更新节点 ${operation.nodeId}`
}
