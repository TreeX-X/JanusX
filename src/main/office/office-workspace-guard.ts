import { readFile, realpath, stat } from 'fs/promises'
import { extname, isAbsolute, join, relative, resolve, sep } from 'path'
import { OFFICE_EXTENSIONS, type OfficeFileRequest, type OfficeWatchErrorCode } from '../../shared/office'

export type ResolveWorkspaceRoot = (workspaceId: string) => Promise<string | undefined>

export interface TrustedOfficeFile {
  workspaceId: string
  relPath: string
  rootPath: string
  filePath: string
}

export interface TrustedOfficeWorkspace {
  workspaceId: string
  rootPath: string
}

export class OfficeWorkspaceGuardError extends Error {
  constructor(
    readonly code: Extract<OfficeWatchErrorCode, 'NOT_OFFICE' | 'OUTSIDE_ROOT' | 'IO'>,
    message: string,
  ) {
    super(message)
    this.name = 'OfficeWorkspaceGuardError'
  }
}

function isOutsideRoot(relativePath: string): boolean {
  return relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)
}

function isAbsoluteOnAnyPlatform(filePath: string): boolean {
  return isAbsolute(filePath) || /^(?:[A-Za-z]:[\\/]|[\\/]{2})/.test(filePath)
}

export function createRegisteredWorkspaceRootResolver(workspacesDirectory: string): ResolveWorkspaceRoot {
  return async (workspaceId) => {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(workspaceId)) return undefined

    try {
      const record = JSON.parse(
        await readFile(join(workspacesDirectory, `${workspaceId}.json`), 'utf8'),
      ) as { id?: unknown; path?: unknown }
      return record.id === workspaceId && typeof record.path === 'string' && record.path.length > 0
        ? record.path
        : undefined
    } catch {
      return undefined
    }
  }
}

export async function resolveTrustedOfficeWorkspace(
  workspaceId: string,
  resolveWorkspaceRoot: ResolveWorkspaceRoot,
): Promise<TrustedOfficeWorkspace> {
  const registeredRoot = await resolveWorkspaceRoot(workspaceId)
  if (!registeredRoot) {
    throw new OfficeWorkspaceGuardError('OUTSIDE_ROOT', 'Workspace is not registered')
  }

  try {
    return { workspaceId, rootPath: await realpath(registeredRoot) }
  } catch {
    throw new OfficeWorkspaceGuardError('IO', 'Workspace is unavailable')
  }
}

export async function resolveTrustedOfficeFile(
  input: OfficeFileRequest,
  resolveWorkspaceRoot: ResolveWorkspaceRoot,
): Promise<TrustedOfficeFile> {
  if (isAbsoluteOnAnyPlatform(input.relPath) || input.relPath.split(/[\\/]+/).includes('..')) {
    throw new OfficeWorkspaceGuardError('OUTSIDE_ROOT', 'Office file is outside the workspace')
  }

  if (!(OFFICE_EXTENSIONS as readonly string[]).includes(extname(input.relPath).toLowerCase())) {
    throw new OfficeWorkspaceGuardError('NOT_OFFICE', 'Unsupported Office file type')
  }

  try {
    const { rootPath } = await resolveTrustedOfficeWorkspace(input.workspaceId, resolveWorkspaceRoot)
    const filePath = await realpath(resolve(rootPath, input.relPath))
    const relativePath = relative(rootPath, filePath)
    if (!relativePath || isOutsideRoot(relativePath)) {
      throw new OfficeWorkspaceGuardError('OUTSIDE_ROOT', 'Office file is outside the workspace')
    }

    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) {
      throw new OfficeWorkspaceGuardError('NOT_OFFICE', 'Office target is not a regular file')
    }

    return {
      workspaceId: input.workspaceId,
      relPath: relativePath.split(sep).join('/'),
      rootPath,
      filePath,
    }
  } catch (error) {
    if (error instanceof OfficeWorkspaceGuardError) throw error
    throw new OfficeWorkspaceGuardError('IO', 'Office file is unavailable')
  }
}
