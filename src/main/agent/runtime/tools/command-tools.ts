import { spawn } from 'node:child_process'
import { isAbsolute, join } from 'node:path'
import { requiresCommandShell } from '../../../project/runner/runner'
import { resolveWorkspaceTarget } from '../path-guard'
import type { RegisteredTool, ToolRegistry } from '../registry'

const registeredRegistries = new WeakSet<ToolRegistry>()
const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TIMEOUT_MS = 90_000
const MAX_ARGUMENTS = 100
const MAX_OUTPUT_BYTES = 64 * 1024
const WINDOWS_SHELL_META = /[&|<>^\r\n]/

export type CommandExecutionMode = 'direct' | 'windows-shell-shim'

/** Windows package-manager shims and .cmd/.bat files need cmd.exe compatibility. */
export function commandExecutionMode(program: string, platform: NodeJS.Platform = process.platform): CommandExecutionMode {
  return requiresCommandShell(program, platform) ? 'windows-shell-shim' : 'direct'
}

function appendBounded(chunks: Buffer[], chunk: Buffer, state: { bytes: number; truncated: boolean }): void {
  if (state.bytes >= MAX_OUTPUT_BYTES) {
    state.truncated = true
    return
  }
  const remaining = MAX_OUTPUT_BYTES - state.bytes
  chunks.push(chunk.subarray(0, remaining))
  state.bytes += Math.min(chunk.length, remaining)
  if (chunk.length > remaining) state.truncated = true
}

function executeCommand(
  program: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<{
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  outputTruncated: boolean
  executionMode: CommandExecutionMode
}> {
  return new Promise((resolve, reject) => {
    const executionMode = commandExecutionMode(program)
    const useShell = executionMode === 'windows-shell-shim'
    if (useShell && args.some((arg) => WINDOWS_SHELL_META.test(arg))) {
      reject(new Error('command.run shell-backed arguments contain unsupported metacharacters'))
      return
    }

    const child = spawn(program, args, {
      cwd,
      env: process.env,
      shell: useShell,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    const stdoutState = { bytes: 0, truncated: false }
    const stderrState = { bytes: 0, truncated: false }
    let timedOut = false
    let aborted = false
    let settled = false

    child.stdout.on('data', (chunk: Buffer) => appendBounded(stdout, chunk, stdoutState))
    child.stderr.on('data', (chunk: Buffer) => appendBounded(stderr, chunk, stderrState))
    const stop = () => child.kill()
    const abort = () => { aborted = true; stop() }
    signal.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => { timedOut = true; stop() }, timeoutMs)

    child.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      reject(error)
    })
    child.once('close', (exitCode) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      if (aborted) {
        reject(new Error('command.run cancelled'))
        return
      }
      resolve({
        exitCode,
        stdout: Buffer.concat(stdout).toString('utf-8'),
        stderr: Buffer.concat(stderr).toString('utf-8'),
        timedOut,
        outputTruncated: stdoutState.truncated || stderrState.truncated,
        executionMode,
      })
    })
  })
}

export const commandRunTool: RegisteredTool = {
  name: 'command.run',
  description: 'Run one approved program with structured arguments in a directory inside the active workspace',
  actionRisk: 'external-command',
  inputSchema: {
    type: 'object',
    properties: {
      workspaceId: { type: 'string' },
      cwd: { type: 'string' },
      program: { type: 'string' },
      args: { type: 'array' },
      timeoutMs: { type: 'number' },
    },
    required: ['workspaceId', 'program'],
    additionalProperties: false,
  },
  execute: async (input, context) => {
    if (input.workspaceId !== context.workspaceId) {
      throw new Error('command.run workspaceId must match the active workspace resource')
    }
    const requestedCwd = input.cwd ?? ''
    if (typeof requestedCwd !== 'string') throw new Error('command.run cwd must be a string')
    const cwdTarget = await resolveWorkspaceTarget(context.workspaceRoot, requestedCwd)
    if (cwdTarget.kind !== 'directory') throw new Error('command.run cwd must be a directory')

    if (typeof input.program !== 'string' || !input.program.trim() || input.program.includes('\0') || isAbsolute(input.program)) {
      throw new Error('command.run program must be a command name or workspace-relative executable path')
    }
    const args = input.args ?? []
    if (!Array.isArray(args) || args.length > MAX_ARGUMENTS || args.some((arg) => typeof arg !== 'string' || arg.length > 4096 || arg.includes('\0'))) {
      throw new Error(`command.run args must contain at most ${MAX_ARGUMENTS} bounded strings`)
    }
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
    if (!Number.isSafeInteger(timeoutMs) || Number(timeoutMs) < 1_000 || Number(timeoutMs) > MAX_TIMEOUT_MS) {
      throw new Error(`command.run timeoutMs must be an integer between 1000 and ${MAX_TIMEOUT_MS}`)
    }

    let program = input.program.trim()
    if (/[\\/]/.test(program)) {
      const programTarget = await resolveWorkspaceTarget(context.workspaceRoot, join(cwdTarget.relativePath, program))
      if (programTarget.kind !== 'file') throw new Error('command.run program path must be a regular workspace file')
      program = join(context.workspaceRoot, programTarget.relativePath)
    }
    const cwd = join(context.workspaceRoot, cwdTarget.relativePath)
    const result = await executeCommand(program, args as string[], cwd, Number(timeoutMs), context.signal)
    return {
      workspaceId: context.workspaceId,
      cwd: cwdTarget.relativePath,
      program: input.program,
      args,
      ok: result.exitCode === 0 && !result.timedOut,
      ...result,
    }
  },
}

export function registerCommandTools(registry: ToolRegistry): void {
  if (registeredRegistries.has(registry)) return
  registry.register(commandRunTool)
  registeredRegistries.add(registry)
}
