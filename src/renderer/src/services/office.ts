import {
  type OfficeBuildPromptRequest,
  type OfficeFileEntry,
  type OfficeFileRequest,
  type OfficeFilesChangedEvent,
  type OfficePreviewLease,
  type OfficePrompt,
  type OfficeReloadPreviewRequest,
  type OfficeResult,
  type OfficeStopPreviewRequest,
  type OfficeWatchEvictedEvent,
  type OfficeWorkspaceRequest,
  type OfficecliPublicInfo,
  type OfficeInstallerProgressEvent,
  type OfficeInstallerRemoveRequest,
  type OfficeInstallerStartRequest,
  type OfficeManagedInstallStatus,
} from '../../../shared/office'

export interface OfficeService {
  detect(request: OfficeWorkspaceRequest): Promise<OfficeResult<OfficecliPublicInfo>>
  listFiles(request: OfficeWorkspaceRequest): Promise<OfficeResult<OfficeFileEntry[]>>
  startPreview(request: OfficeFileRequest): Promise<OfficeResult<OfficePreviewLease>>
  stopPreview(request: OfficeStopPreviewRequest): Promise<OfficeResult<null>>
  reloadPreview(request: OfficeReloadPreviewRequest): Promise<OfficeResult<OfficePreviewLease>>
  buildPrompt(request: OfficeBuildPromptRequest): Promise<OfficeResult<OfficePrompt>>
  installerStatus(request: OfficeWorkspaceRequest): Promise<OfficeResult<OfficeManagedInstallStatus>>
  installerStart(request: OfficeInstallerStartRequest): Promise<OfficeResult<OfficeManagedInstallStatus>>
  installerCancel(request: OfficeWorkspaceRequest): Promise<OfficeResult<OfficeManagedInstallStatus>>
  installerRemove(request: OfficeInstallerRemoveRequest): Promise<OfficeResult<OfficeManagedInstallStatus>>
  onInstallerProgress(listener: (event: OfficeInstallerProgressEvent) => void): () => void
  onFilesChanged(listener: (event: OfficeFilesChangedEvent) => void): () => void
  onWatchEvicted(listener: (event: OfficeWatchEvictedEvent) => void): () => void
}

export const officeService: OfficeService = {
  detect: (request) => window.electron.office.detect(request),
  listFiles: (request) => window.electron.office.listFiles(request),
  startPreview: (request) => window.electron.office.startPreview(request),
  stopPreview: (request) => window.electron.office.stopPreview(request),
  reloadPreview: (request) => window.electron.office.reloadPreview(request),
  buildPrompt: (request) => window.electron.office.buildPrompt(request),
  installerStatus: (request) => window.electron.office.installerStatus(request),
  installerStart: (request) => window.electron.office.installerStart(request),
  installerCancel: (request) => window.electron.office.installerCancel(request),
  installerRemove: (request) => window.electron.office.installerRemove(request),
  onInstallerProgress: (listener) => window.electron.office.onInstallerProgress(listener),
  onFilesChanged: (listener) => window.electron.office.onFilesChanged(listener),
  onWatchEvicted: (listener) => window.electron.office.onWatchEvicted(listener),
}
