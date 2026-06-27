export const WORKSPACE_FILE_DRAG_TYPE = 'application/x-janusx-workspace-file'

export interface WorkspaceFileDragPayload {
  type: 'file'
  name: string
  path: string
}

export function setWorkspaceFileDragData(
  dataTransfer: DataTransfer,
  payload: WorkspaceFileDragPayload
): void {
  const normalizedPayload = {
    ...payload,
    path: normalizeWorkspaceFilePath(payload.path),
  }

  dataTransfer.effectAllowed = 'copy'
  dataTransfer.setData(WORKSPACE_FILE_DRAG_TYPE, JSON.stringify(normalizedPayload))
  dataTransfer.setData('text/plain', formatTerminalFileReference(normalizedPayload.path).trim())
}

export function hasWorkspaceFileDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(WORKSPACE_FILE_DRAG_TYPE)
}

export function readWorkspaceFileDragData(dataTransfer: DataTransfer): WorkspaceFileDragPayload | null {
  const raw = dataTransfer.getData(WORKSPACE_FILE_DRAG_TYPE)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceFileDragPayload>
    if (parsed.type !== 'file' || typeof parsed.path !== 'string' || typeof parsed.name !== 'string') {
      return null
    }

    return {
      type: 'file',
      name: parsed.name,
      path: normalizeWorkspaceFilePath(parsed.path),
    }
  } catch {
    return null
  }
}

export function formatTerminalFileReference(path: string): string {
  const normalized = normalizeWorkspaceFilePath(path)
  if (!normalized) return ''

  if (/\s/.test(normalized)) {
    return `@"${normalized.replace(/["\\]/g, '\\$&')}" `
  }

  return `@${normalized} `
}

function normalizeWorkspaceFilePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '')
}
