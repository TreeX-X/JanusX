/**
 * Project Service — 封装项目运行相关 IPC 调用
 */

export interface ProjectConfig {
  configurations: Array<{ name: string; command: string }>
}

export interface RunningProject {
  id: string
  name: string
  status: string
}

export const projectService = {
  /**
   * 读取项目配置
   */
  async readConfig(workspacePath: string): Promise<ProjectConfig | null> {
    const result = (await window.electron.invoke(
      'project:config:read',
      workspacePath,
    )) as any
    return result.success ? result.data : null
  },

  /**
   * 启动项目
   */
  async start(workspacePath: string, configName: string): Promise<boolean> {
    const result = (await window.electron.invoke(
      'project:run',
      workspacePath,
      configName,
    )) as any
    return result.success
  },

  /**
   * 停止项目
   */
  async stop(projectId: string): Promise<boolean> {
    const result = (await window.electron.invoke(
      'project:stop',
      projectId,
    )) as any
    return result.success
  },

  /**
   * 列出运行中的项目
   */
  async list(): Promise<RunningProject[]> {
    const result = (await window.electron.invoke('project:list')) as any
    return result.success ? result.data : []
  },

  /**
   * 列出指定工作区的运行项目
   */
  async listByWorkspace(workspacePath: string): Promise<RunningProject[]> {
    const all = await this.list()
    return all.filter((p) => p.id.startsWith(workspacePath))
  },
}
