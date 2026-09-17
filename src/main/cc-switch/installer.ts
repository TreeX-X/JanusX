import { delimiter } from 'path'
import type { CcSwitchToolDescriptor } from './tool-registry'
import { claudeKnownBinDirs, findExecutableOnPath, quotePowerShellPath, readPathValue } from './claude-detector'

const INSTALL_TIMEOUT_MS = 5 * 60_000

interface RunResult {
  exitCode: number
  stdout: string
  stderr: string
}

interface ClaudeInstallerDependencies {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  homeDir: string
  isRegularFile(path: string): Promise<boolean>
  run(file: string, args: readonly string[], options: { timeout: number; pathDirs: string[] }): Promise<RunResult>
}

function npmBinaryNames(platform: NodeJS.Platform): readonly string[] {
  return platform === 'win32' ? ['npm.cmd', 'npm.exe', 'npm'] : ['npm']
}

function lastLines(text: string, count: number): string {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(-count).join('\n')
}

export class ClaudeInstaller {
  private running = false

  constructor(private readonly deps: ClaudeInstallerDependencies) {}

  isBusy(): boolean {
    return this.running
  }

  /** 定位 npm 并给出执行期 PATH 补齐目录；找不到则调用方只能展示手动命令。 */
  async locateNpm(): Promise<{ path: string; pathDirs: string[] } | undefined> {
    const names = npmBinaryNames(this.deps.platform)
    const pathDirs = readPathValue(this.deps.env).split(delimiter).filter(Boolean)
    const isFile = async (candidate: string): Promise<boolean> => {
      try {
        return await this.deps.isRegularFile(candidate)
      } catch {
        return false
      }
    }
    const onPath = await findExecutableOnPath(names, pathDirs, isFile)
    const knownDirs = claudeKnownBinDirs(this.deps.env, this.deps.platform, this.deps.homeDir)
    const npmPath = onPath ?? await findExecutableOnPath(names, knownDirs, isFile)
    if (!npmPath) return undefined
    return { path: npmPath, pathDirs: [...knownDirs, ...pathDirs] }
  }

  buildCommand(npmPath: string, tool: CcSwitchToolDescriptor): { file: string; args: readonly string[]; display: string } {
    const target = `${tool.npmPackage}@latest`
    if (this.deps.platform === 'win32') {
      // 与探测同理走 PowerShell：npm 报错与缺 node 的 cmd 报错都是 GBK，固定 UTF-8 才可读。
      const script = `$OutputEncoding=[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); & ${quotePowerShellPath(npmPath)} i -g ${target}; exit $LASTEXITCODE`
      return {
        file: 'powershell.exe',
        args: ['-NoProfile', '-NonInteractive', '-Command', script],
        display: `& "${npmPath}" i -g ${target}`,
      }
    }
    return { file: npmPath, args: ['i', '-g', target], display: `${npmPath} i -g ${target}` }
  }

  async install(tool: CcSwitchToolDescriptor): Promise<{ success: boolean; command?: string; error?: string }> {
    if (this.running) return { success: false, error: 'Another install is already running.' }
    // 同步置位：检查与置位之间不允许 await，否则两次同步进入的调用会同时通过检查。
    this.running = true
    try {
      const located = await this.locateNpm()
      if (!located) return { success: false, command: tool.manualInstallCommand, error: 'npm was not found. Run the manual command in a terminal.' }
      const command = this.buildCommand(located.path, tool)
      const result = await this.deps.run(command.file, command.args, { timeout: INSTALL_TIMEOUT_MS, pathDirs: located.pathDirs })
      if (result.exitCode !== 0) {
        return {
          success: false,
          command: command.display,
          error: lastLines(`${result.stderr}\n${result.stdout}`, 8) || `Install exited with code ${result.exitCode}.`,
        }
      }
      return { success: true, command: command.display }
    } finally {
      this.running = false
    }
  }
}
