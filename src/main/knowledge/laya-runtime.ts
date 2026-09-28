import { app } from 'electron'
import { join } from 'node:path'
import { z } from 'zod'
import { configService } from '../config/service'
import { LAYA_MODEL_REVISION, type LayaAction, type LayaStatus } from '../../shared/laya'
import { LayaProcess } from './laya-process'
import { DECISION_TEMPLATE_VERSION, type DecisionScorer } from './decision-scorer'
import { knowledgeDecisionStage } from './decision-stage'

let processManager: LayaProcess | undefined
function manager(): LayaProcess {
  if (!processManager) {
    processManager = new LayaProcess(app.isPackaged ? join(process.resourcesPath, 'laya') : join(app.getAppPath(), 'resources/laya'))
    app.once('will-quit', () => processManager?.stop('shutdown'))
  }
  return processManager
}
export async function syncLayaSettings(): Promise<void> {
  const settings = await configService.getKnowledgeSettings()
  manager().configure({ enabled: settings.enabled && settings.laya?.enabled === true,
    pythonPath: settings.laya?.pythonPath ?? '', modelPath: settings.laya?.modelPath || join(app.getPath('userData'), 'laya-weights', LAYA_MODEL_REVISION) })
}
export const layaScorer: DecisionScorer = {
  identity: { provider: 'laya', modelRevision: LAYA_MODEL_REVISION, templateVersion: DECISION_TEMPLATE_VERSION, calibrationId: null },
  timeoutMs: 30000,
  available: () => manager().status().phase === 'ready',
  score: async (input, signal) => { await syncLayaSettings(); return manager().score(input, signal) },
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
