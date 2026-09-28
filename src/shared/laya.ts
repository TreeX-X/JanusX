export const LAYA_MODEL_REVISION = 'e4e9ddf21a7b1903b7acffd8814ad4307bf63a67'
export const LAYA_SDK_VERSION = '0.3.21'
export interface LayaSettings { enabled: boolean; pythonPath: string; modelPath: string }
export interface LayaStatus {
  phase: 'disabled' | 'stopped' | 'starting' | 'downloading' | 'ready' | 'failed'
  reason: string
  modelRevision: string
  warmupMs?: number
  lastInferenceMs?: number
}
export type LayaAction = 'status' | 'prepare' | 'warm' | 'stop'
