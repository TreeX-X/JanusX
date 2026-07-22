import { constants } from 'fs'
import { open, realpath, stat } from 'fs/promises'
import { isAbsolute, relative, resolve, sep } from 'path'

export type WorkspacePathReasonCode =
  | 'WORKSPACE_UNAVAILABLE'
  | 'ABSOLUTE_PATH'
  | 'PATH_TRAVERSAL'
  | 'TARGET_UNAVAILABLE'
  | 'OUTSIDE_WORKSPACE'
  | 'TARGET_NOT_REGULAR'
  | 'TARGET_CHANGED'
  | 'FILE_TOO_LARGE'
  | 'INVALID_READ_LIMIT'

export interface TrustedWorkspaceTarget {
  relativePath: string
  kind: 'file' | 'directory'
}

export interface WorkspaceReadAuthorization {
  outcome: 'allow' | 'deny'
  reasonCode: string
}

export type WorkspaceReadAuthorizer = (
  target: TrustedWorkspaceTarget,
) => WorkspaceReadAuthorization | Promise<WorkspaceReadAuthorization>

interface CanonicalWorkspaceTarget extends TrustedWorkspaceTarget {
  rootPath: string
  targetPath: string
}

export class WorkspacePathGuardError extends Error {
  constructor(readonly code: WorkspacePathReasonCode, message: string) {
    super(message)
    this.name = 'WorkspacePathGuardError'
  }
}

export class WorkspaceReadDeniedError extends Error {
  constructor(readonly code: string) {
    super(`Workspace read denied: ${code}`)
    this.name = 'WorkspaceReadDeniedError'
  }
}

function isAbsoluteOnAnyPlatform(value: string): boolean {
  return isAbsolute(value) || /^[\\/]/.test(value) || /^[A-Za-z]:/.test(value)
}

function isOutsideRoot(relativePath: string): boolean {
  return relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)
}

async function canonicalPath(value: string, code: WorkspacePathReasonCode): Promise<string> {
  try {
    return await realpath(value)
  } catch {
    throw new WorkspacePathGuardError(code, code === 'WORKSPACE_UNAVAILABLE'
      ? 'Workspace is unavailable'
      : 'Workspace target is unavailable')
  }
}

export async function resolveWorkspaceTarget(
  workspaceRoot: string,
  requestedPath: string,
): Promise<TrustedWorkspaceTarget> {
  const target = await resolveCanonicalWorkspaceTarget(workspaceRoot, requestedPath)
  return { relativePath: target.relativePath, kind: target.kind }
}

async function resolveCanonicalWorkspaceTarget(
  workspaceRoot: string,
  requestedPath: string,
): Promise<CanonicalWorkspaceTarget> {
  if (!workspaceRoot) {
    throw new WorkspacePathGuardError('WORKSPACE_UNAVAILABLE', 'Workspace is unavailable')
  }
  if (typeof requestedPath !== 'string' || requestedPath.includes('\0')) {
    throw new WorkspacePathGuardError('TARGET_UNAVAILABLE', 'Workspace target is unavailable')
  }
  if (isAbsoluteOnAnyPlatform(requestedPath)) {
    throw new WorkspacePathGuardError('ABSOLUTE_PATH', 'Absolute paths are not allowed')
  }

  const pathSegments = requestedPath.split(/[\\/]+/)
  if (pathSegments.includes('..')) {
    throw new WorkspacePathGuardError('PATH_TRAVERSAL', 'Parent path traversal is not allowed')
  }

  const rootPath = await canonicalPath(workspaceRoot, 'WORKSPACE_UNAVAILABLE')
  try {
    if (!(await stat(rootPath)).isDirectory()) {
      throw new WorkspacePathGuardError('WORKSPACE_UNAVAILABLE', 'Workspace is unavailable')
    }
  } catch (error) {
    if (error instanceof WorkspacePathGuardError) throw error
    throw new WorkspacePathGuardError('WORKSPACE_UNAVAILABLE', 'Workspace is unavailable')
  }
  const targetPath = await canonicalPath(
    resolve(rootPath, pathSegments.filter(Boolean).join(sep) || '.'),
    'TARGET_UNAVAILABLE',
  )
  const relativePath = relative(rootPath, targetPath)
  if (isOutsideRoot(relativePath)) {
    throw new WorkspacePathGuardError('OUTSIDE_WORKSPACE', 'Workspace target is outside the workspace')
  }

  let targetStat
  try {
    targetStat = await stat(targetPath)
  } catch {
    throw new WorkspacePathGuardError('TARGET_UNAVAILABLE', 'Workspace target is unavailable')
  }
  const kind = targetStat.isFile() ? 'file' : targetStat.isDirectory() ? 'directory' : undefined
  if (!kind) {
    throw new WorkspacePathGuardError('TARGET_NOT_REGULAR', 'Workspace target is not a regular file or directory')
  }

  return {
    rootPath,
    targetPath,
    relativePath: relativePath.split(sep).join('/'),
    kind,
  }
}

