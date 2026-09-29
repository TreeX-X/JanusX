import { app } from 'electron'
import { join } from 'node:path'
import { z } from 'zod'
import { configService } from '../config/service'
import { LAYA_MODEL_REVISION, type LayaAction, type LayaStatus } from '../../shared/laya'
import { LayaProcess } from './laya-process'
import { DECISION_TEMPLATE_VERSION, parseDecisionAnswers, type DecisionScorer } from './decision-scorer'
import { knowledgeDecisionStage } from './decision-stage'
import { calibrateDecisionAnswers, loadLayaCalibration, type LayaCalibration } from './laya-calibration'

let processManager: LayaProcess | undefined
let calibration: LayaCalibration | undefined
function resourcePath(): string { return app.isPackaged ? join(process.resourcesPath, 'laya') : join(app.getAppPath(), 'resources/laya') }
function manager(): LayaProcess {
  if (!processManager) {
    processManager = new LayaProcess(resourcePath())
    app.once('will-quit', () => processManager?.stop('shutdown'))
  }
  return processManager
}
export async function syncLayaSettings(): Promise<void> {
  const settings = await configService.getKnowledgeSettings()
  const modelPath = settings.laya?.modelPath || join(app.getPath('userData'), 'laya-weights', LAYA_MODEL_REVISION)
  try { calibration = settings.laya?.enabled ? await loadLayaCalibration(modelPath, resourcePath()) : undefined }
  catch (error) { calibration = undefined; manager().stop('calibration-invalid'); throw error }
  manager().configure({ enabled: settings.enabled && settings.laya?.enabled === true,
    pythonPath: settings.laya?.pythonPath ?? '', modelPath })
}
export const layaScorer: DecisionScorer = {
  get identity() { return { provider: 'laya', modelRevision: LAYA_MODEL_REVISION, templateVersion: DECISION_TEMPLATE_VERSION, calibrationId: calibration?.id ?? null } },
  timeoutMs: 30000,
  available: () => manager().status().phase === 'ready',
  score: async (input, signal) => {
    const previous = calibration?.id
    await syncLayaSettings()
    if (previous !== calibration?.id) return { status: 'unavailable', reason: 'calibration-changed' }
    const activeCalibration = calibration
    const raw = await manager().score(input, signal)
    if (!activeCalibration || !raw || typeof raw !== 'object' || !('answers' in raw)) return raw
    const answers = parseDecisionAnswers(raw.answers)
    return answers ? { ...raw, answers: calibrateDecisionAnswers(answers, activeCalibration) } : raw
  },
}
export async function controlLaya(action: LayaAction): Promise<LayaStatus> {
  z.enum(['status', 'prepare', 'warm', 'stop']).parse(action)
  await syncLayaSettings()
  if (action === 'prepare' || action === 'warm') return manager().start(action === 'prepare')
  if (action === 'stop') manager().stop()
  return manager().status()
}
export function registerLayaScorer(): void {
  knowledgeDecisionStage.configureScorer(layaScorer)
  void syncLayaSettings().then(() => { if (manager().status().phase === 'stopped') void manager().start() }).catch(() => manager().stop('configuration-error'))
}
