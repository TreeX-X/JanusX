/**
 * src/main/project/runner/command-builder.ts
 *
 * 启动命令构造器
 * 职责：
 * 1. 根据项目类型和配置构造启动命令
 * 2. 处理命令参数、环境变量、工作目录等
 * 3. 支持预启动任务（如 npm install）
 */

import type { LaunchConfiguration } from '../types'
import { ProjectType } from '../types'

/**
 * 命令信息
 */
export interface CommandInfo {
  command: string // 可执行文件或命令
  args: string[] // 参数数组
  displayName: string // 人类可读的显示名称
  preCommand?: { // 预启动命令（如 npm install）
    command: string
    args: string[]
  }
}

/**
 * CommandBuilder - 启动命令构造
 *
 * 设计目标：
 * - 为不同项目类型构造正确的启动命令
 * - 避免命令注入（参数化）
 * - 支持自定义参数和环境变量
 * - 清晰的构造逻辑，易于维护和扩展
 */
export class CommandBuilder {
  /**
   * 构造启动命令
   *
   * @param config 启动配置
   * @returns 命令信息，如果项目类型不支持则返回 null
   */
  static build(config: LaunchConfiguration): CommandInfo | null {
    switch (config.type) {
      // ═══ Node.js 生态 ═══
      case ProjectType.NextJs:
      case ProjectType.Vite:
      case ProjectType.ElectronVite:
      case ProjectType.CreateReactApp:
      case ProjectType.Remix:
        return this.buildNodejsCommand(config)

      // ═══ 编译语言 ═══
      case ProjectType.Rust:
        return this.buildRustCommand(config)

      case ProjectType.Go:
        return this.buildGoCommand(config)

      case ProjectType.CppCMake:
        return this.buildCppCMakeCommand(config)

      case ProjectType.CppMake:
        return this.buildCppMakeCommand(config)

      // ═══ 脚本语言 ═══
      case ProjectType.Django:
        return this.buildDjangoCommand(config)

      case ProjectType.Flask:
        return this.buildFlaskCommand(config)

      case ProjectType.FastAPI:
        return this.buildFastApiCommand(config)

      case ProjectType.Laravel:
        return this.buildLaravelCommand(config)

      // ═══ 自定义 ═══
      case ProjectType.Custom:
        return this.buildCustomCommand(config)

      default:
        return null
    }
  }

  /**
   * ════════════════════════════════════════════
   * Node.js 项目类型
   * ════════════════════════════════════════════
   */

  private static buildNodejsCommand(config: LaunchConfiguration): CommandInfo {
    const pm = config.packageManager || 'npm'
    const script = this.getNodejsScript(config.type)
    const args = [script]

    // 添加自定义参数
    if (config.args) {
      args.push(...config.args)
    }

    return {
      command: pm,
      args: ['run', ...args],
      displayName: `${pm} run ${script}`,
      preCommand: this.shouldInstallDependencies() ? {
        command: pm,
        args: ['install'],
      } : undefined,
    }
  }

  private static getNodejsScript(type: ProjectType): string {
    // 根据项目类型返回默认脚本
    switch (type) {
      case ProjectType.CreateReactApp:
        return 'start'
      default:
        return 'dev'
    }
  }

  /**
   * ════════════════════════════════════════════
   * Rust
   * ════════════════════════════════════════════
   */

  private static buildRustCommand(config: LaunchConfiguration): CommandInfo {
    const args: string[] = []

    // 构建类型
    if (config.buildType === 'Release') {
      args.push('--release')
    }

    // 添加程序参数
    if (config.args) {
      args.push('--')
      args.push(...config.args)
    }

    return {
      command: 'cargo',
      args: ['run', ...args],
      displayName: `cargo run${config.buildType === 'Release' ? ' --release' : ''}`,
    }
  }

  /**
   * ════════════════════════════════════════════
   * Go
   * ════════════════════════════════════════════
   */

  private static buildGoCommand(config: LaunchConfiguration): CommandInfo {
    const args: string[] = ['run', config.mainPackage || '.']

    // 添加程序参数
    if (config.args) {
      args.push(...config.args)
    }

    return {
      command: 'go',
      args,
      displayName: 'go run .',
    }
  }

  /**
   * ════════════════════════════════════════════
   * C++ CMake
   * ════════════════════════════════════════════
   */

