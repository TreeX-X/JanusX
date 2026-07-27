import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { open, realpath, rename, stat, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { isUtf8 } from 'node:buffer'
import { evaluateWorkspaceReadPolicy, isSensitivePath } from './policy-gate'
import { readWorkspaceFile, resolveWorkspaceCreationTarget, resolveWorkspaceTarget, WorkspacePathGuardError } from './path-guard'

export const MAX_WORKSPACE_EDIT_BYTES = 1024 * 1024
export const MAX_WORKSPACE_REPLACEMENTS = 40

export interface WorkspaceExactReplacement {
  oldText: string
  newText: string
}

export interface PreparedWorkspaceEdit {
  path: string
  previousHash: string
  nextHash: string
  previousContent: string
  nextContent: string
  replacements: number
}

export class WorkspaceEditConflictError extends Error {
  readonly code = 'TARGET_CHANGED'
  constructor(message: string) {
    super(message)
    this.name = 'WorkspaceEditConflictError'
  }
}

export function sha256(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex')
}

function assertText(content: Buffer): string {
  if (!isUtf8(content) || content.some((byte) =>
    byte === 0x7f || (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d),
  )) {
    throw new Error('workspace.edit only supports UTF-8 text files')
  }
  return content.toString('utf-8')
}

function applyExactReplacements(content: string, replacements: WorkspaceExactReplacement[]): string {
  if (replacements.length < 1 || replacements.length > MAX_WORKSPACE_REPLACEMENTS) {
    throw new Error(`workspace.edit requires between 1 and ${MAX_WORKSPACE_REPLACEMENTS} replacements`)
  }
  let next = content
  for (const [index, replacement] of replacements.entries()) {
    if (!replacement || typeof replacement.oldText !== 'string' || typeof replacement.newText !== 'string') {
      throw new Error(`workspace.edit replacement ${index + 1} is invalid`)
    }
    if (!replacement.oldText) throw new Error(`workspace.edit replacement ${index + 1} oldText must not be empty`)
    const first = next.indexOf(replacement.oldText)
    if (first < 0) throw new WorkspaceEditConflictError(`workspace.edit replacement ${index + 1} no longer matches the file`)
    if (next.indexOf(replacement.oldText, first + replacement.oldText.length) >= 0) {
      throw new WorkspaceEditConflictError(`workspace.edit replacement ${index + 1} is ambiguous`)
    }
    next = `${next.slice(0, first)}${replacement.newText}${next.slice(first + replacement.oldText.length)}`
    if (Buffer.byteLength(next) > MAX_WORKSPACE_EDIT_BYTES) {
      throw new Error(`workspace.edit output exceeds ${MAX_WORKSPACE_EDIT_BYTES} bytes`)
    }
  }
  return next
}

export async function prepareWorkspaceEdit(
  workspaceRoot: string,
  requestedPath: string,
  expectedHash: string,
  replacements: WorkspaceExactReplacement[],
): Promise<PreparedWorkspaceEdit> {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) throw new Error('workspace.edit expectedHash must be a SHA-256 hash')
  const target = await resolveWorkspaceTarget(workspaceRoot, requestedPath)
  if (target.kind !== 'file') throw new Error('workspace.edit path must be a regular file')
  const content = await readWorkspaceFile(
    workspaceRoot,
    requestedPath,
    MAX_WORKSPACE_EDIT_BYTES,
    evaluateWorkspaceReadPolicy,
  )
  const previousHash = sha256(content)
  if (previousHash !== expectedHash.toLowerCase()) {
    throw new WorkspaceEditConflictError('workspace.edit expectedHash does not match the current file')
  }
  const previousContent = assertText(content)
  const nextContent = applyExactReplacements(previousContent, replacements)
  if (nextContent === previousContent) throw new Error('workspace.edit does not change the file')
  return {
    path: target.relativePath,
    previousHash,
    nextHash: sha256(nextContent),
    previousContent,
    nextContent,
    replacements: replacements.length,
  }
}

function isOutsideRoot(relativePath: string): boolean {
  return relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)
}

export interface CreatedWorkspaceFile {
  path: string
  sha256: string
  bytes: number
}

export async function createWorkspaceFile(
  workspaceRoot: string,
  requestedPath: string,
  content: string,
): Promise<CreatedWorkspaceFile> {
  if (typeof content !== 'string') throw new Error('workspace.create content must be a string')
  const bytes = Buffer.byteLength(content, 'utf-8')
  if (bytes > MAX_WORKSPACE_EDIT_BYTES) {
    throw new Error(`workspace.create content exceeds ${MAX_WORKSPACE_EDIT_BYTES} bytes`)
  }
  const target = await resolveWorkspaceCreationTarget(workspaceRoot, requestedPath)
  if (isSensitivePath(target.relativePath)) {
    const error = new Error('Workspace target is a sensitive path')
    throw Object.assign(error, { code: 'SENSITIVE_PATH' })
  }
  // 'wx' fails if the target appeared between resolution and write (no overwrite path).
  const handle = await open(target.targetPath, 'wx', 0o644)
  try {
    await handle.writeFile(content, 'utf-8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  return { path: target.relativePath, sha256: sha256(content), bytes }
}

export async function atomicReplaceWorkspaceFile(
  workspaceRoot: string,
  prepared: PreparedWorkspaceEdit,
): Promise<void> {
  const rootPath = await realpath(workspaceRoot)
  const targetPath = await realpath(resolve(rootPath, prepared.path.split('/').join(sep)))
  if (isOutsideRoot(relative(rootPath, targetPath))) {
    throw new WorkspacePathGuardError('OUTSIDE_WORKSPACE', 'Workspace target is outside the workspace')
  }
  const targetHandle = await open(targetPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  let targetHandleClosed = false
  let temporaryPath = ''
  try {
    const openedStat = await targetHandle.stat({ bigint: true })
    if (!openedStat.isFile()) throw new WorkspaceEditConflictError('workspace.edit target is no longer a regular file')
    if (openedStat.size > BigInt(MAX_WORKSPACE_EDIT_BYTES)) {
      throw new WorkspaceEditConflictError('workspace.edit target changed beyond the edit size limit')
    }
    const currentContent = await targetHandle.readFile()
    if (sha256(currentContent) !== prepared.previousHash) {
      throw new WorkspaceEditConflictError('workspace.edit target changed before write')
    }

    const parentPath = dirname(targetPath)
    if (await realpath(parentPath) !== parentPath) {
      throw new WorkspaceEditConflictError('workspace.edit parent directory changed before write')
    }
    temporaryPath = resolve(parentPath, `.janusx-edit-${randomUUID()}.tmp`)
    const temporaryHandle = await open(temporaryPath, 'wx', Number(openedStat.mode & 0o777n))
    try {
      await temporaryHandle.writeFile(prepared.nextContent, 'utf-8')
      await temporaryHandle.sync()
    } finally {
      await temporaryHandle.close()
    }

    const freshStat = await stat(targetPath, { bigint: true })
    if (freshStat.dev !== openedStat.dev || freshStat.ino !== openedStat.ino) {
      throw new WorkspaceEditConflictError('workspace.edit target changed before replacement')
    }
    // Windows does not allow replacing a file while this process still holds it open.
    await targetHandle.close()
    targetHandleClosed = true
    await rename(temporaryPath, targetPath)
    temporaryPath = ''
  } finally {
    if (!targetHandleClosed) await targetHandle.close().catch(() => undefined)
    if (temporaryPath) await unlink(temporaryPath).catch(() => undefined)
  }
}
