import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findCompilationDatabase, LspMessageBuffer, normalizeDefinitionResult } from '../../src/main/language-service/clangd-client'
import { isPathWithinWorkspace } from '../../src/main/language-service/clangd-manager'

function frame(message: unknown): Buffer {
  const body = JSON.stringify(message)
  return Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
}

describe('clangd language service', () => {
  const temporaryDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
  })

  it('parses split and consecutive JSON-RPC frames', () => {
    const parser = new LspMessageBuffer()
    const first = frame({ jsonrpc: '2.0', id: 1, result: null })
    const second = frame({ jsonrpc: '2.0', method: 'window/logMessage', params: { type: 3 } })

    expect(parser.push(first.subarray(0, 12))).toEqual([])
    expect(parser.push(Buffer.concat([first.subarray(12), second]))).toEqual([
      { jsonrpc: '2.0', id: 1, result: null },
      { jsonrpc: '2.0', method: 'window/logMessage', params: { type: 3 } },
    ])
  })

  it('normalizes Location and LocationLink definition responses', () => {
    const range = { start: { line: 3, character: 4 }, end: { line: 3, character: 9 } }

    expect(normalizeDefinitionResult([{ uri: 'file:///workspace/demo.cpp', range }])).toEqual({
      uri: 'file:///workspace/demo.cpp',
      range,
    })
    expect(normalizeDefinitionResult({
      targetUri: 'file:///workspace/demo.hpp',
      targetRange: { start: { line: 0, character: 0 }, end: { line: 5, character: 0 } },
      targetSelectionRange: range,
    })).toEqual({ uri: 'file:///workspace/demo.hpp', range })
    expect(normalizeDefinitionResult([])).toBeNull()
  })

  it('rejects sibling paths that only share the workspace prefix', () => {
    const root = join(process.cwd(), 'workspace')

    expect(isPathWithinWorkspace(join(root, 'src', 'demo.cpp'), root)).toBe(true)
    expect(isPathWithinWorkspace(join(process.cwd(), 'workspace-other', 'demo.cpp'), root)).toBe(false)
  })

  it('finds compile_commands.json in a bounded CMake preset directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'janusx-clangd-'))
    temporaryDirectories.push(root)
    const databaseDirectory = join(root, 'build', 'windows-debug')
    await mkdir(databaseDirectory, { recursive: true })
    await writeFile(join(databaseDirectory, 'compile_commands.json'), '[]')

    expect(await findCompilationDatabase(root)).toBe(databaseDirectory)
  })
})