  private static buildCppCMakeCommand(config: LaunchConfiguration): CommandInfo {
    const buildDir = this.resolveWorkspacePath(config.buildDir || 'build')
    const buildType = config.buildType || 'Debug'
    const target = config.target || 'app'

    // 分两步：构建 + 运行
    // 这里返回最终的运行命令，构建命令在 CMake Builder 中处理

    const runCommand = this.getExecutablePath(buildDir, target)

    return {
      command: runCommand,
      args: config.args || [],
      displayName: `cmake build && ${runCommand}`,
      preCommand: {
        command: 'cmake',
        args: [
          '--build',
          buildDir,
          '--config',
          buildType,
        ],
      },
    }
  }

  private static buildCppMakeCommand(config: LaunchConfiguration): CommandInfo {
    // Makefile 项目
    const target = config.target || 'all'

    return {
      command: 'make',
      args: [target],
      displayName: `make ${target}`,
    }
  }

  /**
   * ════════════════════════════════════════════
   * Python
   * ════════════════════════════════════════════
   */

  private static buildDjangoCommand(config: LaunchConfiguration): CommandInfo {
    const args = ['manage.py', 'runserver']

    // 添加服务器地址
    if (config.port) {
      args.push(`0.0.0.0:${config.port}`)
    }

    if (config.args) {
      args.push(...config.args)
    }

    return {
      command: config.pythonPath || 'python',
      args,
      displayName: 'python manage.py runserver',
    }
  }

  private static buildFlaskCommand(config: LaunchConfiguration): CommandInfo {
    return {
      command: config.pythonPath || 'python',
      args: ['-m', 'flask', 'run', ...(config.args || [])],
      displayName: 'flask run',
    }
  }

  private static buildFastApiCommand(config: LaunchConfiguration): CommandInfo {
    const args: string[] = ['main:app', '--reload']

    if (config.port) {
      args.push('--port', config.port.toString())
    }

    return {
      command: config.pythonPath || 'python',
      args: ['-m', 'uvicorn', ...args],
      displayName: 'uvicorn main:app --reload',
    }
  }

  /**
   * ════════════════════════════════════════════
   * PHP
   * ════════════════════════════════════════════
   */

  private static buildLaravelCommand(config: LaunchConfiguration): CommandInfo {
    const args = ['artisan', 'serve']

    if (config.port) {
      args.push('--port', config.port.toString())
    }

    if (config.args) {
      args.push(...config.args)
    }

    return {
      command: 'php',
      args,
      displayName: 'php artisan serve',
    }
  }

  /**
   * ════════════════════════════════════════════
   * 自定义
   * ════════════════════════════════════════════
   */

  private static buildCustomCommand(config: LaunchConfiguration): CommandInfo {
    const program = config.program
    if (!program) {
      throw new Error('Program is required for custom configuration')
    }

    return {
      command: program,
      args: config.args || [],
      displayName: program,
    }
  }

  /**
   * ════════════════════════════════════════════
   * 工具方法
   * ════════════════════════════════════════════
   */

  /**
   * 判断是否需要在启动前安装依赖
   */
  private static shouldInstallDependencies(): boolean {
    // 这里可以检查 node_modules 是否存在等
    return false // 暂时禁用自动安装，由用户手动执行
  }

  /**
   * 解析工作区路径
   * ${workspaceFolder} -> 实际项目路径
   */
  private static resolveWorkspacePath(path: string): string {
    // 在实际使用中，这应该替换为真实的项目路径
    // 这里仅作示意
    return path.replace('${workspaceFolder}', '.')
  }

  /**
   * 获取可执行文件路径
   * 处理跨平台问题（Windows .exe vs Unix）
   */
  private static getExecutablePath(buildDir: string, target: string): string {
    const isWindows = process.platform === 'win32'
    const ext = isWindows ? '.exe' : ''
    return `${buildDir}/${target}${ext}`
  }

  /**
   * 构造构建命令（仅用于复杂构建如 CMake）
   */
  static buildBuildCommand(config: LaunchConfiguration): CommandInfo | null {
    switch (config.type) {
      case ProjectType.CppCMake:
        return {
          command: 'cmake',
          args: [
            '-B', config.buildDir || 'build',
            '-DCMAKE_BUILD_TYPE=' + (config.buildType || 'Debug'),
          ],
          displayName: 'cmake configure',
        }

      case ProjectType.Rust:
        return {
          command: 'cargo',
          args: ['build', ...(config.buildType === 'Release' ? ['--release'] : [])],
          displayName: 'cargo build',
        }

      default:
        return null
    }
  }
}

export default CommandBuilder
