import type { ExperimentalFeatures } from '../../../shared/ipc/experimental'

export type { ExperimentalFeatures }

export async function getExperimentalFeatures(): Promise<ExperimentalFeatures> {
  return window.electron.experimental.get()
}

export async function updateExperimentalFeatures(
  settings: Partial<ExperimentalFeatures>,
): Promise<ExperimentalFeatures> {
  return window.electron.experimental.update(settings)
}
