import { app, type BrowserWindow } from 'electron'
import { join } from 'path'
import { OFFICE_EVENT_CHANNELS } from '../../shared/office'
import { LANGUAGE_SERVICE_EVENT_CHANNELS, type LanguageServiceId } from '../../shared/ipc/language-service'
import { subscribeWorkspaceWatcher } from '../ipc/handlers'
import { OfficeArtifactIndex } from '../office/office-artifact-index'
import { OfficeWatchPool } from '../office/office-watch-pool'
import { createRegisteredWorkspaceRootResolver } from '../office/office-workspace-guard'
import { OfficecliInstaller } from '../office/officecli-installer'
import { officecliManager } from '../office/officecli-manager'
import { resolveOfficecliManagedRoot } from '../office/office-managed-root'
import { resolveLanguageServiceManagedRoot, resolveServiceManagedRoot } from '../language-service/managed-root'
import { ManagedBinaryInstaller } from '../language-service/installer'
import { clangdManager } from '../language-service/clangd-manager'
import { getAllDescriptors } from '../language-service/registry'

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

  const languageServiceBaseRoot = resolveLanguageServiceManagedRoot({ userDataDir: app.getPath('userData') })
  const languageServiceInstallers = new Map<LanguageServiceId, ManagedBinaryInstaller>()
  for (const descriptor of getAllDescriptors()) {
    const installer = new ManagedBinaryInstaller(
      resolveServiceManagedRoot(languageServiceBaseRoot, descriptor.id),
      descriptor,
      (event) => broadcast(LANGUAGE_SERVICE_EVENT_CHANNELS.installerProgress, event),
    )
    languageServiceInstallers.set(descriptor.id, installer)
  }

  void (async () => {
    const clangdInstaller = languageServiceInstallers.get('clangd')
    if (clangdInstaller) {
      const managedBinary = await clangdInstaller.getManagedBinary()
      clangdManager.configureManagedBinaryPath(managedBinary)
    }
  })()

  return { resolveOfficeWorkspaceRoot, officecliInstaller, officeWatchPool, officeArtifactIndex, languageServiceInstallers }
}