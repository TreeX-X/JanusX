/**
 * src/main/project/runner/runner.ts
 *
 * 项目启动执行模块
 * 职责：
 * 1. 读取启动配置
 * 2. 构造启动命令
 * 3. 启动子进程，管理生命周期
 * 4. 流式输出日志，提取关键信息（端口号等）
 */

import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import type { LaunchConfiguration, LaunchConfig, ProcessHandle, ProcessEvent } from '../types'
import { ProjectType } from '../types'
import ProjectConfig from '../config/project-config'
import CommandBuilder from './command-builder'
import PortExtractor from '../utils/port-extractor'

/**
 * 运行的项目信息
 * 用于跟踪正在运行的进程
 */
interface RunningProject extends ProcessHandle {
  process: ChildProcess
  output: string[]
  outputBuffer: string // 用于缓存未完整的输出行
  eventEmitter: EventEmitter
  terminated: boolean
}

/**
 * ProjectRunner - 项目启动和执行
 *
 * 设计目标：
 * - 管理项目进程的完整生命周期
 * - 流式处理日志输出，实时推送
 * - 自动检测关键信息（如服务器端口）
 * - 支持多项目并行运行
 * - 优雅的错误处理和恢复
 */
export class ProjectRunner extends EventEmitter {
  private runningProjects: Map<string, RunningProject> = new Map()
  private maxConcurrent: number = 5
  private activeCount: number = 0

  constructor(maxConcurrent: number = 5) {
    super()
    this.maxConcurrent = maxConcurrent
  }

  /**
   * 启动项目
   *
   * 流程：
   * 1. 读取项目配置
   * 2. 验证配置有效性
   * 3. 等待可用的进程槽位
   * 4. 构造和启动命令
   * 5. 监听输出和事件
   *
   * @param projectPath 项目根目录
   * @param configName 配置名称（默认 'dev'）
   * @returns 进程句柄
   */
  async run(projectPath: string, configName: string = 'dev'): Promise<ProcessHandle> {
    // 1. 读取配置
    let config = await ProjectConfig.read(projectPath)
    if (!config) {
      throw new Error(`No configuration found for project at ${projectPath}`)
    }

    const launchConfig = ProjectConfig.getConfiguration(config, configName)
    if (!launchConfig) {
      throw new Error(`Configuration '${configName}' not found`)
    }

    // 2. 验证配置
    const validation = ProjectConfig.validate(config)
    if (!validation.valid) {
      const errors = validation.errors.map(e => e.message).join('; ')
      throw new Error(`Configuration validation failed: ${errors}`)
    }

    // 3. 检查并发限制
    if (this.activeCount >= this.maxConcurrent) {
      throw new Error(
        `Maximum concurrent projects (${this.maxConcurrent}) reached. Stop another project first.`
      )
    }

    // 4. 构造命令
    const commandInfo = CommandBuilder.build(launchConfig)
    if (!commandInfo) {
      throw new Error(`Cannot build command for project type: ${launchConfig.type}`)
    }

    // 5. 启动进程
    const processId = this.generateProcessId(projectPath, configName)
    const childProc = this.spawnProcess(commandInfo.command, commandInfo.args, {
      cwd: launchConfig.program || projectPath,
      env: { ...process.env, ...launchConfig.env },
    })

    const runningProject: RunningProject = {
      pid: childProc.pid!,
      config: launchConfig,
      startTime: new Date(),
      port: undefined,
      output: [],
      outputBuffer: '',
      process: childProc,
      eventEmitter: new EventEmitter(),
      terminated: false,
    }

    // 6. 设置事件监听
    this.setupProcessListeners(processId, runningProject, projectPath)

    this.runningProjects.set(processId, runningProject)
    this.activeCount++

    this.emit('project:started', {
      projectId: processId,
      type: launchConfig.type,
      command: commandInfo.displayName,
    })

    return {
      pid: runningProject.pid,
      config: runningProject.config,
      startTime: runningProject.startTime,
      port: runningProject.port,
      output: runningProject.output,
    }
  }

  /**
   * 停止项目
   *
   * 流程：
   * 1. 查找运行中的进程
   * 2. 发送 SIGTERM 信号
   * 3. 等待进程退出（超时后发送 SIGKILL）
   */
  async stop(projectId: string, timeout: number = 5000): Promise<void> {
    const running = this.runningProjects.get(projectId)
    if (!running) {
      throw new Error(`Project ${projectId} is not running`)
    }

    if (running.terminated) {
      return
    }

    running.terminated = true

    // 先发送 SIGTERM
    running.process.kill('SIGTERM')

    // 设置超时强制杀死
    const killTimer = setTimeout(() => {
      if (!running.process.killed) {
        running.process.kill('SIGKILL')
      }
    }, timeout)

    // 等待进程退出
    return new Promise((resolve, reject) => {
      running.process.once('exit', () => {
        clearTimeout(killTimer)
        resolve()
      })
      running.process.once('error', reject)
    })
  }

