import { app, type BrowserWindow } from 'electron'
import { join } from 'path'
import { OFFICE_EVENT_CHANNELS } from '../../shared/office'
import { subscribeWorkspaceWatcher } from '../ipc/handlers'
import { OfficeArtifactIndex } from '../office/office-artifact-index'
import { OfficeWatchPool } from '../office/office-watch-pool'
import { createRegisteredWorkspaceRootResolver } from '../office/office-workspace-guard'
import { OfficecliInstaller } from '../office/officecli-installer'
import { officecliManager } from '../office/officecli-manager'
import { resolveOfficecliManagedRoot } from '../office/office-managed-root'

export function createApplicationServices(getOfficeWindows: () => BrowserWindow[]) {
  const resolveOfficeWorkspaceRoot = createRegisteredWorkspaceRootResolver(
    join(app.getPath('userData'), 'janusx', 'workspaces'),
  )
  const broadcast = (channel: string, event: unknown) => {
    for (const window of getOfficeWindows()) {
      if (!window.webContents.isDestroyed()) window.webContents.send(channel, event)
    }
  }
  const officecliInstaller = new OfficecliInstaller(
    resolveOfficecliManagedRoot({ userDataDir: app.getPath('userData') }),
    (event) => broadcast(OFFICE_EVENT_CHANNELS.installerProgress, event),
    { verifyBinary: (binary, signal) => officecliManager.verifyManagedBinary(binary, signal) },
  )
  const officeWatchPool = new OfficeWatchPool(resolveOfficeWorkspaceRoot, {
    onEvicted: (event) => broadcast(OFFICE_EVENT_CHANNELS.watchEvicted, event),
  })
  const officeArtifactIndex = new OfficeArtifactIndex(resolveOfficeWorkspaceRoot, {
    subscribe: subscribeWorkspaceWatcher,
    onChanged: (event) => broadcast(OFFICE_EVENT_CHANNELS.filesChanged, event),
  })
  return { resolveOfficeWorkspaceRoot, officecliInstaller, officeWatchPool, officeArtifactIndex }
}
