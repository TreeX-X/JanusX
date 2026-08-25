import type { CSSProperties } from 'react'
import type { Terminal } from '@/types'
import type { SubAgentRun, SubAgentRunRole, SubAgentRunStatus } from '../../../../shared/subAgentRun'
import { getJanusAgentIdentity, type JanusAgentIdentityId, type JanusIdentityState } from './janusIdentity'

export type JanusT = (key: string, options?: Record<string, unknown>) => string

export const SUBAGENT_STATUS_KEY: Record<SubAgentRunStatus, string> = {
  queued: 'janus:subagent.status.queued',
  running: 'janus:subagent.status.running',
  'waiting-approval': 'janus:subagent.status.waitingApproval',
  done: 'janus:subagent.status.done',
  failed: 'janus:subagent.status.failed',
  cancelled: 'janus:subagent.status.cancelled',
}

export function roleIdentity(role: SubAgentRunRole): JanusAgentIdentityId {
  if (role === 'main' || role === 'coder' || role === 'evaluator' || role === 'abstracter' || role === 'prompter') return role
  return 'subagent'
}

export function runIdentityState(status: SubAgentRunStatus): JanusIdentityState {
  if (status === 'running') return 'running'
  if (status === 'waiting-approval') return 'scanning'
  if (status === 'done') return 'done'
  if (status === 'failed' || status === 'cancelled') return 'failed'
  return 'default'
}

export function previewIdentityState(run: SubAgentRun | null): JanusIdentityState {
  if (!run) return 'default'
  if (run.role !== 'main') return runIdentityState(run.status)
  if (run.status === 'waiting-approval') return 'scanning'
  if (run.status === 'failed' || run.status === 'cancelled') return 'failed'
  if (run.status === 'done') return 'done'
  return 'default'
}

export function formatRunAge(value: string, t: JanusT): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return t('janus:island.age.unknown')
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 5) return t('janus:island.age.now')
  if (seconds < 60) return t('janus:island.age.seconds', { n: seconds })
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('janus:island.age.minutes', { n: minutes })
  return t('janus:island.age.hours', { n: Math.floor(minutes / 60) })
}

export function terminalProviderLabel(preset: Terminal['preset'], t: JanusT): string {
  return t(`janus:terminal.provider.${preset}`)
}

export function terminalStatusLabel(status: Terminal['status'], t: JanusT): string {
  return t(`janus:terminal.status.${status}`)
}

export function runEngineLabel(run: SubAgentRun, t: JanusT): string {
  return run.engine ? terminalProviderLabel(run.engine, t) : run.source
}

export function runRoleLabel(role: SubAgentRunRole, t: JanusT): string {
  const identity = roleIdentity(role)
  const roleKey = identity === 'subagent' ? 'subagent' : identity
  return t(`janus:identity.roleTag.${roleKey}`)
}

export function runtimeRoleStyle(role: SubAgentRunRole): CSSProperties {
  const identity = getJanusAgentIdentity(roleIdentity(role))
  return {
    '--janus-runtime-role-color': identity.color,
    '--janus-runtime-role-glow': identity.glow,
  } as CSSProperties
}

export function faceClass(mode: 'sleep' | 'order' | 'analytics' | 'running'): string {
  if (mode === 'analytics') return 'mode-analytics'
  if (mode === 'running') return 'mode-running'
  return 'mode-order'
}
