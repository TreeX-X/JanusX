// Note: real corpus reachability — see .agents/notes/blueprint/module-responsibilities.md
import { expect, it } from 'vitest'
import { readCorpus } from '../helpers/note-corpus'
import { projectArchitecture } from '../../src/renderer/src/features/blueprint/architecture-view'
import { moduleTrail, projectModuleBrowse } from '../../src/renderer/src/features/blueprint/module-browsing'
import { noteDirectory } from '../../src/shared/note-wiki'

it('reaches every real Note from the module tree or explicit unassigned list without mixing ownership', async () => {
  const { blueprint: source, snapshot } = await readCorpus(), before = structuredClone(source)
  const projection = projectArchitecture(source), home = projectModuleBrowse(source, projection, null)
  expect(projection.graph.nodeIds.length).toBeGreaterThanOrEqual(17)
  expect(home.scopeId).toBe('b2e7f160-2d77-4cc4-8828-b9cf3e5d931a')
  const reached = new Set(home.unassigned), queue = [home.scopeId!], seen = new Set<string>()
  while (queue.length) {
    const id = queue.shift()!
    expect(seen.has(id)).toBe(false); seen.add(id)
    const page = projectModuleBrowse(source, projection, id)
    expect(page.graph.nodeIds).toContain(id)
    expect(page.graph.nodes[id].parentId).toBeNull()
    for (const child of page.graph.nodeIds) {
      reached.add(child)
      if (child !== id) expect(page.owners[child]).toBe(id)
    }
    for (const group of page.groups) for (const child of group.nodeIds) {
      if (source.nodes[child].note?.metadata?.schema === 'harness-note/2') expect(source.nodes[child].note?.module).toBe(source.nodes[id].sourceUri)
      expect(source.nodes[child].note?.kind).toBe(group.kind)
    }
    queue.push(...projection.graph.nodes[id].children)
  }
  expect([...reached].sort()).toEqual([...source.nodeIds].sort())
  const modules = ['blueprint/navigation/module.md', 'sessions/checkpoints/module.md']
  const directory = noteDirectory(snapshot)
  for (const path of modules) {
    const node = Object.values(source.nodes).find(n => n.sourceRelPath === '.agents/notes/' + path)!
    expect(moduleTrail(projection, node.id)).toHaveLength(3)
    expect(directory.find(row => row.entry.uri === node.sourceUri)?.depth).toBe(2)
  }
  expect(source).toEqual(before)
}, 20_000)
