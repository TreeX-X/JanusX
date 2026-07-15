import type { OfficeHandlerOperations } from '../ipc/office-handlers'
import { buildOfficePromptForAgent, type BuildOfficePromptInput } from './office-skills'
import type { OfficeArtifactIndex } from './office-artifact-index'
import type { OfficeWatchPool } from './office-watch-pool'

type ProductionOfficeOperations = Pick<
  OfficeHandlerOperations,
  'listFiles' | 'startPreview' | 'stopPreview' | 'reloadPreview' | 'buildPrompt'
>

interface ProductionOfficeDependencies {
  artifactIndex: Pick<OfficeArtifactIndex, 'list'>
  watchPool: Pick<OfficeWatchPool, 'acquire' | 'release' | 'reload'>
  buildPrompt?: (input: BuildOfficePromptInput) => ReturnType<typeof buildOfficePromptForAgent>
}

export function createProductionOfficeOperations({
  artifactIndex,
  watchPool,
  buildPrompt = buildOfficePromptForAgent,
}: ProductionOfficeDependencies): ProductionOfficeOperations {
  return {
    listFiles: (workspace) => artifactIndex.list(workspace.workspaceId),
    startPreview: (file) => watchPool.acquire(file),
    stopPreview: (file, request) => watchPool.release(request.previewLeaseId, file.filePath),
    reloadPreview: (file, request) => watchPool.reload(request.previewLeaseId, file),
    buildPrompt: (_file, request) => buildPrompt({
      workspaceId: request.workspaceId,
      terminalPreset: request.terminalPreset,
      ...(request.skillId ? { skillId: request.skillId } : {}),
    }),
  }
}
