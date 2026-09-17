import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  streamText: vi.fn(),
  getDefaultModel: vi.fn(),
  getLanguageModel: vi.fn(),
  loadBlueprint: vi.fn(),
  applyMaintenanceOperations: vi.fn(),
  workspacesDir: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
  cancelSession: vi.fn(),
}))

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/janusx-test' } }))
vi.mock('../../src/main/llm/ai-runtime', () => ({
  generateObject: mocks.generateObject,
  streamText: mocks.streamText,
}))
vi.mock('../../src/main/agent/runtime/shell-runtime', () => ({
  workspaceAgentRuntime: {
    registry: { list: () => [] },
    createSession: mocks.createSession,
    getSession: mocks.getSession,
    cancelSession: mocks.cancelSession,
    executeFunctionCall: vi.fn(),
  },
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
    applyMaintenanceOperations: mocks.applyMaintenanceOperations,
  },
  isProjectGraphId: (id: string) => id.startsWith('harness:project:'),
}))
vi.mock('../../src/main/janus/blueprint-paths', () => ({ workspacesDir: mocks.workspacesDir }))

import {
  blueprintMaintenanceService,
  throwIfHarnessManaged,
} from '../../src/main/janus/maintenance/service'

const PROJECT_ID = 'harness:project:repo-1'

describe('maintenance harness guard (S6-c slice 1)', () => {
  beforeEach(() => {
    mocks.loadBlueprint.mockReset().mockResolvedValue(null)
    blueprintMaintenanceService.cancelAll()
  })

  it('rejects start on a project graph before touching the store', async () => {
    await expect(blueprintMaintenanceService.start({
      blueprintId: PROJECT_ID,
      nodeScope: { nodeIds: ['root'] },
      goal: 'maintain project notes',
      workspaceId: 'ws-1',
      workspaceName: 'Workspace',
      workspacePath: 'C:/ws',
    } as never)).rejects.toThrow('HARNESS_MANAGED')
    expect(mocks.loadBlueprint).not.toHaveBeenCalled()
  })

  it('lets normal blueprints pass the guard to the existing gates', async () => {
    await expect(blueprintMaintenanceService.start({
      blueprintId: 'bp-1',
      nodeScope: { nodeIds: ['root'] },
      goal: 'maintain legacy blueprint',
      workspaceId: 'ws-1',
      workspaceName: 'Workspace',
      workspacePath: 'C:/ws',
    } as never)).rejects.toThrow('目标蓝图不存在')
    expect(mocks.loadBlueprint).toHaveBeenCalled()
  })

  it('rejects prepareUndo on a project graph without reading audits', async () => {
    await expect(blueprintMaintenanceService.prepareUndo({
      blueprintId: PROJECT_ID,
      auditId: 'audit-1',
    })).rejects.toThrow('HARNESS_MANAGED')
    expect(mocks.loadBlueprint).not.toHaveBeenCalled()
  })

  it('rejects applyUndo on a project graph before looking up the changeset', async () => {
    await expect(blueprintMaintenanceService.applyUndo({
      blueprintId: PROJECT_ID,
      undoChangeSetId: 'missing',
      operationIds: [],
    } as never)).rejects.toThrow('HARNESS_MANAGED')
  })

  it('keeps the helper exact: project ids throw, legacy ids pass', () => {
    expect(() => throwIfHarnessManaged(PROJECT_ID)).toThrow('HARNESS_MANAGED')
    expect(() => throwIfHarnessManaged('bp-1')).not.toThrow()
  })
})
