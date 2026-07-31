import ProjectRunner from './runner'

let projectRunner: ProjectRunner | null = null

/** Shared by project IPC and every Janus Chat tool session. */
export function getProjectRunner(): ProjectRunner {
  projectRunner ??= new ProjectRunner(5)
  return projectRunner
}

export async function stopAllProjects(timeout: number = 1500): Promise<void> {
  if (!projectRunner) return
  await projectRunner.stopAll(timeout)
}