  /**
   * Stop every running project. Best-effort for app shutdown.
   */
  async stopAll(timeout: number = 1500): Promise<void> {
    const ids = Array.from(this.runningProjects.keys())
    if (ids.length === 0) return

    await Promise.all(
      ids.map(async (id) => {
        try {
          await this.stop(id, timeout)
        } catch {
          // ignore missing/racy entries during shutdown
        }
      }),
    )
  }

  /**
   * 获取运行中的项目
   */
  getRunning(projectId: string): ProcessHandle | null {
    const running = this.runningProjects.get(projectId)
    return running
      ? {
          pid: running.pid,
          config: running.config,
          startTime: running.startTime,
          port: running.port,
          output: running.output,
        }
      : null
  }

  /**
   * 获取所有运行中的项目
   */
  getAllRunning(): Map<string, ProcessHandle> {
    const result = new Map<string, ProcessHandle>()
    this.runningProjects.forEach((running, id) => {
      result.set(id, {
        pid: running.pid,
        config: running.config,
        startTime: running.startTime,
        port: running.port,
        output: running.output,
      })
    })
    return result
  }

  /**
   * ════════════════════════════════════════════
   * 私有工具方法
   * ════════════════════════════════════════════
   */

  /**
   * 生成唯一的进程 ID
   */
  private generateProcessId(projectPath: string, configName: string): string {
    return `${projectPath}::${configName}::${Date.now()}`
  }

  /**
   * 启动子进程
   */
  private spawnProcess(
    command: string,
    args: string[],
    options: any
  ): ChildProcess {
    return spawn(command, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true, // 在 Windows 上需要
    })
  }

  /**
   * 设置进程事件监听
   */
  private setupProcessListeners(
    projectId: string,
    running: RunningProject,
    projectPath: string
  ): void {
    const { process: child } = running

    // 标准输出
    child.stdout?.on('data', (data: Buffer) => {
      this.handleOutput(projectId, running, data.toString(), 'stdout')
    })

    // 错误输出
    child.stderr?.on('data', (data: Buffer) => {
      this.handleOutput(projectId, running, data.toString(), 'stderr')
    })

    // 进程退出
    child.on('exit', (code: number | null, signal: string | null) => {
      this.handleExit(projectId, running, code, signal)
    })

    // 进程错误
    child.on('error', (error: Error) => {
      this.emit('project:error', {
        projectId,
        error: error.message,
      })
    })
  }

  /**
   * 处理进程输出
   * - 累积输出到日志数组
   * - 提取关键信息（端口号）
   * - 发送事件给监听者
   */
  private handleOutput(
    projectId: string,
    running: RunningProject,
    data: string,
    stream: 'stdout' | 'stderr'
  ): void {
    // 缓冲输出，逐行处理
    running.outputBuffer += data
    const lines = running.outputBuffer.split('\n')

    // 保留最后一个不完整的行
    running.outputBuffer = lines.pop() || ''

    for (const line of lines) {
      if (line.trim()) {
        running.output.push(line)

        // 尝试提取端口号
        if (!running.port) {
          const extractedPort = PortExtractor.extract(line)
          if (extractedPort) {
            running.port = extractedPort
            this.emit('project:ready', {
              projectId,
              port: extractedPort,
              url: `http://localhost:${extractedPort}`,
            })
          }
        }

        // 发送日志事件
        this.emit('project:output', {
          projectId,
          stream,
          line,
          timestamp: new Date(),
        })
      }
    }

    // 保持输出数组大小有限（最近 1000 行）
    if (running.output.length > 1000) {
      running.output = running.output.slice(-1000)
    }
  }

  /**
   * 处理进程退出
   */
  private handleExit(
    projectId: string,
    running: RunningProject,
    code: number | null,
    signal: string | null
  ): void {
    this.activeCount--
    this.runningProjects.delete(projectId)

    this.emit('project:exit', {
      projectId,
      exitCode: code,
      signal,
      uptime: Date.now() - running.startTime.getTime(),
    })
  }
}

export default ProjectRunner
