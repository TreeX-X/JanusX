import { spawn, type ChildProcess } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import type { KnowledgeAutomationSettings, KnowledgeStageModel } from '../../shared/knowledge-automation'
import { detectLocalEnvironment, localEndpoint } from './knowledge-local-environment'

let process: ChildProcess | undefined
let identity = ''
let contextTokens = 0
let lifetime = new AbortController()
let stopping: Promise<void> = Promise.resolve()
let busy = false
let blocked = false
let idleTimer: ReturnType<typeof setTimeout> | undefined

export function setKnowledgeLocalEnabled(enabled: boolean): void { blocked = !enabled }

export function stopKnowledgeLocalModel(): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = undefined
  lifetime.abort(); lifetime = new AbortController()
  const child = process
  if (!child) return stopping
  process = undefined; identity = ''; contextTokens = 0
  stopping = new Promise<void>((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return }
    const timer = setTimeout(() => reject(new Error('local-model-stop-timeout')), 10000)
    child.once('exit', () => { clearTimeout(timer); resolve() })
    child.once('error', () => { clearTimeout(timer); resolve() })
    child.kill()
  })
  // Callers such as app shutdown may be synchronous; retain the rejection for the next start.
  void stopping.catch(() => undefined)
  return stopping
}

export async function withKnowledgeLocalModel<T>(settings: KnowledgeAutomationSettings, model: KnowledgeStageModel, signal: AbortSignal,
  request: (context: number, signal: AbortSignal) => Promise<T>): Promise<T> {
  if (!settings.local.enabled || blocked) throw new Error('local-model-disabled')
  if (busy) throw new Error('local-model-busy')
  busy = true
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = undefined
  try {
    const nextIdentity = JSON.stringify([settings.local, model.model])
    if (process && identity !== nextIdentity) await stopKnowledgeLocalModel()
    const active = AbortSignal.any([signal, lifetime.signal])
    await stopping
    active.throwIfAborted()
    if (blocked) throw new Error('local-model-disabled')
    if (!process) {
      const report = await detectLocalEnvironment(settings.local, active)
      if (!report.ok) throw new Error(report.reason)
      active.throwIfAborted()
      if (blocked) throw new Error('local-model-disabled')
      contextTokens = report.selectedContextTokens
      if (report.mode !== 'service') {
        const url = localEndpoint(settings.local.endpoint)
        const child = spawn(settings.local.serverPath, ['-m', settings.local.modelPath, '--alias', model.model,
          '--host', url.hostname.replace(/[[\]]/g, ''), '--port', url.port || '80', '-c', String(contextTokens),
          '-np', '1', '-ngl', report.mode === 'gpu' ? 'all' : '0', '--device', report.device ?? 'none',
          '--fit', 'off', '--jinja', '--no-context-shift', '--cache-ram', '0'], { shell: false, windowsHide: true, stdio: 'ignore' })
        process = child; identity = nextIdentity
        const clear = () => { if (process === child) { process = undefined; identity = ''; contextTokens = 0 } }
        child.once('error', clear); child.once('exit', clear)
        let ready = false
        for (let index = 0; index < 180; index++) {
          active.throwIfAborted()
          if (process !== child) throw new Error('local-model-start-failed')
          try {
            const response = await fetch(new URL('/health', url), { signal: AbortSignal.any([active, AbortSignal.timeout(1000)]), redirect: 'error' })
            await response.body?.cancel()
            if (response.ok) { ready = true; break }
          } catch { active.throwIfAborted() }
          await delay(500, undefined, { signal: active })
        }
        if (!ready) throw new Error('local-model-start-timeout')
        const props = await fetch(new URL('/props', url), { signal: active, redirect: 'error' })
        const data = await props.json() as { default_generation_settings?: { n_ctx?: number } }
        if (!props.ok || data.default_generation_settings?.n_ctx !== contextTokens) throw new Error('local-context-mismatch')
      }
    }
    active.throwIfAborted()
    return await request(contextTokens, active)
  } catch (error) {
    await stopKnowledgeLocalModel()
    throw error
  } finally {
    busy = false
    if (process) {
      idleTimer = setTimeout(() => { void stopKnowledgeLocalModel().catch(() => undefined) }, 180000)
      idleTimer.unref?.()
    }
  }
}
