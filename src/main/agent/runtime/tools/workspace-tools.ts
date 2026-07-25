import { isUtf8 } from 'buffer'
import { readdir } from 'fs/promises'
import { join, resolve } from 'path'
import { readWorkspaceFile, resolveWorkspaceTarget } from '../path-guard'
import { evaluateWorkspaceReadPolicy, isSensitivePath } from '../policy-gate'
import type { RegisteredTool, ToolRegistry } from '../registry'

const DEFAULT_MAX_BYTES = 256 * 1024
const MAX_MAX_BYTES = 1024 * 1024
const DEFAULT_DEPTH = 2
const MAX_DEPTH = 4
const DEFAULT_MAX_ENTRIES = 200
const MAX_MAX_ENTRIES = 1000
const registeredRegistries = new WeakSet<ToolRegistry>()

function isText(content: Buffer): boolean {
  return isUtf8(content) && !content.some((byte) =>
    byte === 0x7f || (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d),
  )
}

export const workspaceReadTool: RegisteredTool = {
  name: 'workspace.read',
  description: 'Read a UTF-8 text file inside the current workspace',
  actionRisk: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      workspaceId: { type: 'string' },
      path: { type: 'string' },
      maxBytes: { type: 'number' },
    },
    required: ['workspaceId', 'path'],
    additionalProperties: false,
  },
  execute: async (input, context) => {
    const workspaceId = input.workspaceId
    const requestedPath = input.path
    const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES
    if (typeof workspaceId !== 'string' || workspaceId !== context.workspaceId) {
      throw new Error('workspace.read workspaceId must match the active workspace resource')
    }
    if (typeof requestedPath !== 'string') throw new Error('workspace.read path must be a string')
    if (!Number.isSafeInteger(maxBytes) || Number(maxBytes) < 0 || Number(maxBytes) > MAX_MAX_BYTES) {
      throw new Error(`workspace.read maxBytes must be an integer between 0 and ${MAX_MAX_BYTES}`)
    }
    if (context.signal.aborted) throw new Error('workspace.read cancelled')

    const content = await readWorkspaceFile(
      context.workspaceRoot,
      requestedPath,
      Number(maxBytes),
      evaluateWorkspaceReadPolicy,
    )
    if (context.signal.aborted) throw new Error('workspace.read cancelled')
    if (!isText(content)) throw new Error('workspace.read only supports UTF-8 text files')

    return {
      workspaceId,
      path: requestedPath,
      encoding: 'utf-8',
      size: content.byteLength,
      content: content.toString('utf-8'),
    }
  },
}

type WorkspaceListEntry = {
  path: string
  name: string
  type: 'file' | 'directory'
  depth: number
}

export const workspaceListTool: RegisteredTool = {
  name: 'workspace.list',
  description: 'List a bounded, non-sensitive file tree inside an explicitly selected workspace',
  actionRisk: 'list',
  inputSchema: {
    type: 'object',
    properties: {
      workspaceId: { type: 'string' },
      path: { type: 'string' },
      depth: { type: 'number' },
      maxEntries: { type: 'number' },
    },
    required: ['workspaceId'],
    additionalProperties: false,
  },
  execute: async (input, context) => {
    const workspaceId = input.workspaceId
    const requestedPath = input.path ?? ''
    const depth = input.depth ?? DEFAULT_DEPTH
    const maxEntries = input.maxEntries ?? DEFAULT_MAX_ENTRIES
    if (typeof workspaceId !== 'string' || workspaceId !== context.workspaceId) {
      throw new Error('workspace.list workspaceId must match the active workspace resource')
    }
    if (typeof requestedPath !== 'string') throw new Error('workspace.list path must be a string')
    if (typeof depth !== 'number' || !Number.isSafeInteger(depth) || depth < 0 || depth > MAX_DEPTH) {
      throw new Error(`workspace.list depth must be an integer between 0 and ${MAX_DEPTH}`)
    }
    if (typeof maxEntries !== 'number' || !Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > MAX_MAX_ENTRIES) {
      throw new Error(`workspace.list maxEntries must be an integer between 1 and ${MAX_MAX_ENTRIES}`)
    }
    if (context.signal.aborted) throw new Error('workspace.list cancelled')

    const target = await resolveWorkspaceTarget(context.workspaceRoot, requestedPath)
    if (target.kind !== 'directory') throw new Error('workspace.list path must be a directory')
    const rootPath = resolve(context.workspaceRoot, target.relativePath || '.')
    const entries: WorkspaceListEntry[] = []
    let truncated = false

    const walk = async (directoryPath: string, relativeDirectory: string, currentDepth: number): Promise<void> => {
      if (currentDepth > depth || truncated) return
      if (context.signal.aborted) throw new Error('workspace.list cancelled')
      const children = await readdir(directoryPath, { withFileTypes: true })
      children.sort((left, right) => {
        const leftDirectory = left.isDirectory() ? 0 : 1
        const rightDirectory = right.isDirectory() ? 0 : 1
        return leftDirectory - rightDirectory || left.name.localeCompare(right.name)
      })
      for (const child of children) {
        if (context.signal.aborted) throw new Error('workspace.list cancelled')
        if (child.isSymbolicLink()) continue
        if (!child.isDirectory() && !child.isFile()) continue
        const childPath = relativeDirectory ? `${relativeDirectory}/${child.name}` : child.name
        if (isSensitivePath(childPath)) continue
        entries.push({
          path: childPath,
          name: child.name,
          type: child.isDirectory() ? 'directory' : 'file',
          depth: currentDepth,
        })
        if (entries.length > maxEntries) {
          truncated = true
          entries.pop()
          return
        }
        if (child.isDirectory() && currentDepth < depth) {
          await walk(join(directoryPath, child.name), childPath, currentDepth + 1)
          if (truncated) return
        }
      }
    }

    await walk(rootPath, target.relativePath, 1)
    return {
      workspaceId,
      path: target.relativePath,
      depth,
      entries,
      truncated,
    }
  },
}

export function registerWorkspaceTools(registry: ToolRegistry): void {
  if (registeredRegistries.has(registry)) return
  registry.register(workspaceReadTool)
  registry.register(workspaceListTool)
  registeredRegistries.add(registry)
}
