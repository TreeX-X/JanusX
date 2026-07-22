import { describe, expect, it, vi } from 'vitest'
import type { Node } from '@xyflow/react'
import type { BlueprintNodeData } from '../../src/renderer/src/components/blueprint/BlueprintNodeCard'
import type { Blueprint } from '../../src/renderer/src/services/blueprint'
import { deriveBlueprintFlow } from '../../src/renderer/src/features/blueprint/canvas-layout'
import {
  BlueprintLayoutSaveController,
  patchBlueprintCardNodes
} from '../../src/renderer/src/features/blueprint/useBlueprintGraphController'

function cardData(title: string): BlueprintNodeData {
  return {
    title,
    status: 'planned',
    nodeType: 'task',
    progress: 0,
    workspaceName: null,
    boundTerminalId: null,
    searchMatched: false,
    searchDimmed: false
  }
}

describe('blueprint graph controller seams', () => {
  it('replaces only card nodes whose derived data changed', () => {
    const first = { id: 'first', position: { x: 0, y: 0 }, data: cardData('First') } as Node<BlueprintNodeData, 'blueprint'>
    const second = { id: 'second', position: { x: 0, y: 0 }, data: cardData('Second') } as Node<BlueprintNodeData, 'blueprint'>
    const nextData = new Map([
      ['first', cardData('First')],
      ['second', cardData('Changed')]
    ])

    const result = patchBlueprintCardNodes([first, second], nextData)

    expect(result[0]).toBe(first)
    expect(result[1]).not.toBe(second)
    expect(result[1].data.title).toBe('Changed')
  })

  it('refreshes only the card whose issue signal changed', () => {
    const base = (id: string) => ({ id, title: id, type: 'task', status: 'in-progress', progress: 0, parentId: null, children: [], workspaceId: null, boundTerminalId: null, issues: [], analyses: [] })
    const blueprint = { id: 'bp', rootNodeId: 'first', nodeIds: ['first', 'second'], canvasLayout: {}, nodes: { first: base('first'), second: base('second') } } as unknown as Blueprint
    const current = deriveBlueprintFlow(blueprint, {}, {}, new Set(), false).nodes
    blueprint.nodes.second.issues = [{ id: 'i', title: 'Risk', description: '', severity: 'high', status: 'open', createdAt: new Date().toISOString() }]
    const nextData = new Map(deriveBlueprintFlow(blueprint, {}, {}, new Set(), false).nodes.map((node) => [node.id, node.data]))
    const result = patchBlueprintCardNodes(current, nextData)
    expect(result[0]).toBe(current[0])
    expect(result[1]).not.toBe(current[1])
    expect(result[1].data.issueSummary).toBe('1 问题 · 高')
  })

  it('flushes the old Blueprint before a switched Blueprint and flushes again on dispose', async () => {
    const persisted: string[] = []
    const controller = new BlueprintLayoutSaveController(
      'old',
      async (blueprintId) => { persisted.push(blueprintId) },
      vi.fn(),
      60_000
    )
    controller.schedule({ root: { x: 1, y: 1 } })

    const switched = controller.switchBlueprint('new')
    controller.schedule({ root: { x: 2, y: 2 } })
    await switched
    await controller.dispose()

    expect(persisted).toEqual(['old', 'new'])
  })

  it('reports save failure, retains the pending save, and succeeds on retry', async () => {
    let shouldFail = true
    const errors: Array<string | null> = []
    const persist = vi.fn(async () => {
      if (shouldFail) throw new Error('disk unavailable')
    })
    const controller = new BlueprintLayoutSaveController('bp', persist, (message) => errors.push(message))

    expect(await controller.saveNow({ root: { x: 1, y: 1 } })).toBe(false)
    shouldFail = false
    expect(await controller.flush()).toBe(true)

    expect(persist).toHaveBeenCalledTimes(2)
    expect(errors[0]).toContain('disk unavailable')
    expect(errors.at(-1)).toBeNull()
  })
})
