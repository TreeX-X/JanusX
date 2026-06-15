/**
 * src/main/project/index.ts
 *
 * 项目启动模块的公共入口
 * 统一导出所有相关的类和接口
 */

// ═══════════════════════════════════════════════════════════
// 类型导出
// ═══════════════════════════════════════════════════════════
export type {
  LaunchConfig,
  LaunchConfiguration,
  DetectResult,
  ProjectTypeSchema,
  SchemaField,
  ValidationResult,
  ProcessHandle,
  ProcessEvent,
  ProjectUIState,
  ConfigFormState,
  CompilerInfo,
  CMakeInfo,
} from './types'

export { ProjectType } from './types'

// ═══════════════════════════════════════════════════════════
// 配置模块导出
// ═══════════════════════════════════════════════════════════
export { default as ProjectConfig } from './config/project-config'
export { PROJECT_SCHEMAS, getProjectSchema, getProjectTypes, detectByFeatures } from './config/project-schemas'

// ═══════════════════════════════════════════════════════════
// 检测模块导出
// ═══════════════════════════════════════════════════════════
export { ProjectDetector } from './detector/detector'

// ═══════════════════════════════════════════════════════════
// 执行模块导出
// ═══════════════════════════════════════════════════════════
export { ProjectRunner } from './runner/runner'
export { default as CommandBuilder } from './runner/command-builder'

// ═══════════════════════════════════════════════════════════
// 工具导出
// ═══════════════════════════════════════════════════════════
export { PortExtractor } from './utils/port-extractor'

/**
 * 使用示例：
 *
 * // 检测项目
 * import { ProjectDetector } from '@/main/project'
 * const result = await ProjectDetector.detectWithDetails('/path/to/project')
 *
 * // 读取配置
 * import { ProjectConfig } from '@/main/project'
 * const config = await ProjectConfig.read('/path/to/project')
 *
 * // 启动项目
 * import { ProjectRunner } from '@/main/project'
 * const runner = new ProjectRunner()
 * const handle = await runner.run('/path/to/project', 'dev')
 *
 * // 通过 IPC 使用
 * import { registerProjectHandlers } from '@/main/ipc/project-handlers'
 * registerProjectHandlers()
 *
 * // 在前端
 * const result = await window.electron.ipcRenderer.invoke(
 *   'project:detect',
 *   '/path/to/project'
 * )
 */
