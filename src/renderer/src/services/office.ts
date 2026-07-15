import {
  OFFICE_EVENT_CHANNELS,
  OFFICE_INVOKE_CHANNELS,
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

function invokeOffice<T>(channel: string, request: unknown): Promise<OfficeResult<T>> {
  return window.electron.invoke(channel, request) as Promise<OfficeResult<T>>
}

export const officeService: OfficeService = {
  detect: (request) => invokeOffice(OFFICE_INVOKE_CHANNELS.detect, request),
  listFiles: (request) => invokeOffice(OFFICE_INVOKE_CHANNELS.listFiles, request),
  startPreview: (request) => invokeOffice(OFFICE_INVOKE_CHANNELS.startPreview, request),
  stopPreview: (request) => invokeOffice(OFFICE_INVOKE_CHANNELS.stopPreview, request),
  reloadPreview: (request) => invokeOffice(OFFICE_INVOKE_CHANNELS.reloadPreview, request),
  buildPrompt: (request) => invokeOffice(OFFICE_INVOKE_CHANNELS.buildPrompt, request),
  installerStatus: (request) => invokeOffice(OFFICE_INVOKE_CHANNELS.installerStatus, request),
  installerStart: (request) => invokeOffice(OFFICE_INVOKE_CHANNELS.installerStart, request),
  installerCancel: (request) => invokeOffice(OFFICE_INVOKE_CHANNELS.installerCancel, request),
  installerRemove: (request) => invokeOffice(OFFICE_INVOKE_CHANNELS.installerRemove, request),
  onInstallerProgress: (listener) => window.electron.on(OFFICE_EVENT_CHANNELS.installerProgress, (event) => listener(event as OfficeInstallerProgressEvent)),
  onFilesChanged: (listener) => window.electron.on(OFFICE_EVENT_CHANNELS.filesChanged, (event) => listener(event as OfficeFilesChangedEvent)),
  onWatchEvicted: (listener) => window.electron.on(OFFICE_EVENT_CHANNELS.watchEvicted, (event) => listener(event as OfficeWatchEvictedEvent)),
}
