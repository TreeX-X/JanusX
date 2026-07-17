import { beforeEach, describe, expect, it, vi } from 'vitest'

const { handle } = vi.hoisted(() => ({ handle: vi.fn() }))

vi.mock('electron', () => ({ ipcMain: { handle } }))

import { registerProjectHandlers } from '../../src/main/ipc/project-handlers'
import ProjectConfig from '../../src/main/project/config/project-config'
import { ProjectType } from '../../src/main/project/types'

describe('ProjectConfig.createDefault contract', () => {
  beforeEach(() => {
    handle.mockReset()
  })

  it('accepts the public workspace-first three-position call', () => {
    const config = ProjectConfig.createDefault('C:\\workspace\\demo', ProjectType.Vite, 'demo')

    expect(config.projectType).toBe(ProjectType.Vite)
    expect(config.projectName).toBe('demo')
  })

  it('preserves renderer IPC argument order', async () => {
    const createDefault = vi.spyOn(ProjectConfig, 'createDefault')
    registerProjectHandlers()
    const registration = handle.mock.calls.find(([channel]) => channel === 'project:config:create-default')

    await registration?.[1]({}, 'C:\\workspace\\demo', ProjectType.Vite, 'demo')

    expect(createDefault).toHaveBeenCalledWith('C:\\workspace\\demo', ProjectType.Vite, 'demo')
  })
})
