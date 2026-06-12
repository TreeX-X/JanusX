import { spawn, type IPty } from 'node-pty'
import type { TerminalConfig, TerminalInstance } from './types'

class TerminalManager {
  private instances = new Map<string, TerminalInstance>()

  create(config: TerminalConfig): TerminalInstance {
    const shell = config.shell || (process.platform === 'win32' ? 'powershell.exe' : 'bash')

    const pty = spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: config.cwd,
      env: process.env as Record<string, string>,
      /*-- 显式启用 ConPTY（build≥18309 默认开，显式更稳妥），Windows 有效，非 Windows 忽略 --*/
      useConpty: true,
      /*-- 用 node-pty 自带的新版 conpty.dll，启用 reflowCursorLine 的前提，对齐 VS Code --*/
      useConptyDll: true,
    })

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
