import { z } from 'zod'
import { defaultKnowledgeAutomation, type KnowledgeLocalEnvironment } from '../../shared/knowledge-automation'
import type { KnowledgeSettings } from '../../shared/knowledge-settings'
import { configService } from '../config/service'
import { SerialQueue } from '../lib/atomic-file'
import { detectLocalEnvironment } from './knowledge-local-environment'
import { setKnowledgeLocalEnabled, stopKnowledgeLocalModel } from './knowledge-local-runtime'
import { knowledgeLocalResources } from './knowledge-local-resources'

const writes = new SerialQueue()
let detection: AbortController | undefined
const localInput = z.object({ endpoint: z.string().max(2048), serverPath: z.string().max(4096), modelPath: z.string().max(4096),
  contextTokens: z.number().int().nonnegative(), enabled: z.boolean() }).strict()

/** General saves cannot enable local execution or overwrite an independently validated configuration. */
export function updateKnowledgeSettingsFromRenderer(partial: Partial<KnowledgeSettings>): Promise<KnowledgeSettings> {
  return writes.run(async () => {
    const current = await configService.getKnowledgeSettings()
    const automation = partial.automation ? { ...partial.automation, local: (current.automation ?? defaultKnowledgeAutomation()).local } : current.automation
    return configService.updateKnowledgeSettings({ ...partial, automation })
  })
}

export async function configureKnowledgeLocalModel(input: unknown): Promise<{ settings: KnowledgeSettings; report: KnowledgeLocalEnvironment }> {
  const local = localInput.parse(input)
  if (['checking', 'downloading', 'verifying', 'extracting'].includes(knowledgeLocalResources.status().phase)) throw new Error('local-install-busy')
  detection?.abort()
  const controller = new AbortController(); detection = controller
  if ((await configService.getKnowledgeSettings()).automation?.local.enabled) throw new Error('local-model-already-enabled')
  if (!(await configService.getExperimentalFeatures()).knowledge) throw new Error('knowledge-disabled')
  controller.signal.throwIfAborted()
  const report = await detectLocalEnvironment(local, controller.signal)
  controller.signal.throwIfAborted()
  if (!report.ok) return { settings: await configService.getKnowledgeSettings(), report }
  return writes.run(async () => {
    controller.signal.throwIfAborted()
    if (!(await configService.getExperimentalFeatures()).knowledge) throw new Error('knowledge-disabled')
    const current = await configService.getKnowledgeSettings()
    controller.signal.throwIfAborted()
    const settings = await configService.updateKnowledgeSettings({ automation: { ...(current.automation ?? defaultKnowledgeAutomation()), local: { ...local, enabled: true } } })
    controller.signal.throwIfAborted()
    setKnowledgeLocalEnabled(true)
    return { settings, report }
  })
}

export async function disableKnowledgeLocalModel(): Promise<void> {
  const cancelled = cancelKnowledgeLocalSetup()
  setKnowledgeLocalEnabled(false)
  const stopped = stopKnowledgeLocalModel()
  const saved = writes.run(async () => {
    const current = await configService.getKnowledgeSettings(), automation = current.automation ?? defaultKnowledgeAutomation()
    await configService.updateKnowledgeSettings({ automation: { ...automation, local: { ...automation.local, enabled: false } } })
  })
  await Promise.all([stopped, saved, cancelled])
}

export async function startKnowledgeLocalResources() {
  detection?.abort()
  const controller = new AbortController(); detection = controller
  if (!(await configService.getExperimentalFeatures()).knowledge) throw new Error('knowledge-disabled')
  if ((await configService.getKnowledgeSettings()).automation?.local.enabled) throw new Error('local-model-already-enabled')
  controller.signal.throwIfAborted()
  return knowledgeLocalResources.start()
}

export function cancelKnowledgeLocalSetup(): Promise<void> {
  detection?.abort(); detection = undefined
  return knowledgeLocalResources.cancel()
}
