/**
 * src/main/ipc/project-handlers.ts
 *
 * 项目管理 IPC 处理器
 * 职责：
 * 1. 暴露项目检测、配置、启动等接口给前端
 * 2. 处理 IPC 请求和响应
 * 3. 管理全局的 ProjectRunner 实例
 */

import { ipcMain } from 'electron'
import ProjectDetector from '../project/detector/detector'
import ProjectRunner from '../project/runner/runner'
import ProjectConfig from '../project/config/project-config'
import { getProjectTypes } from '../project/config/project-schemas'
import type { LaunchConfig, DetectResult } from '../project/types'

// 全局 ProjectRunner 实例（单例）
let projectRunner: ProjectRunner | null = null

/**
 * 获取或创建 ProjectRunner 实例
 */
function getProjectRunner(): ProjectRunner {
  if (!projectRunner) {
    projectRunner = new ProjectRunner(5) // 最多 5 个并行项目

    // 转发项目运行器的事件到前端
    projectRunner.on('project:started', (event) => {
      // 可选：广播到所有窗口
    })

    projectRunner.on('project:output', (event) => {
      // 实时推送日志到前端
      // mainWindow.webContents.send('project:output', event)
    })

    projectRunner.on('project:ready', (event) => {
      // 项目启动成功，检测到端口
      // mainWindow.webContents.send('project:ready', event)
    })

    projectRunner.on('project:exit', (event) => {
      // 项目退出
      // mainWindow.webContents.send('project:exit', event)
    })
  }

  return projectRunner
}

/**
 * 注册项目管理相关的 IPC 处理器
 *
 * 暴露的接口：
 * - project:detect - 检测项目类型
 * - project:detect-with-details - 详细检测
 * - project:config:read - 读取配置
 * - project:config:write - 写入配置
 * - project:config:create-default - 创建默认配置
 * - project:config:validate - 验证配置
 * - project:run - 启动项目
 * - project:stop - 停止项目
 * - project:list - 列表运行中的项目
 */
export function registerProjectHandlers() {
  // ═══════════════════════════════════════════════════════════
  // 项目检测
  // ═══════════════════════════════════════════════════════════

  /**
   * 检测项目类型
   * @param projectPath 项目根目录
   * @returns 项目类型
   */
  ipcMain.handle('project:detect', async (_, projectPath: string) => {
    try {
      const type = await ProjectDetector.detect(projectPath)
      return {
        success: true,
        data: { type },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

  /**
   * 详细检测项目
   * @param projectPath 项目根目录
   * @returns 检测结果（包括置信度、特征文件、推荐配置）
   */
  ipcMain.handle('project:detect-with-details', async (_, projectPath: string) => {
    try {
      const result = await ProjectDetector.detectWithDetails(projectPath)
      return {
        success: true,
        data: result,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

  // ═══════════════════════════════════════════════════════════
  // 配置管理
  // ═══════════════════════════════════════════════════════════

  /**
   * 读取项目配置
   * @param projectPath 项目根目录
   * @returns .janusX/janusX.launch.json 配置，若不存在返回 null
   */
  ipcMain.handle('project:config:read', async (_, projectPath: string) => {
    try {
      const config = await ProjectConfig.read(projectPath)
      return {
        success: true,
        data: config,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

  /**
   * 写入项目配置
   * @param projectPath 项目根目录
   * @param config 配置对象
   */
  ipcMain.handle('project:config:write', async (_, projectPath: string, config: LaunchConfig) => {
    try {
      await ProjectConfig.write(projectPath, config)
      return {
        success: true,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

  /**
   * 创建默认配置
   * @param projectPath 项目根目录
   * @param projectType 项目类型
   * @param projectName 项目名称
   * @returns 创建的配置
   */
  ipcMain.handle(
    'project:config:create-default',
    async (_, projectPath: string, projectType: string, projectName: string) => {
      try {
        const config = ProjectConfig.createDefault(
          projectPath,
          projectType as any,
          projectName
        )
        return {
          success: true,
          data: config,
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    }
  )

  /**
   * 验证配置
   * @param config 配置对象
   * @returns 验证结果
   */
  ipcMain.handle('project:config:validate', async (_, config: LaunchConfig) => {
    try {
      const result = ProjectConfig.validate(config)
      return {
        success: true,
        data: result,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

  // ═══════════════════════════════════════════════════════════
  // 项目执行
  // ═══════════════════════════════════════════════════════════

  /**
   * 启动项目
   * @param projectPath 项目根目录
   * @param configName 配置名称（默认 'dev'）
   * @returns 进程信息
   */
  ipcMain.handle(
    'project:run',
    async (_, projectPath: string, configName: string = 'dev') => {
      try {
        const runner = getProjectRunner()
        const processHandle = await runner.run(projectPath, configName)

        return {
          success: true,
          data: {
            pid: processHandle.pid,
            config: processHandle.config,
            startTime: processHandle.startTime.toISOString(),
          },
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    }
  )

  /**
   * 停止项目
   * @param projectId 项目 ID（通常是项目路径）
   */
  ipcMain.handle('project:stop', async (_, projectId: string) => {
    try {
      const runner = getProjectRunner()
      await runner.stop(projectId)

      return {
        success: true,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

  /**
   * 获取运行中的项目列表
   * @returns 所有运行中的项目
   */
  ipcMain.handle('project:list', async () => {
    try {
      const runner = getProjectRunner()
      const running = runner.getAllRunning()

      const projects = Array.from(running.entries()).map(([id, handle]) => ({
        id,
        pid: handle.pid,
        type: handle.config.type,
        name: handle.config.name,
        port: handle.port,
        startTime: handle.startTime.toISOString(),
        uptime: Date.now() - handle.startTime.getTime(),
      }))

      return {
        success: true,
        data: projects,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

  /**
   * 获取单个运行中的项目信息
   * @param projectId 项目 ID
   */
  ipcMain.handle('project:get', async (_, projectId: string) => {
    try {
      const runner = getProjectRunner()
      const handle = runner.getRunning(projectId)

      if (!handle) {
        return {
          success: false,
          error: `Project ${projectId} is not running`,
        }
      }

      return {
        success: true,
        data: {
          pid: handle.pid,
          config: handle.config,
          startTime: handle.startTime.toISOString(),
          port: handle.port,
          output: handle.output,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

  // ═══════════════════════════════════════════════════════════
  // Schema 查询
  // ═══════════════════════════════════════════════════════════

  /**
   * 获取所有项目类型 Schema
   * @returns 所有支持的项目类型 Schema 列表
   */
  ipcMain.handle('project:schemas', async () => {
    try {
      return {
        success: true,
        data: getProjectTypes(),
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

}

export { getProjectRunner }

/** Best-effort stop for app shutdown; no-op if runner never started. */
export async function stopAllProjects(timeout: number = 1500): Promise<void> {
  if (!projectRunner) return
  await projectRunner.stopAll(timeout)
}
