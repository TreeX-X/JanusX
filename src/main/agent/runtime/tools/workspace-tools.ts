import { isUtf8 } from 'buffer'
import { readWorkspaceFile } from '../path-guard'
import { evaluateWorkspaceReadPolicy } from '../policy-gate'
import type { RegisteredTool, ToolRegistry } from '../registry'

const DEFAULT_MAX_BYTES = 256 * 1024
const MAX_MAX_BYTES = 1024 * 1024
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
      path: { type: 'string' },
      maxBytes: { type: 'number' },
    },
    required: ['path'],
    additionalProperties: false,
  },
  execute: async (input, context) => {
    const requestedPath = input.path
    const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES
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
      path: requestedPath,
      encoding: 'utf-8',
      size: content.byteLength,
      content: content.toString('utf-8'),
    }
  },
}

export function registerWorkspaceTools(registry: ToolRegistry): void {
  if (registeredRegistries.has(registry)) return
  registry.register(workspaceReadTool)
  registeredRegistries.add(registry)
}
