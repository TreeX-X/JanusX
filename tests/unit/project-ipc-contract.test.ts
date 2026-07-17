import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PROJECT_CHANNELS, ProjectType, type ProjectAPI } from '../../src/shared/ipc/project'

const mocks = vi.hoisted(() => ({
  expose: vi.fn(),
  handle: vi.fn(),
  invoke: vi.fn(),
}))

let projectApi: ProjectAPI

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, api: { project: ProjectAPI }) => {
      projectApi = api.project
      mocks.expose(api)
    },
  },
  ipcMain: { handle: mocks.handle },
  ipcRenderer: {
    invoke: mocks.invoke,
    on: vi.fn(),
    removeListener: vi.fn(),
    send: vi.fn(),
  },
}))

beforeAll(async () => {
  await import('../../src/preload/index')
  const { registerProjectHandlers } = await import('../../src/main/ipc/project-handlers')
  registerProjectHandlers()
})

describe('Project IPC contract', () => {
  beforeEach(() => {
    mocks.invoke.mockReset()
    mocks.invoke.mockResolvedValue({ success: true })
  })

  it('defines unique channels and registers every main command', () => {
    const channels = Object.values(PROJECT_CHANNELS)
    expect(new Set(channels).size).toBe(channels.length)
    expect(mocks.handle.mock.calls.map(([channel]) => channel)).toEqual(expect.arrayContaining(channels))
  })

  it('routes all typed commands through the fixed preload API', async () => {
    const config = {
      version: '0.1.0',
      projectType: ProjectType.Vite,
      projectName: 'demo',
      configurations: [],
    }

    await projectApi.detect('C:\\demo')
    await projectApi.detectWithDetails('C:\\demo')
    await projectApi.readConfig('C:\\demo')
    await projectApi.writeConfig('C:\\demo', config)
    await projectApi.createDefaultConfig('C:\\demo', ProjectType.Vite, 'demo')
    await projectApi.validateConfig(config)
    await projectApi.run('C:\\demo', 'dev')
    await projectApi.stop('C:\\demo')
    await projectApi.list()
    await projectApi.get('C:\\demo')
    await projectApi.schemas()

    expect(mocks.invoke.mock.calls).toEqual([
      [PROJECT_CHANNELS.detect, 'C:\\demo'],
      [PROJECT_CHANNELS.detectWithDetails, 'C:\\demo'],
      [PROJECT_CHANNELS.readConfig, 'C:\\demo'],
      [PROJECT_CHANNELS.writeConfig, 'C:\\demo', config],
      [PROJECT_CHANNELS.createDefaultConfig, 'C:\\demo', ProjectType.Vite, 'demo'],
      [PROJECT_CHANNELS.validateConfig, config],
      [PROJECT_CHANNELS.run, 'C:\\demo', 'dev'],
      [PROJECT_CHANNELS.stop, 'C:\\demo'],
      [PROJECT_CHANNELS.list],
      [PROJECT_CHANNELS.get, 'C:\\demo'],
      [PROJECT_CHANNELS.schemas],
    ])
  })

  it('does not expose a generic bridge', () => {
    expect(mocks.expose.mock.calls[0]?.[0]).not.toHaveProperty('invoke')
  })
})
