import type { Blueprint } from '@/services/blueprint'
import { projectGraph } from '@/services/harness'
import { sameCheckoutPath } from '@/features/blueprint/resolveNodeWorkspace'

export interface MaintenanceContext {
  graphId: string
  nodeId: string
  checkoutPath: string
  repoId: string
  uri: string
  expectedHash: string
  stale: boolean
}

/** Resolve composed identity through the source checkout's projectView IPC. */
export async function resolveMaintenanceContext(blueprint: Blueprint, nodeId: string, ownerPath: string | null): Promise<MaintenanceContext> {
  const node = blueprint.nodes[nodeId]
  const member = blueprint.composition?.nodes[nodeId]
  const checkoutPath = member?.path || ownerPath
  if (!checkoutPath || !node?.sourceUri || member?.status === 'unbound') throw new Error('MAINTENANCE_CHECKOUT_UNAVAILABLE')
  const view = await projectGraph(checkoutPath)
  if (!view) throw new Error('MAINTENANCE_CHECKOUT_UNAVAILABLE')
  const matches = Object.values(view.blueprint.nodes).filter(candidate => {
    const source = view.blueprint.composition?.nodes[candidate.id]
    return candidate.sourceUri === node.sourceUri && (!source || sameCheckoutPath(source.path, checkoutPath))
  })
  const local = matches.length === 1 ? matches[0] : undefined
  if (!local?.sourceHash) throw new Error('MAINTENANCE_SOURCE_UNAVAILABLE')
  return { graphId: view.blueprint.id, nodeId: local.id, checkoutPath, repoId: node.sourceUri.split('/')[2],
    uri: node.sourceUri, expectedHash: node.sourceHash ?? local.sourceHash,
    stale: member?.status === 'stale' || (!!node.sourceHash && node.sourceHash !== local.sourceHash) }
}
