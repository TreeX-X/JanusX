import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectType, type ProjectAPI } from '../../../src/shared/ipc/project'
import { orbConfigLabel, formatOrbUptime } from '../../../src/renderer/src/components/janus/JanusRunOrb'
import { stopWorkspaceProjects } from '../../../src/renderer/src/components/janus/useProjectRunning'
import { useRunningStore } from '../../../src/renderer/src/stores/running'

const projectApi = {
  list: vi.fn(),
  stop: vi.fn(),
} as unknown as ProjectAPI

const wsA = { id: 'wa', name: 'A', path: 'C:\\a' }

function running(id: string) {
  return {
    id,
    pid: 1,
    type: ProjectType.Vite,
    name: 'dev',
    startTime: new Date().toISOString(),
    uptime: 1000,
  }
}

describe('stopWorkspaceProjects', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { electron: { project: projectApi } })
    vi.mocked(projectApi.list).mockReset()
    vi.mocked(projectApi.stop).mockReset()
    useRunningStore.getState().resetForTests()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stops only the workspace projects and marks stopping', async () => {
    vi.mocked(projectApi.list).mockResolvedValue({
      success: true,
      data: [running('C:\\a::dev::1'), running('C:\\a::dev::2'), running('C:\\b::dev::3')],
    })
    vi.mocked(projectApi.stop).mockResolvedValue({ success: true })

    const ok = await stopWorkspaceProjects(wsA.id, wsA.path)

    expect(ok).toBe(true)
    expect(vi.mocked(projectApi.stop).mock.calls.map((call) => call[0]).sort()).toEqual([
      'C:\\a::dev::1',
      'C:\\a::dev::2',
    ])
    expect(useRunningStore.getState().stoppingByWorkspace[wsA.id]).toBeDefined()
  })

  it('clears stopping and returns false on failure', async () => {
    vi.mocked(projectApi.list).mockResolvedValue({ success: true, data: [running('C:\\a::dev::1')] })
    vi.mocked(projectApi.stop).mockResolvedValue({ success: false, error: 'denied' })

    const ok = await stopWorkspaceProjects(wsA.id, wsA.path)

    expect(ok).toBe(false)
    expect(useRunningStore.getState().stoppingByWorkspace[wsA.id]).toBeUndefined()
  })
})

describe('orb helpers', () => {
  it('formats uptime compactly', () => {
    expect(formatOrbUptime(5000)).toBe('5s')
    expect(formatOrbUptime(65000)).toBe('1m 5s')
    expect(formatOrbUptime(3700000)).toBe('1h 1m')
  })

  it('restores the config name from the runner id', () => {
    expect(
      orbConfigLabel({
        workspaceId: 'wa',
        workspaceName: 'A',
        workspacePath: 'C:\\a',
        projects: [running('C:\\a::dev::1')],
        startedAt: null,
      }),
    ).toBe('dev')
  })
})
