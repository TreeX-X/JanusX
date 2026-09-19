import { app, type BrowserWindow } from 'electron'
import { join } from 'path'
import { subscribeWorkspaceWatcher } from '../ipc/handlers'
import { OfficeArtifactIndex } from '../office/office-artifact-index'
import { OfficeWatchPool } from '../office/office-watch-pool'
import { createRegisteredWorkspaceRootResolver } from '../office/office-workspace-guard'
import { resolveLanguageServiceManagedRoot, resolveServiceManagedRoot } from '../language-service/managed-root'
import { ManagedBinaryInstaller } from '../language-service/installer'
import { clangdManager } from '../language-service/clangd-manager'
import { getAllDescriptors } from '../language-service/registry'
import { LANGUAGE_SERVICE_EVENT_CHANNELS, type LanguageServiceId } from '../../shared/ipc/language-service'

export function createApplicationServices(getOfficeWindows: () => BrowserWindow[]) {
  const resolveOfficeWorkspaceRoot = createRegisteredWorkspaceRootResolver(
    join(app.getPath('userData'), 'janusx', 'workspaces'),
  )
  const broadcast = (channel: string, event: unknown) => {
    for (const window of getOfficeWindows()) {
      if (!window.webContents.isDestroyed()) window.webContents.send(channel, event)
    }
  }
  const officeWatchPool = new OfficeWatchPool(resolveOfficeWorkspaceRoot, {
    onEvicted: (event) => broadcast('office:watch-evicted', event),
  })
  const officeArtifactIndex = new OfficeArtifactIndex(resolveOfficeWorkspaceRoot, {
    subscribe: subscribeWorkspaceWatcher,
    onChanged: (event) => broadcast('office:files:changed', event),
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

  return { resolveOfficeWorkspaceRoot, officeWatchPool, officeArtifactIndex, languageServiceInstallers }
}
