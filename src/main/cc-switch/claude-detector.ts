import { stat } from 'fs/promises'
import { homedir } from 'os'
import { delimiter, isAbsolute, join, resolve } from 'path'
import { execa } from 'execa'
import type { CcSwitchBinarySource, CcSwitchDetectResult } from '../../shared/ipc/cc-switch'
import { getCcSwitchTool } from './tool-registry'

const PROBE_TIMEOUT_MS = 10_000

export const CC_SWITCH_EXISTING_TERMINAL_NOTICE =
  'Restart existing terminals for the updated PATH to take effect.'

interface CommandResult {
  exitCode: number
  stdout: string
  stderr: string
  timedOut?: boolean
}

interface ClaudeDetectorDependencies {
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
  homeDir: string
  isRegularFile(path: string): Promise<boolean>
  run(file: string, args: readonly string[]): Promise<CommandResult>
}

export interface ResolvedCliBinary {
  path: string
  source: CcSwitchBinarySource
}

function binaryNames(platform: NodeJS.Platform): readonly string[] {
  return platform === 'win32' ? ['claude.cmd', 'claude.exe', 'claude'] : ['claude']
}

/** 大小写不敏感地读取 PATH（win32 下键名可能是 Path）。 */
export function readPathValue(env: NodeJS.ProcessEnv): string {
  return Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? ''
}

export function claudeKnownBinDirs(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, homeDir: string): string[] {
  if (platform === 'win32') {
    const dirs: string[] = []
    if (env.APPDATA) dirs.push(join(env.APPDATA, 'npm'))
    if (env.LOCALAPPDATA) dirs.push(join(env.LOCALAPPDATA, 'Programs', 'claude'))
    if (env.ProgramFiles) dirs.push(join(env.ProgramFiles, 'nodejs'))
    return dirs
  }
  const dirs = [
    join(homeDir, '.local', 'bin'),
    join(homeDir, '.npm-global', 'bin'),
    '/usr/local/bin',
    ...(platform === 'darwin' ? ['/opt/homebrew/bin'] : []),
  ]
  return [...new Set(dirs)]
}

export async function findExecutableOnPath(
  names: readonly string[],
  searchDirs: readonly string[],
  isRegularFile: (path: string) => Promise<boolean>,
): Promise<string | undefined> {
  for (const directory of searchDirs) {
    for (const name of names) {
      const candidate = resolve(directory, name)
      if (!isAbsolute(candidate)) continue
      try {
        if (await isRegularFile(candidate)) return candidate
      } catch {
        continue
      }
    }
  }
  return undefined
}

function lastLines(text: string, count: number): string {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(-count).join('\n')
}

function parseVersion(output: string): string | undefined {
  return output.match(/\b(\d+\.\d+\.\d+(?:-[\w.]+)?)\b/)?.[1]
}

async function defaultRun(file: string, args: readonly string[]): Promise<CommandResult> {
  try {
    const result = await execa(file, args, {
      timeout: PROBE_TIMEOUT_MS,
      reject: false,
      windowsHide: true,
    })
    return { exitCode: result.exitCode ?? 1, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const failure = error as { exitCode?: number; stdout?: string; stderr?: string; timedOut?: boolean }
    return {
      exitCode: failure.exitCode ?? 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
      timedOut: failure.timedOut,
    }
  }
}

/** win32 下 .cmd/.bat 必须经 cmd /D /S /C call 调用，绝不裸调工具名（防劫持与闪窗）。 */
function versionProbeCommand(platform: NodeJS.Platform, binaryPath: string): { file: string; args: readonly string[] } {
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(binaryPath)) {
    return { file: 'cmd.exe', args: ['/D', '/S', '/C', `call "${binaryPath}" --version`] }
  }
  return { file: binaryPath, args: ['--version'] }
}

const defaultDependencies: ClaudeDetectorDependencies = {
  env: process.env,
  platform: process.platform,
  homeDir: homedir(),
  isRegularFile: async path => (await stat(path)).isFile(),
  run: defaultRun,
}

export class ClaudeDetector {
  constructor(private readonly deps: ClaudeDetectorDependencies = defaultDependencies) {}

  async findCandidate(): Promise<ResolvedCliBinary | undefined> {
    const names = binaryNames(this.deps.platform)
    const pathDirs = readPathValue(this.deps.env).split(delimiter).filter(Boolean)
    const onPath = await findExecutableOnPath(names, pathDirs, path => this.isRegularAbsoluteFile(path))
    if (onPath) return { path: onPath, source: 'path' }
    const knownDirs = claudeKnownBinDirs(this.deps.env, this.deps.platform, this.deps.homeDir)
    const known = await findExecutableOnPath(names, knownDirs, path => this.isRegularAbsoluteFile(path))
    if (known) return { path: known, source: 'known-location' }
    return undefined
  }

  async detect(): Promise<CcSwitchDetectResult> {
    const tool = getCcSwitchTool('claude')
    const manualHint = tool?.manualInstallCommand ?? 'npm i -g @anthropic-ai/claude-code@latest'
    const candidate = await this.findCandidate()
    if (!candidate) {
      return { toolId: 'claude', installed: false, runnable: false, hint: manualHint }
    }
    const probe = versionProbeCommand(this.deps.platform, candidate.path)
    const result = await this.deps.run(probe.file, probe.args)
    if (result.exitCode !== 0) {
      return {
        toolId: 'claude',
        installed: true,
        runnable: false,
        path: candidate.path,
        source: candidate.source,
        hint: result.timedOut
          ? 'Claude Code timed out on --version. Reinstall it and retry.'
          : lastLines(`${result.stderr}\n${result.stdout}`, 4) || `Claude Code exited with code ${result.exitCode}.`,
      }
    }
    const version = parseVersion(`${result.stdout}\n${result.stderr}`)
    if (!version) {
      return {
        toolId: 'claude',
        installed: true,
        runnable: false,
        path: candidate.path,
        source: candidate.source,
        hint: 'Claude Code ran but reported no parseable version. Reinstall it and retry.',
      }
    }
    return {
      toolId: 'claude',
      installed: true,
      runnable: true,
      version,
      path: candidate.path,
      source: candidate.source,
      existingTerminalNotice: CC_SWITCH_EXISTING_TERMINAL_NOTICE,
    }
  }

  private async isRegularAbsoluteFile(candidate: string): Promise<boolean> {
    if (!isAbsolute(candidate)) return false
    try {
      return await this.deps.isRegularFile(candidate)
    } catch {
      return false
    }
  }
}

export const claudeDetector = new ClaudeDetector()
