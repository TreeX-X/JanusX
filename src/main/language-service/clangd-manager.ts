import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DefinitionRequest, DefinitionResult, LanguageServiceErrorCode } from '../../shared/ipc/language-service'
import { ClangdClient } from './clangd-client'

const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024

export function isPathWithinWorkspace(filePath: string, workspacePath: string): boolean {
  const child = relative(resolve(workspacePath), resolve(filePath))
  return child === '' || (!child.startsWith('..') && !isAbsolute(child))
}

function errorResult(code: LanguageServiceErrorCode, message: string): DefinitionResult {
  return { target: null, error: { code, message } }
}

function classifyError(error: unknown): DefinitionResult {
  const value = error as NodeJS.ErrnoException
  const message = error instanceof Error ? error.message : 'clangd request failed'
  if (value?.code === 'ENOENT') return errorResult('clangd-not-found', 'clangd was not found on PATH')
  if (message.includes('timed out')) return errorResult('timeout', message)
  return errorResult('server-error', message)
}

export class ClangdManager {
  private readonly sessions = new Map<string, Promise<ClangdClient>>()

  async definition(request: DefinitionRequest): Promise<DefinitionResult> {
    if (!request || !['c', 'cpp'].includes(request.language)
      || !Number.isInteger(request.position?.line) || request.position.line < 0
      || !Number.isInteger(request.position?.character) || request.position.character < 0
      || Buffer.byteLength(request.content ?? '') > MAX_DOCUMENT_BYTES) {
      return errorResult('invalid-request', 'Invalid C/C++ definition request')
    }

    let root: string
    let filePath: string
    try {
      root = await realpath(resolve(request.workspacePath))
      filePath = await realpath(resolve(request.filePath))
    } catch (error) {
      return classifyError(error)
    }
    if (!isPathWithinWorkspace(filePath, root)) {
      return errorResult('outside-workspace', 'Source file is outside the active workspace')
    }

    const key = process.platform === 'win32' ? root.toLowerCase() : root
    try {
      const client = await this.getClient(key, root)
      const definition = await client.definition({
        filePath,
        language: request.language,
        content: request.content,
        position: request.position,
      })
      if (!definition) return { target: null }
      if (!definition.uri.startsWith('file:')) {
        return errorResult('outside-workspace', 'clangd returned a non-file definition URI')
      }
      const targetPath = await realpath(fileURLToPath(definition.uri))
      if (!isPathWithinWorkspace(targetPath, root)) {
        return errorResult('outside-workspace', 'Definition target is outside the active workspace')
      }
      return {
        target: {
          absolutePath: targetPath,
          selection: {
            startLineNumber: definition.range.start.line + 1,
            startColumn: definition.range.start.character + 1,
            endLineNumber: definition.range.end.line + 1,
            endColumn: definition.range.end.character + 1,
          },
        },
      }
    } catch (error) {
      const session = this.sessions.get(key)
      this.sessions.delete(key)
      void session?.then((client) => client.dispose()).catch(() => undefined)
      return classifyError(error)
    }
  }

  async disposeAll(): Promise<void> {
    const sessions = [...this.sessions.values()]
    this.sessions.clear()
    const clients = await Promise.all(sessions.map((session) => session.catch(() => null)))
    await Promise.all(clients.map((client) => client?.dispose()))
  }

  private getClient(key: string, workspacePath: string): Promise<ClangdClient> {
    const current = this.sessions.get(key)
    if (current) return current
    const created = ClangdClient.create(workspacePath)
    this.sessions.set(key, created)
    void created.catch(() => {
      if (this.sessions.get(key) === created) this.sessions.delete(key)
    })
    return created
  }
}

export const clangdManager = new ClangdManager()
