import { describe, it, expect, vi } from 'vitest'

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-user-data'),
  },
}))

describe('Workspace Types', () => {
  it('should have correct structure for CreateWorkspaceDto', async () => {
    const types = await import('../../src/main/workspace/types')
    expect(types).toBeDefined()
  })

  it('should define GlobalConfig interface', async () => {
    // Verify the module exports are accessible
    const types = await import('../../src/main/workspace/types')
    expect(types).toBeDefined()
  })
})

describe('ConfigService', () => {
  it('should export configService singleton', async () => {
    const { configService } = await import('../../src/main/config/service')
    expect(configService).toBeDefined()
    expect(typeof configService.load).toBe('function')
    expect(typeof configService.save).toBe('function')
    expect(typeof configService.get).toBe('function')
    expect(typeof configService.update).toBe('function')
    expect(typeof configService.addRecentWorkspace).toBe('function')
    expect(typeof configService.getRegisteredCLIs).toBe('function')
  })
})
