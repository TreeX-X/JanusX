import { describe, expect, it } from 'vitest'
import { buildVSCodeLaunchArgs } from '../../src/main/ide-launch'

describe('VS Code launcher', () => {
  it('builds a new-window launch with an isolated profile', () => {
    expect(buildVSCodeLaunchArgs(
      'C:\\Users\\Tree\\Desktop\\git\\JanusX',
      'C:\\Users\\Tree\\AppData\\Roaming\\JanusX-Dev\\vscode-workspace-profile-1234',
    )).toEqual([
      '--new-window',
      '--user-data-dir=C:\\Users\\Tree\\AppData\\Roaming\\JanusX-Dev\\vscode-workspace-profile-1234',
      'C:\\Users\\Tree\\Desktop\\git\\JanusX',
    ])
  })

  it('does not require shell or hidden-window flags for the GUI executable', () => {
    expect({ detached: true, stdio: 'ignore' }).not.toHaveProperty('windowsHide')
  })
})
