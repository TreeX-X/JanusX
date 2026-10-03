import type { Blueprint } from '@/services/blueprint'
import type { NoteFocusEvent } from '../../../../shared/note-chat'
import { sameCheckoutPath } from './resolveNodeWorkspace'

/** Resolve full identity plus checkout; duplicate and absent projections stay unresolved. */
export function resolveFocusNodes(blueprint: Blueprint | null, ownerPath: string | null, event: NoteFocusEvent | null) {
  const roles = new Map<string, 'target' | 'reference' | 'dependency'>()
  const missing: string[] = []
  if (!event) return { roles, missing }
  for (const note of event.notes) {
    const matches = blueprint?.nodeIds.filter(id => {
      const path = blueprint.composition?.nodes[id]?.path || ownerPath
      return blueprint.nodes[id]?.sourceUri === note.uri && !!path && sameCheckoutPath(path, event.workspacePath)
    }) ?? []
    if (matches.length === 1) roles.set(matches[0], note.role)
    else missing.push(note.title)
  }
  return { roles, missing }
}