function hasStableIdentity(value: { dev: bigint; ino: bigint }): boolean {
  return value.dev !== 0n && value.ino !== 0n
}

function sameFile(
  left: { dev: bigint; ino: bigint },
  right: { dev: bigint; ino: bigint },
): boolean {
  return hasStableIdentity(left) && hasStableIdentity(right)
    && left.dev === right.dev && left.ino === right.ino
}

async function readBounded(handle: Awaited<ReturnType<typeof open>>, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  while (total <= maxBytes) {
    const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes + 1 - total))
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, null)
    if (bytesRead === 0) return Buffer.concat(chunks, total)
    chunks.push(buffer.subarray(0, bytesRead))
    total += bytesRead
  }
  throw new WorkspacePathGuardError('FILE_TOO_LARGE', 'Workspace file exceeds the read limit')
}

export async function readWorkspaceFile(
  workspaceRoot: string,
  requestedPath: string,
  maxBytes: number,
  authorize: WorkspaceReadAuthorizer,
): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes >= Number.MAX_SAFE_INTEGER) {
    throw new WorkspacePathGuardError('INVALID_READ_LIMIT', 'Workspace file read limit is invalid')
  }

  const target = await resolveCanonicalWorkspaceTarget(workspaceRoot, requestedPath)
  if (target.kind !== 'file') {
    throw new WorkspacePathGuardError('TARGET_NOT_REGULAR', 'Workspace target is not a regular file')
  }

  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    const noFollow = constants.O_NOFOLLOW ?? 0
    handle = await open(target.targetPath, constants.O_RDONLY | noFollow)
    const openedStat = await handle.stat({ bigint: true })
    if (!openedStat.isFile() || !hasStableIdentity(openedStat) || openedStat.size > BigInt(maxBytes)) {
      if (openedStat.size > BigInt(maxBytes)) {
        throw new WorkspacePathGuardError('FILE_TOO_LARGE', 'Workspace file exceeds the read limit')
      }
      throw new WorkspacePathGuardError('TARGET_CHANGED', 'Workspace target changed during authorization')
    }

    const freshTarget = await resolveCanonicalWorkspaceTarget(workspaceRoot, requestedPath)
    if (freshTarget.kind !== 'file') {
      throw new WorkspacePathGuardError('TARGET_CHANGED', 'Workspace target changed during authorization')
    }
    const freshStat = await stat(freshTarget.targetPath, { bigint: true })
    if (!sameFile(openedStat, freshStat)) {
      throw new WorkspacePathGuardError('TARGET_CHANGED', 'Workspace target changed during authorization')
    }
    const authorization = await authorize({
      relativePath: freshTarget.relativePath,
      kind: freshTarget.kind,
    })
    if (!authorization || authorization.outcome !== 'allow') {
      throw new WorkspaceReadDeniedError(authorization?.reasonCode || 'READ_NOT_AUTHORIZED')
    }
    return await readBounded(handle, maxBytes)
  } catch (error) {
    if (error instanceof WorkspacePathGuardError || error instanceof WorkspaceReadDeniedError) throw error
    throw new WorkspacePathGuardError('TARGET_UNAVAILABLE', 'Workspace file is unavailable')
  } finally {
    await handle?.close().catch(() => undefined)
  }
}
