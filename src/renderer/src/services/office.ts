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
} from '../../../shared/office'

export interface OfficeService {
  detect(request: OfficeWorkspaceRequest): Promise<OfficeResult<OfficecliPublicInfo>>
  listFiles(request: OfficeWorkspaceRequest): Promise<OfficeResult<OfficeFileEntry[]>>
  startPreview(request: OfficeFileRequest): Promise<OfficeResult<OfficePreviewLease>>
  stopPreview(request: OfficeStopPreviewRequest): Promise<OfficeResult<null>>
  reloadPreview(request: OfficeReloadPreviewRequest): Promise<OfficeResult<OfficePreviewLease>>
  buildPrompt(request: OfficeBuildPromptRequest): Promise<OfficeResult<OfficePrompt>>
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
  onFilesChanged: (listener) => window.electron.office.onFilesChanged(listener),
  onWatchEvicted: (listener) => window.electron.office.onWatchEvicted(listener),
}
