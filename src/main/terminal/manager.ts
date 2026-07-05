import { spawn, type IPty } from 'node-pty'
import { existsSync, readdirSync } from 'fs'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import type { TerminalConfig, TerminalInstance } from './types'
import { logTerminalDiagnostic } from './diagnostics'

const require = createRequire(import.meta.url)
const CONPTY_FILES = ['conpty.dll', 'OpenConsole.exe'] as const
const TERMINAL_OUTPUT_BUFFER_LIMIT = 1_000_000

function findConptySourceDir(packageRoot: string): string | null {
  const prebuildDir = join(packageRoot, 'prebuilds', `${process.platform}-${process.arch}`, 'conpty')
  if (CONPTY_FILES.every(file => existsSync(join(prebuildDir, file)))) {
    return prebuildDir
  }

  const thirdPartyRoot = join(packageRoot, 'third_party', 'conpty')
  if (!existsSync(thirdPartyRoot)) return null

  const archDir = process.arch === 'arm64' ? 'win10-arm64' : 'win10-x64'
  for (const version of readdirSync(thirdPartyRoot)) {
    const candidate = join(thirdPartyRoot, version, archDir)
    if (CONPTY_FILES.every(file => existsSync(join(candidate, file)))) {
      return candidate
    }
  }

  return null
}

function hasBundledConptyFiles(): boolean {
  if (process.platform !== 'win32') return false

  const packageRoot = dirname(require.resolve('node-pty/package.json'))
  const sourceDir = findConptySourceDir(packageRoot)
  if (sourceDir) {
    logTerminalDiagnostic('conpty source ready', { packageRoot, sourceDir })
    return true
  }

  const destDir = join(packageRoot, 'build', 'Release', 'conpty')

  if (CONPTY_FILES.every(file => existsSync(join(destDir, file)))) {
    logTerminalDiagnostic('conpty build release ready', { packageRoot, destDir })
    return true
  }

  logTerminalDiagnostic('conpty files missing', { packageRoot, destDir })
  return false
}

class TerminalManager {
  private instances = new Map<string, TerminalInstance>()

  private spawnPty(shell: string, config: TerminalConfig): IPty {
    const useBundledConptyDll = hasBundledConptyFiles()

    const baseOptions = {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: config.cwd,
      env: {
        ...(process.env as Record<string, string>),
        ...(config.env ?? {}),
      },
      /*-- 显式启用 ConPTY（build≥18309 默认开，显式更稳妥），Windows 有效，非 Windows 忽略 --*/
      useConpty: true,
    }

    try {
      const pty = spawn(shell, [], {
        ...baseOptions,
        useConptyDll: useBundledConptyDll,
      })
      logTerminalDiagnostic('pty spawned', {
        id: config.id,
        cwd: config.cwd,
        shell,
        useConptyDll: useBundledConptyDll,
        pid: pty.pid,
      })
      return pty
    } catch (err) {
      logTerminalDiagnostic('pty spawn failed', {
        id: config.id,
        cwd: config.cwd,
        shell,
        useConptyDll: useBundledConptyDll,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      })
      if (!useBundledConptyDll) throw err

      try {
        const fallbackPty = spawn(shell, [], {
          ...baseOptions,
          useConptyDll: false,
        })
        logTerminalDiagnostic('pty spawned with system conpty fallback', {
          id: config.id,
          cwd: config.cwd,
          shell,
          pid: fallbackPty.pid,
        })
        return fallbackPty
      } catch (fallbackErr) {
        logTerminalDiagnostic('pty system conpty fallback failed', {
          id: config.id,
          cwd: config.cwd,
          shell,
          error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
          stack: fallbackErr instanceof Error ? fallbackErr.stack : undefined,
        })
        throw fallbackErr
      }
    }
  }

  create(config: TerminalConfig): TerminalInstance {
    const shell = config.shell || (process.platform === 'win32' ? 'powershell.exe' : 'bash')

    const pty = this.spawnPty(shell, config)

    const instance: TerminalInstance = {
      id: config.id,
      pty,
      config,
      status: 'running',
      createdAt: Date.now(),
      outputBuffer: '',
      outputSeq: 0,
    }

    this.instances.set(config.id, instance)

    // 自动执行预设命令
    if (config.autoCommand) {
      setTimeout(() => {
        // 先输入命令文本
        pty.write(config.autoCommand!)
        // 再发送回车键触发执行
        setTimeout(() => pty.write('\r'), 80)
      }, 800)
    }

    return instance
  }

  write(id: string, data: string): void {
    const instance = this.instances.get(id)
    if (instance) {
      instance.pty.write(data)
    }
  }

  resize(id: string, cols: number, rows: number): void {
    const instance = this.instances.get(id)
    if (instance) {
      instance.pty.resize(cols, rows)
    }
  }

  appendOutput(id: string, data: string): number | null {
    const instance = this.instances.get(id)
    if (!instance) return null

    instance.outputSeq += 1
    instance.outputBuffer += data
    if (instance.outputBuffer.length > TERMINAL_OUTPUT_BUFFER_LIMIT) {
      instance.outputBuffer = instance.outputBuffer.slice(-TERMINAL_OUTPUT_BUFFER_LIMIT)
    }
    return instance.outputSeq
  }

  getOutputReplay(id: string): { data: string; seq: number } | null {
    const instance = this.instances.get(id)
    if (!instance) return null
    return {
      data: instance.outputBuffer,
      seq: instance.outputSeq,
    }
  }

  kill(id: string): void {
    const instance = this.instances.get(id)
    if (instance) {
      try {
        instance.pty.kill()
      } catch {
        // 进程可能已退出
      }
      instance.status = 'exited'
      this.instances.delete(id)
    }
  }

  killAll(): void {
    for (const [id] of this.instances) {
      this.kill(id)
    }
  }

  getInstance(id: string): TerminalInstance | undefined {
    return this.instances.get(id)
  }

  listInstances(): TerminalInstance[] {
    return Array.from(this.instances.values())
  }
}

export const terminalManager = new TerminalManager()
