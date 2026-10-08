import type { Blueprint } from '@/services/blueprint'
// Note: list ownership and UI context share module navigation — see .agents/notes/blueprint/navigation/requirements/module-focus-navigation.md
import type { NoteBrowserState, NoteFocusEvent, NoteScopeItem } from '../../../../shared/note-chat'
import { sameCheckoutPath } from './resolveNodeWorkspace'
import { projectArchitecture } from './architecture-view'
import { moduleOwners, moduleTrail } from './module-browsing'

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

export function noteBrowserContext(blueprint: Blueprint | null, browser: NoteBrowserState | null, workspacePaths: string[]) {
  if (!blueprint || browser?.blueprintId !== blueprint.id || !workspacePaths.some(path => sameCheckoutPath(path, browser.workspacePath))) return null
  const describe = (id: string | null) => {
    const node = id ? blueprint.nodes[id] : undefined
    const path = id ? blueprint.composition?.nodes[id]?.path || browser.workspacePath : null
    return node?.sourceUri && path && workspacePaths.some(active => sameCheckoutPath(active, path))
      ? { uri: node.sourceUri, title: node.title.slice(0, 160), checkoutPath: path } : null
  }
  const projection = projectArchitecture(blueprint)
  return { currentModule: describe(browser.moduleId),
    modulePath: moduleTrail(projection, browser.moduleId).slice(-32).map(describe).filter(Boolean),
    selected: describe(browser.selectedId), view: browser.moduleBrowsing ? 'modules' : 'documents' }
}

export function groupFocusNotes(blueprint: Blueprint | null, ownerPath: string | null, event: NoteFocusEvent, browser: NoteBrowserState | null) {
  const projection = blueprint ? projectArchitecture(blueprint) : null
  const owners = blueprint && projection ? moduleOwners(blueprint, projection) : {}
  const active = browser?.blueprintId === blueprint?.id && sameCheckoutPath(browser?.workspacePath ?? '', ownerPath ?? '') ? browser : null
  type Item = { note: NoteScopeItem; nodeId?: string; isModule: boolean; location: 'current' | 'otherModule' | 'unassigned' | 'unavailable' | 'outsideView' }
  const groups = new Map<string, { key: string; title?: string; items: Item[] }>()
  for (const note of event.notes) {
    const id = resolveFocusNodes(blueprint, ownerPath, { ...event, notes: [note] }).roles.keys().next().value as string | undefined
    const isModule = !!(id && projection?.roles[id])
    const moduleId = id ? owners[id] ?? (isModule ? id : undefined) : undefined
    const key = !id ? 'unavailable' : moduleId ?? (projection?.graph.nodeIds.length ? 'unassigned' : 'documents')
    const location: Item['location'] = !id ? 'unavailable' : key === 'unassigned' ? 'unassigned'
      : active?.visibleIds.includes(id) ? 'current' : moduleId && active?.moduleBrowsing ? 'otherModule' : 'outsideView'
    const group = groups.get(key) ?? { key, title: moduleId && projection ? moduleTrail(projection, moduleId).map(id => blueprint!.nodes[id].title).join(' / ') : undefined, items: [] }
    group.items.push({ note, nodeId: id, isModule, location }); groups.set(key, group)
  }
  return [...groups.values()]
}
