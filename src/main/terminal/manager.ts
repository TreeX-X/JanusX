import { spawn, type IPty } from 'node-pty'
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import type { TerminalConfig, TerminalInstance } from './types'

const require = createRequire(import.meta.url)
const CONPTY_FILES = ['conpty.dll', 'OpenConsole.exe'] as const

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

function ensureBundledConptyFiles(): void {
  if (process.platform !== 'win32') return

  const packageRoot = dirname(require.resolve('node-pty/package.json'))
  const destDir = join(packageRoot, 'build', 'Release', 'conpty')

  if (CONPTY_FILES.every(file => existsSync(join(destDir, file)))) {
    return
  }

  const sourceDir = findConptySourceDir(packageRoot)
  if (!sourceDir) {
    throw new Error('node-pty bundled conpty.dll is missing')
  }

  mkdirSync(destDir, { recursive: true })
  for (const file of CONPTY_FILES) {
    const source = join(sourceDir, file)
    const dest = join(destDir, file)
    if (!existsSync(dest)) {
      copyFileSync(source, dest)
    }
  }
}

class TerminalManager {
  private instances = new Map<string, TerminalInstance>()

  private spawnPty(shell: string, config: TerminalConfig): IPty {
    ensureBundledConptyFiles()

    const baseOptions = {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: config.cwd,
      env: process.env as Record<string, string>,
      /*-- 显式启用 ConPTY（build≥18309 默认开，显式更稳妥），Windows 有效，非 Windows 忽略 --*/
      useConpty: true,
    }

    return spawn(shell, [], {
      ...baseOptions,
      /*-- 用 node-pty 自带新版 conpty.dll，启用 reflowCursorLine 的前提，对齐 VS Code --*/
      useConptyDll: true,
    })
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
