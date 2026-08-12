import type { CSSProperties } from 'react'
import {
  getJanusAgentIdentity,
  getJanusIdentityState,
  type JanusAgentIdentityId,
  type JanusIdentityRole,
  type JanusIdentitySize,
  type JanusIdentityState,
} from './janusIdentity'
import { useI18n } from '@/i18n/useI18n'

export interface JanusIdentityCoreProps {
  identity?: JanusAgentIdentityId
  role?: JanusIdentityRole
  state?: JanusIdentityState
  size?: JanusIdentitySize
  className?: string
  showHalo?: boolean
  showScanline?: boolean
  'aria-label'?: string
}

function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function JanusIdentityCore({
  identity = 'subagent',
  role,
  state,
  size = 'pod',
  className,
  showHalo = true,
  showScanline = true,
  'aria-label': ariaLabel,
}: JanusIdentityCoreProps) {
  const { t } = useI18n('janus')
  const spec = getJanusAgentIdentity(identity)
  const activeState = getJanusIdentityState(state ?? spec.defaultState)
  const activeRole = role ?? spec.role

  const agentNameKeyMap: Record<JanusAgentIdentityId, string> = {
    main: 'janus:identity.agent.main',
    coder: 'janus:identity.agent.coder',
    evaluator: 'janus:identity.agent.evaluator',
    abstracter: 'janus:identity.agent.abstracter',
    prompter: 'janus:identity.agent.prompter',
    teammate: 'janus:identity.agent.teammate',
    subagent: 'janus:identity.agent.subagent',
  }
  const stateLabelKeyMap: Record<JanusIdentityState, string> = {
    default: 'janus:identity.state.default',
    scanning: 'janus:identity.state.scanning',
    running: 'janus:identity.state.running',
    done: 'janus:identity.state.done',
    failed: 'janus:identity.state.failed',
  }
  const fallbackAria = t('janus:identity.ariaFallback', {
    name: t(agentNameKeyMap[spec.id]),
    state: t(stateLabelKeyMap[activeState.id]),
  })

  const style = {
    '--janus-identity-role-color': spec.color,
    '--janus-identity-role-glow': spec.glow,
    '--janus-identity-state-color': activeState.color,
    '--janus-identity-state-glow': activeState.glow,
  } as CSSProperties

  return (
    <span
      className={classNames('janus-identity-core', className)}
      data-size={size}
      data-role={activeRole}
      data-state={activeState.id}
      data-state-pattern={activeState.eyePattern}
      role="img"
      aria-label={ariaLabel ?? fallbackAria}
      style={style}
    >
      {showScanline && <span className="janus-identity-scanline" aria-hidden="true" />}
      {showHalo && (
        <span className="janus-identity-halo" aria-hidden="true">
          <span className="janus-identity-ring-outer" />
          <span className="janus-identity-ring-inner" />
        </span>
      )}
      <span className="janus-identity-face" aria-hidden="true">
        <span className="janus-identity-eye" />
        <span className="janus-identity-eye" />
      </span>
    </span>
  )
}
