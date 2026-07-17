import type {
  DetectResult,
  LaunchConfig,
  ProjectCommandResult,
  ProjectResult,
  ProjectRunResult,
  ProjectType,
  ProjectTypeSchema,
  RunningProjectDetail,
  RunningProjectSummary,
  ValidationResult,
} from '../../../shared/ipc/project'

export type { LaunchConfig as ProjectConfig } from '../../../shared/ipc/project'

export type ProjectLauncherMode = 'settings' | 'running'

export interface RunningProjectFailureState {
  projects: RunningProjectSummary[]
  selectedProjectId: null
  selectedOutput: string[]
  error: string
}

export interface LatestRequestGuard {
  begin: () => () => boolean
  cancel: () => void
}

export type ProjectErrorSource = 'list' | 'output' | 'run' | 'stop'

export interface ProjectErrorCheckpoint {
  source: ProjectErrorSource
  generation: number
}

export interface ProjectErrorTracker {
  checkpoint: (source: ProjectErrorSource) => ProjectErrorCheckpoint
  record: (source: ProjectErrorSource) => void
  clear: (checkpoint: ProjectErrorCheckpoint) => boolean
  reset: () => void
}

export interface CurrentTaskHandlers<T> {
  onSuccess: (result: T) => void
  onError: (error: unknown) => void
  onFinally?: () => void
}

function unwrap<T>(result: ProjectResult<T>): T {
  if (!result.success) throw new Error(result.error)
  return result.data
}

function ensureSuccess(result: ProjectCommandResult): true {
  if (!result.success) throw new Error(result.error)
  return true
}

export function getProjectLauncherMode(config: LaunchConfig | null): ProjectLauncherMode {
  return config ? 'running' : 'settings'
}

export function getRunningProjectFailureState(
  error: string,
  projects: RunningProjectSummary[],
  failedProjectId?: string,
): RunningProjectFailureState {
  return {
    projects: failedProjectId ? projects.filter((project) => project.id !== failedProjectId) : [],
    selectedProjectId: null,
    selectedOutput: [],
    error,
  }
}

export function getProjectValidationError(result: ValidationResult): string | null {
  if (result.valid) return null
  return `Validation failed: ${result.errors.map((error) => error.message).join('; ')}`
}

export function createLatestRequestGuard(): LatestRequestGuard {
  let generation = 0
  return {
    begin: () => {
      const currentGeneration = ++generation
      return () => generation === currentGeneration
    },
    cancel: () => {
      generation++
    },
  }
}

export function createProjectErrorTracker(): ProjectErrorTracker {
  const generations: Record<ProjectErrorSource, number> = {
    list: 0,
    output: 0,
    run: 0,
    stop: 0,
  }
  let displayed: ProjectErrorCheckpoint | null = null
  return {
    checkpoint: (source) => ({ source, generation: generations[source] }),
    record: (source) => {
      displayed = { source, generation: ++generations[source] }
    },
    clear: (checkpoint) => {
      if (
        displayed?.source !== checkpoint.source ||
        displayed.generation !== checkpoint.generation
      ) {
        return false
      }
      displayed = null
      return true
    },
    reset: () => {
      displayed = null
      for (const source of Object.keys(generations) as ProjectErrorSource[]) {
        generations[source]++
      }
    },
  }
}

export async function executeCurrentTask<T>(
  isCurrent: () => boolean,
  task: (isCurrent: () => boolean) => Promise<T>,
  handlers: CurrentTaskHandlers<T>,
): Promise<void> {
  try {
    const result = await task(isCurrent)
    if (isCurrent()) handlers.onSuccess(result)
  } catch (error) {
    if (isCurrent()) handlers.onError(error)
  } finally {
    if (isCurrent()) handlers.onFinally?.()
  }
}

export function startProjectPolling(
  refresh: (isCurrent: () => boolean) => void | Promise<void>,
  intervalMs: number = 2000,
): () => void {
  let active = true
  let running = false
  const isCurrent = () => active
  const run = () => {
    if (!active || running) return
    running = true
    void Promise.resolve(refresh(isCurrent)).finally(() => {
      running = false
    })
  }
  run()
  const interval = setInterval(run, intervalMs)
  return () => {
    active = false
    clearInterval(interval)
  }
}

export const projectService = {
  async detect(projectPath: string): Promise<ProjectType> {
    return unwrap(await window.electron.project.detect(projectPath)).type
  },

  async detectWithDetails(projectPath: string): Promise<DetectResult> {
    return unwrap(await window.electron.project.detectWithDetails(projectPath))
  },

  async readConfig(projectPath: string): Promise<LaunchConfig | null> {
    return unwrap(await window.electron.project.readConfig(projectPath))
  },

  async writeConfig(projectPath: string, config: LaunchConfig): Promise<true> {
    return ensureSuccess(await window.electron.project.writeConfig(projectPath, config))
  },

  async createDefaultConfig(
    projectPath: string,
    projectType: ProjectType,
    projectName: string,
  ): Promise<LaunchConfig> {
    return unwrap(await window.electron.project.createDefaultConfig(projectPath, projectType, projectName))
  },

  async validateConfig(config: LaunchConfig): Promise<ValidationResult> {
    return unwrap(await window.electron.project.validateConfig(config))
  },

  async start(projectPath: string, configName?: string): Promise<true> {
    unwrap<ProjectRunResult>(await window.electron.project.run(projectPath, configName))
    return true
  },

  async stop(projectId: string): Promise<true> {
    return ensureSuccess(await window.electron.project.stop(projectId))
  },

  async list(): Promise<RunningProjectSummary[]> {
    return unwrap(await window.electron.project.list())
  },

  async get(projectId: string): Promise<RunningProjectDetail> {
    return unwrap(await window.electron.project.get(projectId))
  },

  async schemas(): Promise<ProjectTypeSchema[]> {
    return unwrap(await window.electron.project.schemas())
  },

  async listByWorkspace(workspacePath: string): Promise<RunningProjectSummary[]> {
    const all = await projectService.list()
    return all.filter((project) => project.id.startsWith(`${workspacePath}::`))
  },
}
