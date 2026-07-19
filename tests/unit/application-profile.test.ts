import { beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'path'

const electronApp = vi.hoisted(() => ({
  isPackaged: false,
  getPath: vi.fn((name: string) => (name === 'appData' ? join('test-root', 'app-data') : '')),
  setPath: vi.fn(),
}))

vi.mock('electron', () => ({ app: electronApp }))

import { configureApplicationProfile } from '../../src/main/bootstrap/session'

describe('application profile', () => {
  beforeEach(() => {
    electronApp.isPackaged = false
    electronApp.getPath.mockClear()
    electronApp.setPath.mockClear()
  })

  it('uses a separate userData directory for the development app', () => {
    configureApplicationProfile(false)

    expect(electronApp.getPath).toHaveBeenCalledWith('appData')
    expect(electronApp.setPath).toHaveBeenCalledWith('userData', join('test-root', 'app-data', 'JanusX-Dev'))
  })

  it('keeps the packaged application profile unchanged', () => {
    electronApp.isPackaged = true

    configureApplicationProfile(false)

    expect(electronApp.setPath).not.toHaveBeenCalled()
  })

  it('leaves hook-client profile isolation to the hook bootstrap', () => {
    configureApplicationProfile(true)

    expect(electronApp.setPath).not.toHaveBeenCalled()
  })

  it.each([
    ['equals form', ['electron', 'app.js', '--user-data-dir=test-profile']],
    ['split form', ['electron', 'app.js', '--user-data-dir', 'test-profile']],
  ])('preserves an explicit userData directory in %s', (_, argv) => {
    configureApplicationProfile(false, argv)

    expect(electronApp.getPath).not.toHaveBeenCalled()
    expect(electronApp.setPath).not.toHaveBeenCalled()
  })
})
