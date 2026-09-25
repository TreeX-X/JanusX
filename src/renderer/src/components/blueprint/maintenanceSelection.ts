import type { BlueprintChangeSet, BlueprintOperation } from '../../../../shared/janus/maintenance-types'

/** Approval includes prerequisites, but never grants deletion confirmation. */
export function maintenanceSelection(changeSet: BlueprintChangeSet, requested: string[]): BlueprintOperation[] {
  const byId = new Map(changeSet.operations.map(op => [op.operationId, op]))
  if (byId.size !== changeSet.operations.length) throw new Error('Duplicate operation identity')
  const visiting = new Set<string>()
  const selected = new Set<string>()
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error('Cyclic operation dependency: ' + id)
    if (selected.has(id)) return
    const op = byId.get(id)
    if (!op) throw new Error('Missing operation dependency: ' + id)
    visiting.add(id)
    op.dependsOn.forEach(visit)
    visiting.delete(id)
    selected.add(id)
  }
  requested.forEach(visit)
  return [...selected].map(id => byId.get(id)!)
}
