import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Blueprint } from '../../src/shared/janus/types'

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
  getDefaultModel: vi.fn(),
  getLanguageModel: vi.fn(),
  loadBlueprint: vi.fn(),
  workspacesDir: vi.fn(),
}))

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
vi.mock('../../src/main/llm/ai-runtime', () => ({
  generateObject: mocks.generateObject,
  generateText: mocks.generateText,
}))
vi.mock('../../src/main/llm/LlmService', () => ({
  llmService: {
    getDefaultModel: mocks.getDefaultModel,
    getLanguageModel: mocks.getLanguageModel,
  },
}))
vi.mock('../../src/main/janus/blueprint-store', () => ({
  blueprintStore: {
    loadBlueprint: mocks.loadBlueprint,
  },
}))
vi.mock('../../src/main/janus/blueprint-paths', () => ({ workspacesDir: mocks.workspacesDir }))

function fixture(): Blueprint {
  return {
    schemaVersion: 2,
    contentRevision: 3,
    id: 'bp-1',
    name: 'Blueprint',
    description: '',
    rootNodeId: 'root',
    nodeIds: ['root'],
    nodes: {
      root: {
        id: 'root', title: 'Root', type: 'epic', status: 'not-started', progress: 0,
        statusSource: 'manual', positioning: '', description: '', features: [], completedItems: [],
        techSolution: '', notes: '', todos: [], issues: [], activities: [], analyses: [], workspaceId: null,
        workspaceSnapshot: null, boundTerminalId: null, terminalHistory: [], lastAnalyzedCommitSha: null,
        children: [], parentId: null, tags: [], createdAt: '', updatedAt: '',
      },
    },
    requirementCandidates: [], mountedTo: null, canvasLayout: {}, createdAt: '', updatedAt: '',
  }
}

describe('Blueprint maintenance free conversation', () => {
  let root = ''
  let workspace = ''

  beforeAll(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'janusx-maintenance-'))
    workspace = join(root, 'workspace')
    const registry = join(root, 'registry')
    await fs.mkdir(workspace)
    await fs.mkdir(registry)
    await fs.writeFile(join(registry, 'workspace.json'), JSON.stringify({ id: 'ws-1', path: workspace }), 'utf8')
    mocks.workspacesDir.mockReturnValue(registry)
    mocks.getDefaultModel.mockResolvedValue({ provider: { id: 'provider' }, modelId: 'model' })
    mocks.getLanguageModel.mockResolvedValue({})
    mocks.loadBlueprint.mockImplementation(async () => fixture())
  })

  afterAll(async () => {
    if (root.startsWith(join(tmpdir(), 'janusx-maintenance-'))) {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('keeps the current proposal during discussion and replaces it only on explicit revision', async () => {
    mocks.generateText.mockResolvedValue({ text: '先讨论方案，不修改蓝图。' })
    mocks.generateObject
      .mockResolvedValueOnce({ object: { summary: '首版提案', operations: [{
        operationId: 'update-1', type: 'update-node', nodeId: 'root', after: { notes: 'first' },
        reason: '记录结论', evidenceRefs: [], dependsOn: [], risk: 'low',
      }] } })
      .mockResolvedValueOnce({ object: { summary: '修订提案', operations: [{
        operationId: 'update-2', type: 'update-node', nodeId: 'root', after: { notes: 'second' },
        reason: '纳入补充意见', evidenceRefs: [], dependsOn: [], risk: 'low',
      }] } })

    const { blueprintMaintenanceService } = await import('../../src/main/janus/maintenance/service')
    const started = await blueprintMaintenanceService.start({
      blueprintId: 'bp-1', workspaceId: 'ws-1', workspaceName: 'Workspace', workspacePath: workspace,
      nodeScope: { type: 'blueprint' }, goal: '先讨论维护方向',
    })
    await vi.waitFor(() => expect(blueprintMaintenanceService.list()[0]?.status).toBe('active'))

    await blueprintMaintenanceService.propose({ taskId: started.id })
    await vi.waitFor(() => expect(blueprintMaintenanceService.list()[0]?.status).toBe('proposal-ready'))
    const firstProposal = blueprintMaintenanceService.list()[0].changeSet
    expect(firstProposal?.version).toBe(1)

    await blueprintMaintenanceService.message({ taskId: started.id, content: '再考虑一下边界，不要改当前提案' })
    await vi.waitFor(() => expect(blueprintMaintenanceService.list()[0]?.phase).toBe('对话完成，当前提案仍待审批'))
    expect(blueprintMaintenanceService.list()[0].changeSet?.id).toBe(firstProposal?.id)
    expect(mocks.generateText.mock.calls[1]?.[0]?.messages[0].content).toContain('update-1')

    await blueprintMaintenanceService.propose({ taskId: started.id })
    await vi.waitFor(() => expect(blueprintMaintenanceService.list()[0]?.changeSet?.version).toBe(2))
    expect(blueprintMaintenanceService.list()[0].changeSet?.id).not.toBe(firstProposal?.id)
    expect(mocks.generateText).toHaveBeenCalledTimes(2)
    expect(mocks.generateObject).toHaveBeenCalledTimes(2)
    blueprintMaintenanceService.cancel(started.id)
  })
})
